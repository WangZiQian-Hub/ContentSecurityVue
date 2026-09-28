from copy import deepcopy
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from .adapters import SourceAdapter
from .calculation import compute_metric, judge
from .core import BusinessError, digest, now, uid
from .models import (
    Evidence,
    Event,
    Export,
    Metric,
    MetricResult,
    MetricRevision,
    Plan,
    Preflight,
    RecordLink,
    Run,
    Task,
)
from .repositories import Repository
from .registry import route
from .schemas import EvaluationConfig, SourceContext


def source_hash(source: SourceContext) -> str:
    return digest(source.model_dump(exclude={"content_hash"}))


class EvaluationService:
    def __init__(self, repository: Repository, adapter: SourceAdapter):
        self.repo, self.adapter = repository, adapter

    def contexts(self, kind: str, keyword: str = "", source_id: str = "", version_id: str = "") -> dict:
        try:
            sources = self.adapter.contexts(kind, keyword)
            sources = [
                s
                for s in sources
                if (not source_id or s.entity_id == source_id) and (not version_id or s.version_id == version_id)
            ]
            return {
                "resolution": "available",
                "candidates": [self.public_source(s) for s in sources],
                "allowed_actions": ["preflight"],
                "issues": [],
            }
        except BusinessError as error:
            return {
                "resolution": "unavailable",
                "candidates": [],
                "allowed_actions": [],
                "issues": [{"field": "source_refs", "reason_code": error.reason, "message": error.message}],
            }

    @staticmethod
    def public_source(source: SourceContext) -> dict:
        return source.model_dump(exclude={"samples", "sample_ids", "facts"}) | {"sample_count": len(source.sample_ids)}

    def validate(
        self, session: Session, config: EvaluationConfig
    ) -> tuple[list[dict], list[SourceContext], list[dict]]:
        issues: list[dict] = []
        sources = []
        definitions = []

        def issue(reason: str, message: str, field: str = "source_refs") -> None:
            issues.append({"reason_code": reason, "message": message, "field": field})

        if len(set(config.metric_revision_refs)) != len(config.metric_revision_refs):
            issue("duplicate_metric", "指标不能重复", "metric_revision_refs")
        for revision_id in config.metric_revision_refs:
            revision = self.repo.get(session, MetricRevision, revision_id)
            metric = self.repo.get(session, Metric, revision.parent_id or "")
            if revision.status != "published" or metric.status != "enabled":
                issue("unpublished_metric", "只可选择已启用、已发布的指标", "metric_revision_refs")
            if not any(t["stage"] == config.target_stage for t in revision.payload["thresholds"]):
                issue("stage_target_missing", "所选指标没有该阶段目标", "target_stage")
            definitions.append(revision.payload)
        if len({d["metric_code"] for d in definitions}) != len(definitions):
            issue("duplicate_metric", "同一指标只能选择一个修订", "metric_revision_refs")
        for ref in config.source_refs:
            try:
                source = self.adapter.resolve(ref)
            except BusinessError as exc:
                issue(exc.reason, exc.message)
                continue
            sources.append(source)
            if (source.entity_type, source.entity_id, source.version_id) != (
                ref.entity_type,
                ref.entity_id,
                ref.version_id,
            ):
                issue("source_mismatch", "来源返回的精确引用不匹配")
            if source.status != "succeeded":
                issue("source_not_finished", "来源执行尚未成功完成")
            if source.algorithm_mode != "real":
                issue("non_formal_source", "替代算法或演示来源不能用于正式验收")
            if source.content_hash != source_hash(source):
                issue("source_hash_mismatch", "来源结果校验失败")
            if (
                not source.source_task_id
                or source.source_trace_id != source.task_trace_id
                or not source.source_trace_id
            ):
                issue("trace_mismatch", "来源任务与链路不匹配")
            if config.execution_mode == "rerun" and not source.can_rerun:
                issue("rerun_unavailable", "所选来源不支持重新运行")
            actual = (source.dataset_version, source.label_version, source.model_version)
            if actual != (config.dataset_version_ref, config.label_version_ref, config.model_version_ref) or actual != (
                source.result_dataset_version,
                source.result_label_version,
                source.result_model_version,
            ):
                issue("version_mismatch", "数据、标签或模型版本不一致")
            ids = [s.sample_id for s in source.samples]
            if (
                len(set(ids)) != len(ids)
                or len(set(source.sample_ids)) != len(source.sample_ids)
                or set(ids) != set(source.sample_ids)
            ):
                issue("sample_set_mismatch", "标签、结果与冻结样本集合不一致")
            if (
                not source.dataset_version
                or not source.label_version
                or not source.captured_at
                or not source.interface
                or not source.evaluator_version
            ):
                issue("evidence_missing", "来源缺少必要版本或留痕材料")
            for definition in definitions:
                formula = definition["formula_code"]
                params = {p["name"]: p["value"] for p in definition["parameters"]}
                if (
                    formula in {"recall", "accuracy", "fpr", "coverage", "risk_reduction"}
                    and source.positive_class != definition["positive_class"]
                ):
                    issue("positive_class_mismatch", "来源标签正类与指标定义不一致")
                if formula == "coverage" and params.get("coverage_unit") != source.coverage_unit:
                    issue("coverage_unit_mismatch", "应覆盖集合类型不匹配")
                if formula == "risk_reduction" and source.baseline_evaluator_version != source.evaluator_version:
                    issue("pairing_failed", "前后判定器版本不一致")
                calculation = compute_metric(definition, source, config.target_stage)
                if calculation["reason_code"]:
                    issue(calculation["reason_code"], f"{definition['name']}：输入材料不足，无法计算")
        # Multiple sources must be a consistent ensemble; do not silently evaluate only its first member.
        if len(sources) > 1:
            issue("ambiguous", "请为本次测试选择一个完整来源快照")
        return issues, sources, definitions

    def preflight(self, session: Session, config: EvaluationConfig, owner: str) -> dict:
        issues, sources, definitions = self.validate(session, config)
        expires = (datetime.now(UTC) + timedelta(minutes=10)).isoformat()
        token = uid("pre") if not issues else None
        if token:
            session.add(
                Preflight(
                    public_id=token,
                    owner=owner,
                    status="valid",
                    payload={
                        "config_hash": digest(config.model_dump(exclude={"preflight_token"})),
                        "source_hashes": [s.content_hash for s in sources],
                        "expires_at": expires,
                        "revision_hashes": [digest(d) for d in definitions],
                    },
                )
            )
        return {
            "token": token,
            "expires_at": expires,
            "can_create": not issues,
            "issues": issues,
            "resolved_refs": [self.public_source(source) for source in sources],
        }

    def freeze(self, session: Session, config: EvaluationConfig, owner: str) -> dict:
        if not config.preflight_token:
            raise BusinessError("请先完成预检", reason="preflight_required")
        preflight = self.repo.get(session, Preflight, config.preflight_token)
        if preflight.owner != owner:
            raise BusinessError("无权使用此预检", 403, 90002)
        if preflight.payload["expires_at"] < now():
            raise BusinessError("预检已过期，请重新检查", 409, 10003, "preflight_expired")
        issues, sources, definitions = self.validate(session, config)
        if issues:
            raise BusinessError("创建被预检阻止", 422, 60002, "preflight_failed", issues)
        if (
            preflight.payload["config_hash"] != digest(config.model_dump(exclude={"preflight_token"}))
            or preflight.payload["source_hashes"] != [s.content_hash for s in sources]
            or preflight.payload["revision_hashes"] != [digest(d) for d in definitions]
        ):
            raise BusinessError("预检后输入或来源版本发生变化，请重新预检", 409, 10003, "version_mismatch")
        return {
            "resolved_refs": [source.model_dump() for source in sources],
            "metric_revisions": definitions,
            "dataset_version": config.dataset_version_ref,
            "label_version": config.label_version_ref,
            "model_version": config.model_version_ref,
            "target_stage": config.target_stage,
            "sample_manifest_hash": digest(sources[0].sample_ids),
            "sample_count": len(sources[0].sample_ids),
            "source_result_hashes": [s.content_hash for s in sources],
            "evaluator_version": "evaluation-1.0.0",
            "execution_mode": config.execution_mode,
            "created_at": now(),
        }

    @staticmethod
    def log(session: Session, task: Task, stage: str, message: str, status: str = "success") -> None:
        event_id = uid("evt")
        session.add(
            Event(
                public_id=event_id,
                owner=task.owner,
                parent_id=task.public_id,
                status=status,
                payload={
                    "event_id": event_id,
                    "task_id": task.public_id,
                    "trace_id": task.payload["trace_id"],
                    "capability_code": task.payload["capability_code"],
                    "stage": stage,
                    "message": message,
                    "interface": "/adapter/platform/invoke",
                    "version": "evaluation-1.0.0",
                    "status": status,
                    "created_at": now(),
                },
            )
        )

    def execute(self, task_id: str) -> None:
        try:
            with self.repo.transaction() as session:
                task = self.repo.get(session, Task, task_id)
                if task.status != "running":
                    return
                plan = self.repo.get(session, Plan, task.payload["plan_id"])
                snapshot = plan.payload["snapshot"]
                self.log(session, task, "route", "已路由至评估计算服务")
                source = SourceContext.model_validate(snapshot["resolved_refs"][0])
                child_id = None
                if snapshot["execution_mode"] == "rerun":
                    child_id = uid("tsk")
                    session.add(
                        Task(
                            public_id=child_id,
                            owner=task.owner,
                            parent_id=task_id,
                            status="running",
                            payload={
                                "task_id": child_id,
                                "name": "被测能力重新运行",
                                "capability_code": source.capability_code,
                                "trace_id": task.payload["trace_id"],
                                "source_ref": self.public_source(source),
                                "created_at": now(),
                            },
                        )
                    )
                self.log(session, task, "invoke", "开始读取冻结材料并计算")
            if child_id:
                source = self.adapter.rerun(source, child_id)
                expected = SourceContext.model_validate(snapshot["resolved_refs"][0])
                if (
                    source.status != "succeeded"
                    or source.algorithm_mode != "real"
                    or source_hash(source) != source.content_hash
                    or set(source.sample_ids) != set(expected.sample_ids)
                    or (source.dataset_version, source.label_version, source.model_version)
                    != (expected.dataset_version, expected.label_version, expected.model_version)
                ):
                    raise BusinessError("重新运行返回的样本或版本不一致", reason="version_mismatch")
                sample_ids = [sample.sample_id for sample in source.samples]
                if (
                    len(set(sample_ids)) != len(sample_ids)
                    or set(sample_ids) != set(source.sample_ids)
                    or (source.result_dataset_version, source.result_label_version, source.result_model_version)
                    != (source.dataset_version, source.label_version, source.model_version)
                    or not source.source_task_id
                    or not source.source_trace_id
                    or source.source_trace_id != source.task_trace_id
                ):
                    raise BusinessError("重新运行的结果集合或留痕关联不一致", reason="sample_set_mismatch")
            with self.repo.transaction() as session:
                current = self.repo.get(session, Task, task_id)
                if current.status != "running":
                    return
                current.payload = {**current.payload, "stage": "calculating"}
                self.log(session, current, "invoke", "样本和标签已对齐，开始逐项测量")
            results = route("evaluation").invoke(source, snapshot["metric_revisions"], snapshot["target_stage"])
            self.finish(task_id, source, results, child_id)
        except Exception as exc:
            self.fail(task_id, exc)

    def finish(self, task_id: str, source: SourceContext, results: list[dict], child_id: str | None) -> None:
        with self.repo.transaction() as session:
            task = self.repo.get(session, Task, task_id)
            if task.status != "running":
                return
            run = self.repo.get(session, Run, task.payload["run_id"])
            integrity = "incomplete" if any(result["reason_code"] for result in results) else "complete"
            for result in results:
                evidence_id = uid("evd")
                material = {"source": source.model_dump(), "calculation": deepcopy(result), "captured_at": now()}
                content = {
                    "evidence_id": evidence_id,
                    "run_id": run.public_id,
                    "kind": "calculation",
                    "material": material,
                    "sha256": digest(material),
                    "source_ref": self.public_source(source),
                    "integrity_state": integrity,
                    "missing_fields": [result["reason_code"]] if result["reason_code"] else [],
                    "redacted_fields": ["raw_content"],
                    "captured_at": now(),
                    "allowed_actions": ["read"],
                    "mime_type": "application/json",
                }
                session.add(
                    Evidence(
                        public_id=evidence_id,
                        owner=task.owner,
                        parent_id=run.public_id,
                        status=integrity,
                        payload=content,
                    )
                )
                result["evidence_refs"] = [evidence_id]
                session.add(
                    MetricResult(
                        public_id=uid("mr"),
                        owner=task.owner,
                        parent_id=run.public_id,
                        metric_code=result["metric_code"],
                        revision_id=result["revision_id"],
                        status=result["judgment_status"],
                        payload=result,
                    )
                )
            run.status = task.status = "succeeded"
            run.payload = {
                **run.payload,
                "judgment_status": judge(results),
                "finished_at": now(),
                "integrity_state": integrity,
                "execution_source": source.model_dump() if child_id else None,
            }
            task.payload = {
                **task.payload,
                "finished_at": now(),
                "processed_count": len(source.samples),
                "stage": "archived",
            }
            if child_id:
                child = self.repo.get(session, Task, child_id)
                child.status = "succeeded"
                child.payload = {**child.payload, "finished_at": now(), "result": source.model_dump()}
            self.log(session, task, "output", "指标计算、逐项结论及证据已持久化")
            for record_id in [run.payload["record_id"], *source.record_ids]:
                session.add(
                    RecordLink(
                        public_id=uid("link"),
                        owner=task.owner,
                        parent_id=run.public_id,
                        namespace=source.source_module,
                        record_id=record_id,
                        status="linked",
                        payload={},
                    )
                )

    def fail(self, task_id: str, error: Exception) -> None:
        with self.repo.transaction() as session:
            task = self.repo.get(session, Task, task_id)
            if task.status != "running":
                return
            reason = error.reason if isinstance(error, BusinessError) else "execution_error"
            message = error.message if isinstance(error, BusinessError) else "执行失败，请检查来源服务与运行材料"
            task.status = "failed"
            task.payload = {
                **task.payload,
                "finished_at": now(),
                "stage": "failed",
                "error": message,
                "reason_code": reason,
            }
            run = self.repo.get(session, Run, task.payload["run_id"])
            run.status = "failed"
            run.payload = {
                **run.payload,
                "judgment_status": "inconclusive",
                "finished_at": now(),
                "integrity_state": "incomplete",
            }
            for child in self.repo.list(session, Task, task_id):
                if child.status == "running":
                    child.status = "failed"
            self.log(session, task, "output", message, "failure")

    def run_detail(self, session: Session, run_id: str) -> dict[str, Any]:
        run = self.repo.get(session, Run, run_id)
        task = self.repo.get(session, Task, run.parent_id or "")
        plan = self.repo.get(session, Plan, task.payload["plan_id"])
        snapshot = {
            **plan.payload["snapshot"],
            "resolved_refs": [
                self.public_source(SourceContext.model_validate(s)) for s in plan.payload["snapshot"]["resolved_refs"]
            ],
        }
        return {
            **run.payload,
            "task_status": task.status,
            "name": task.payload["name"],
            "snapshot": snapshot,
            "metric_results": [r.payload for r in self.repo.list(session, MetricResult, run_id)],
            "allowed_actions": ["retry"]
            if task.status == "failed"
            else ["retest", "export"]
            if task.status == "succeeded"
            else [],
            "error": task.payload.get("error"),
            "config": plan.payload["config"],
            "exports": [job.payload for job in self.repo.list(session, Export, run_id)],
        }

    def evidence(self, session: Session, evidence_id: str) -> dict:
        row = self.repo.get(session, Evidence, evidence_id)
        material = row.payload["material"]
        valid = digest(material) == row.payload["sha256"]
        return {
            **row.payload,
            "material": {**material, "source": self.public_source(SourceContext.model_validate(material["source"]))},
            "integrity_state": row.status if valid else "corrupt",
            "allowed_actions": ["read"],
        }

    def evidence_manifest(self, session: Session, run_id: str) -> dict:
        run = self.repo.get(session, Run, run_id)
        task = self.repo.get(session, Task, run.parent_id or "")
        snapshot = self.repo.get(session, Plan, task.payload["plan_id"]).payload["snapshot"]
        source = run.payload.get("execution_source") or snapshot["resolved_refs"][0]
        events = self.repo.list(session, Event, task.public_id)
        entries = [self.evidence(session, e.public_id) for e in self.repo.list(session, Evidence, run_id)]
        source_valid = source["content_hash"] == source_hash(SourceContext.model_validate(source))
        checks = [
            {
                "name": "input",
                "valid": source_valid and digest(source["sample_ids"]) == snapshot["sample_manifest_hash"],
            },
            {"name": "time", "valid": bool(run.created_at and source["captured_at"])},
            {"name": "interface", "valid": bool(source["interface"] and events)},
            {
                "name": "version",
                "valid": bool(source["dataset_version"] and source["label_version"] and snapshot["metric_revisions"]),
            },
            {
                "name": "output",
                "valid": run.status == "succeeded"
                and bool(entries)
                and len(entries) == len(snapshot["metric_revisions"])
                and all(e["integrity_state"] == "complete" for e in entries),
            },
        ]
        complete = all(check["valid"] for check in checks)
        return {
            "entries": entries,
            "integrity_state": "complete" if complete else "incomplete",
            "checks": checks,
        }

    def resolve_record(self, session: Session, record_id: str) -> dict:
        if record_id.lower().startswith(("mock", "demo")):
            return {"resolution": "demo_only", "run_id": None, "candidates": []}
        links = [r for r in self.repo.list(session, RecordLink) if r.record_id == record_id]
        candidates = list(dict.fromkeys(r.parent_id for r in links))
        if not candidates:
            resolution = "not_found"
        elif len(candidates) > 1:
            resolution = "ambiguous"
        else:
            try:
                self.repo.get(session, Run, candidates[0] or "")
                resolution = "resolved"
            except BusinessError:
                resolution = "conflict"
        return {
            "resolution": resolution,
            "run_id": candidates[0] if resolution == "resolved" else None,
            "candidates": [{"run_id": candidate} for candidate in candidates],
        }
