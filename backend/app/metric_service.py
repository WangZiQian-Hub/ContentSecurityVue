from sqlalchemy.orm import Session

from .catalog import FORMULAS, initial_definitions
from .core import BusinessError, now, uid
from .models import Metric, MetricRevision
from .repositories import Repository
from .schemas import MetricCreate, RevisionDefinition, RevisionPatch


class MetricService:
    def __init__(self, repository: Repository):
        self.repo = repository

    def seed(self) -> None:
        with self.repo.transaction() as session:
            if self.repo.list(session, Metric):
                return
            for metric, definition in initial_definitions():
                self.create(session, metric, definition)

    def create(self, session: Session, data: MetricCreate, definition: RevisionDefinition | None = None) -> dict:
        if any(row.payload["code"] == data.code for row in self.repo.list(session, Metric)):
            raise BusinessError("指标编码已存在", 409, 10003)
        metric_id = uid("met")
        metric = Metric(public_id=metric_id, status="enabled", payload={**data.model_dump(), "metric_id": metric_id})
        session.add(metric)
        session.flush()
        self.revise(session, metric_id, definition or RevisionDefinition())
        return self.project(session, metric)

    def revise(self, session: Session, metric_id: str, definition: RevisionDefinition) -> dict:
        metric = self.repo.get(session, Metric, metric_id)
        revision_id = uid("rev")
        number = len(self.repo.list(session, MetricRevision, metric_id)) + 1
        revision = MetricRevision(
            public_id=revision_id,
            parent_id=metric_id,
            status="draft",
            payload={
                **definition.model_dump(),
                "metric_id": metric_id,
                "metric_code": metric.payload["code"],
                "name": metric.payload["name"],
                "category": metric.payload["category"],
                "revision_id": revision_id,
                "revision_no": number,
                "expected_revision": 1,
                "configuration_status": "needs_definition"
                if definition.formula_code == "needs_definition"
                else "draft",
                "created_at": now(),
                "published_at": None,
            },
        )
        session.add(revision)
        session.flush()
        return revision.payload

    def patch(self, session: Session, metric_id: str, revision_id: str, data: RevisionPatch) -> dict:
        revision = self.revision(session, metric_id, revision_id)
        self.editable(revision, data.expected_revision)
        revision.payload = {
            **revision.payload,
            **data.definition.model_dump(),
            "expected_revision": data.expected_revision + 1,
            "configuration_status": "needs_definition"
            if data.definition.formula_code == "needs_definition"
            else "draft",
        }
        return revision.payload

    def publish(self, session: Session, metric_id: str, revision_id: str, expected: int) -> dict:
        revision = self.revision(session, metric_id, revision_id)
        self.editable(revision, expected)
        issues = self.definition_issues(revision.payload)
        if issues:
            raise BusinessError("指标口径不完整，不能发布", 422, 60001, "needs_definition", issues)
        revision.status = "published"
        revision.payload = {
            **revision.payload,
            "configuration_status": "published",
            "published_at": now(),
            "expected_revision": expected + 1,
        }
        return revision.payload

    @staticmethod
    def editable(revision: MetricRevision, expected: int) -> None:
        if revision.status == "published" or revision.payload["expected_revision"] != expected:
            raise BusinessError("修订已发布或已变更，请刷新后创建新修订", 409, 10003, "revision_conflict")

    def revision(self, session: Session, metric_id: str, revision_id: str) -> MetricRevision:
        revision = self.repo.get(session, MetricRevision, revision_id)
        if revision.parent_id != metric_id:
            raise BusinessError("指标与修订不匹配", 404, 10002)
        return revision

    @staticmethod
    def definition_issues(definition: dict) -> list[dict]:
        issues = []

        def require(condition: bool, field: str, message: str) -> None:
            if not condition:
                issues.append({"field": field, "reason_code": "needs_definition", "message": message})

        formula = definition["formula_code"]
        require(formula != "needs_definition", "formula_code", "计算口径尚未正式确认")
        require(definition["formula"] == FORMULAS[formula][0], "formula", "公式说明必须与登记的计算方法一致")
        require(
            set(definition["required_evidence"]) == {"input", "time", "interface", "version", "output"},
            "required_evidence",
            "正式测试须保留输入、时间、接口、版本、输出五要素",
        )
        require(
            definition.get("metric_code") not in {"pollution_identification_rate", "compliance_improvement"},
            "formula_code",
            "该指标尚无正式确认口径，不能改用其他公式发布",
        )
        for field in [
            "formula",
            "denominator_definition",
            "applicable_objects",
            "input_requirements",
            "required_evidence",
            "source_document_refs",
            "thresholds",
        ]:
            require(bool(definition[field]), field, "请补齐指标定义与证据要求")
        if formula in {"recall", "accuracy", "fpr", "coverage", "risk_reduction"}:
            require(bool(definition["positive_class"]), "positive_class", "请明确标准正类")
        parameters = {p["name"]: p["value"] for p in definition["parameters"]}
        require(len(parameters) == len(definition["parameters"]), "parameters", "参数名称不能重复")
        if formula == "coverage":
            require(
                parameters.get("coverage_unit") in {"sample", "scenario", "case"}, "parameters", "请明确应覆盖集合类型"
            )
        if formula == "trace_complete":
            require(
                set(parameters.get("required_keys", "").split(",")) == {"data", "training", "output"},
                "parameters",
                "三阶段必须包含 data、training、output 的完整关联",
            )
        for kind, names in {
            "count": ["fact_key", "counting_scope"],
            "chain_restore": ["matching_rule", "deduplication_rule"],
            "trace_complete": ["required_keys", "linkage_rule"],
            "matrix": ["required_keys", "matrix_definition"],
        }.items():
            if formula == kind:
                for name in names:
                    require(bool(parameters.get(name)), "parameters", f"请定义 {name}")
        thresholds = definition["thresholds"]
        require(len({t["stage"] for t in thresholds}) == len(thresholds), "thresholds", "阶段阈值不能重复")
        for threshold in thresholds:
            require(threshold["unit"] == definition["unit"], "thresholds", "阈值单位必须一致")
            if definition["unit"] == "ratio":
                require(0 <= threshold["value"] <= 1, "thresholds", "比率阈值须在 0–1 之间")
            if definition["unit"] == "boolean":
                require(
                    threshold["value"] == 1 and threshold["comparator"] in {"eq", "all"},
                    "thresholds",
                    "核验型指标须全部满足",
                )
        expected_unit = (
            "count" if formula == "count" else "boolean" if formula in {"trace_complete", "matrix"} else "ratio"
        )
        require(definition["unit"] == expected_unit, "unit", "公式与单位不匹配")
        return issues

    def project(self, session: Session, metric: Metric) -> dict:
        revisions = self.repo.list(session, MetricRevision, metric.public_id)
        latest = revisions[0].payload if revisions else None
        active = next((row.payload for row in revisions if row.status == "published"), None)
        return {
            **metric.payload,
            "status": metric.status,
            "active_revision": active,
            "latest_revision": latest,
            "configuration_status": latest["configuration_status"] if latest else "draft",
            "issues": self.definition_issues(latest) if latest else [],
        }
