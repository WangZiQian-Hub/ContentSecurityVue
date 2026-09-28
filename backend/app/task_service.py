from sqlalchemy.orm import Session

from .core import BusinessError, now, uid
from .evaluation_service import EvaluationService
from .models import Metric, MetricRevision, Plan, Run, Task
from .repositories import Repository
from .schemas import EvaluationConfig, SourceRef, TaskCreate


class TaskService:
    def __init__(self, repository: Repository, evaluation: EvaluationService):
        self.repo, self.evaluation = repository, evaluation

    def create(self, session: Session, data: TaskCreate, owner: str, trace_id: str) -> dict:
        config = data.config.evaluation
        if config is None:
            config = self.legacy_config(session, data, owner)
        snapshot = self.evaluation.freeze(session, config, owner)
        plan_id = uid("plan")
        session.add(
            Plan(
                public_id=plan_id,
                owner=owner,
                status="frozen",
                payload={
                    "snapshot": snapshot,
                    "config": config.model_dump(),
                    "created_at": now(),
                },
            )
        )
        return self.new_attempt(session, plan_id, owner, data.name, trace_id)

    def legacy_config(self, session: Session, data: TaskCreate, owner: str) -> EvaluationConfig:
        sources = self.evaluation.adapter.contexts("model_comparison")
        matches = [
            s
            for s in sources
            if s.model_id == str(data.input.model_id)
            and s.dataset_id == str(data.input.dataset_id)
            and s.model_version == data.config.edited_version
            and s.dataset_version == data.config.dataset_version
            and any(f.key == "baseline_version:" + str(data.config.baseline_version) for f in s.facts)
        ]
        if len(matches) != 1:
            raise BusinessError("未找到唯一且版本匹配的模型对照结果", 422, 60002, "source_unresolved")
        source = matches[0]
        revisions = []
        for code in data.input.metric_codes:
            metric = next(
                (m for m in self.repo.list(session, Metric) if m.payload["code"] == code and m.status == "enabled"),
                None,
            )
            revision = (
                next(
                    (r for r in self.repo.list(session, MetricRevision, metric.public_id) if r.status == "published"),
                    None,
                )
                if metric
                else None
            )
            if revision is None:
                raise BusinessError("模型对照指标尚未发布", 422, 60001, "unpublished_metric")
            revisions.append(revision.public_id)
        config = EvaluationConfig(
            target_stage="final",
            source_refs=[
                SourceRef(entity_type=source.entity_type, entity_id=source.entity_id, version_id=source.version_id)
            ],
            dataset_version_ref=source.dataset_version,
            label_version_ref=source.label_version,
            model_version_ref=source.model_version,
            metric_revision_refs=revisions,
        )
        check = self.evaluation.preflight(session, config, owner)
        if not check["can_create"]:
            raise BusinessError("模型对照预检未通过", 422, 60002, "preflight_failed", check["issues"])
        config.preflight_token = check["token"]
        return config

    def new_attempt(
        self,
        session: Session,
        plan_id: str,
        owner: str,
        name: str,
        trace_id: str,
        retry_of: str | None = None,
        attempt: int = 1,
    ) -> dict:
        task_id, run_id, record_id = uid("tsk"), uid("run"), uid("rec")
        plan = self.repo.get(session, Plan, plan_id)
        task = Task(
            public_id=task_id,
            owner=owner,
            status="pending",
            payload={
                "task_id": task_id,
                "name": name,
                "capability_code": "evaluation",
                "task_category": "evaluation",
                "plan_id": plan_id,
                "run_id": run_id,
                "trace_id": trace_id,
                "created_at": now(),
                "processed_count": 0,
                "total_count": plan.payload["snapshot"]["sample_count"],
                "stage": "frozen",
            },
        )
        session.add(task)
        session.add(
            Run(
                public_id=run_id,
                owner=owner,
                parent_id=task_id,
                status="pending",
                payload={
                    "run_id": run_id,
                    "task_id": task_id,
                    "record_id": record_id,
                    "test_no": f"T{now()[:10].replace('-', '')}{len(self.repo.list(session, Run)) + 1:03d}",
                    "attempt_no": attempt,
                    "retry_of": retry_of,
                    "judgment_status": "not_evaluated",
                    "algorithm_mode": "real",
                    "created_at": now(),
                    "integrity_state": "incomplete",
                    "started_at": None,
                    "finished_at": None,
                },
            )
        )
        session.flush()
        self.evaluation.log(session, task, "input", "预检通过，测试计划及版本已冻结")
        return self.project(session, task)

    def start(self, session: Session, task_id: str) -> dict:
        task = self.repo.get(session, Task, task_id)
        if task.status != "pending":
            raise BusinessError("仅待启动任务可以启动", 409, 20003, "state_conflict")
        task.status = "running"
        task.payload = {**task.payload, "started_at": now(), "stage": "queued"}
        run = self.repo.get(session, Run, task.payload["run_id"])
        run.status = "running"
        run.payload = {**run.payload, "started_at": now()}
        self.evaluation.log(session, task, "invoke", "任务已进入执行队列")
        return self.project(session, task)

    def cancel(self, session: Session, task_id: str) -> dict:
        task = self.repo.get(session, Task, task_id)
        if task.status not in {"pending", "running"}:
            raise BusinessError("当前任务状态不允许取消", 409, 20003, "state_conflict")
        task.status = "cancelled"
        task.payload = {**task.payload, "finished_at": now(), "stage": "cancelled"}
        run = self.repo.get(session, Run, task.payload["run_id"])
        run.status = "cancelled"
        run.payload = {**run.payload, "finished_at": now(), "judgment_status": "inconclusive"}
        for child in self.repo.list(session, Task, task_id):
            if child.status in {"pending", "running"}:
                child.status = "cancelled"
        self.evaluation.log(session, task, "output", "任务已取消，保留全部已生成材料", "failure")
        return self.project(session, task)

    def retry(self, session: Session, run_id: str, owner: str, trace_id: str, reason: str) -> dict:
        run = self.repo.get(session, Run, run_id)
        task = self.repo.get(session, Task, run.parent_id or "")
        if task.status != "failed":
            raise BusinessError("只有执行失败的运行可以重试", 409, 20003, "state_conflict")
        if any(r.payload.get("retry_of") == run_id for r in self.repo.list(session, Run)):
            raise BusinessError("该运行已创建重试，请查看新的尝试", 409, 20003, "retry_exists")
        result = self.new_attempt(
            session,
            task.payload["plan_id"],
            owner,
            task.payload["name"],
            trace_id,
            run_id,
            run.payload["attempt_no"] + 1,
        )
        self.evaluation.log(session, self.repo.get(session, Task, result["task_id"]), "input", "重试原因：" + reason)
        return result

    def project(self, session: Session, task: Task) -> dict:
        result = {
            **task.payload,
            "status": task.status,
            "allowed_actions": ["start", "cancel"]
            if task.status == "pending"
            else ["cancel"]
            if task.status == "running"
            else ["retry"]
            if task.status == "failed"
            else [],
        }
        if task.payload["capability_code"] == "evaluation":
            plan = self.repo.get(session, Plan, task.payload["plan_id"])
            run = self.repo.get(session, Run, task.payload["run_id"])
            snapshot = plan.payload["snapshot"]
            result.update(
                target_stage=snapshot["target_stage"],
                dataset_version=snapshot["dataset_version"],
                model_version=snapshot["model_version"],
                metric_count=len(snapshot["metric_revisions"]),
                judgment_status=run.payload["judgment_status"],
                updated_at=task.updated_at,
            )
            if task.status == "succeeded":
                detail = self.evaluation.run_detail(session, run.public_id)
                result["result"] = {
                    "results": [
                        {
                            "metric_code": r["metric_code"],
                            "value": r["value"],
                            "passed": r["judgment_status"] == "passed",
                            "threshold": r["threshold_snapshot"]["value"],
                        }
                        for r in detail["metric_results"]
                    ],
                    "run_id": run.public_id,
                    "record_id": run.payload["record_id"],
                    "judgment_status": run.payload["judgment_status"],
                    "report": {"status": "not_generated"},
                    "evidence_refs": [e for r in detail["metric_results"] for e in r["evidence_refs"]],
                }
        return result

    def recover(self) -> None:
        # Single worker deployment: all running tasks on startup were interrupted by process exit.
        with self.repo.transaction() as session:
            running = [
                t.public_id
                for t in self.repo.list(session, Task)
                if t.status == "running" and t.payload["capability_code"] == "evaluation"
            ]
        for task_id in running:
            self.evaluation.fail(
                task_id, BusinessError("服务重启中断了运行，请重试创建新的尝试", reason="worker_interrupted")
            )
