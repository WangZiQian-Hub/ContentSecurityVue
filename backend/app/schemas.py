from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field

Stage = Literal["midterm", "final"]
Category = Literal["data_value", "data_governance", "risk_detect", "compliance", "model_capability"]
Formula = Literal[
    "recall",
    "accuracy",
    "coverage",
    "fpr",
    "risk_reduction",
    "count",
    "trace_complete",
    "matrix",
    "chain_restore",
    "needs_definition",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", protected_namespaces=())


class Threshold(StrictModel):
    stage: Stage
    comparator: Literal["gte", "lte", "eq", "all"]
    value: float = Field(allow_inf_nan=False)
    unit: Literal["ratio", "count", "boolean"]


class Parameter(StrictModel):
    name: str
    value: str


class RevisionDefinition(StrictModel):
    formula_code: Formula = "needs_definition"
    formula_version: str = "1.0"
    formula: str = ""
    denominator_definition: str = ""
    positive_class: str = ""
    unit: Literal["ratio", "count", "boolean"] = "ratio"
    test_method: Literal["automatic", "paired", "evidence"] = "automatic"
    applicable_objects: str = ""
    parameters: list[Parameter] = Field(default_factory=list)
    thresholds: list[Threshold] = Field(default_factory=list)
    input_requirements: list[str] = Field(default_factory=list)
    required_evidence: list[str] = Field(default_factory=list)
    source_document_refs: list[str] = Field(default_factory=list)


class MetricCreate(StrictModel):
    code: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    name: str = Field(min_length=1, max_length=128)
    category: Category
    description: str = Field(default="", max_length=512)


class RevisionPatch(StrictModel):
    expected_revision: int = Field(ge=1)
    definition: RevisionDefinition


class ExpectedRevision(StrictModel):
    expected_revision: int = Field(ge=1)


class MetricStatus(StrictModel):
    status: Literal["enabled", "disabled"]


class SourceRef(StrictModel):
    entity_type: str
    entity_id: str
    version_id: str


class EvaluationConfig(StrictModel):
    schema_version: Literal["1.0"] = "1.0"
    target_stage: Stage
    execution_mode: Literal["reference", "rerun"] = "reference"
    source_refs: list[SourceRef] = Field(min_length=1, max_length=10)
    dataset_version_ref: str
    label_version_ref: str
    model_version_ref: str | None = None
    metric_revision_refs: list[str] = Field(min_length=1, max_length=100)
    sample_scope: dict[Literal["mode"], Literal["all"]] = Field(default_factory=lambda: {"mode": "all"})
    preflight_token: str | None = None
    retest_of: str | None = None


class TaskConfig(StrictModel):
    evaluation: EvaluationConfig | None = None
    baseline_version: str | None = None
    edited_version: str | None = None
    dataset_version: str | None = None


class TaskInput(StrictModel):
    metric_codes: list[str] = Field(default_factory=list)
    dataset_id: str | int | None = None
    model_id: str | int | None = None


class TaskCreate(StrictModel):
    capability_code: Literal["evaluation"]
    name: str = Field(default="测试评估任务", min_length=1, max_length=255)
    input: TaskInput = Field(default_factory=TaskInput)
    config: TaskConfig
    timeout_seconds: int = Field(default=300, ge=1, le=3600)


class StartRequest(StrictModel):
    expected_status: Literal["pending"] = "pending"


class RetryRequest(StrictModel):
    reason: str = Field(min_length=1, max_length=500)


class ExportRequest(StrictModel):
    kind: Literal["report", "evidence_bundle"]
    format: Literal["html", "zip"] | None = None
    redaction_profile: Literal["standard"] = "standard"


class Sample(StrictModel):
    sample_id: str
    expected: bool | None = None
    predicted: bool | None = None
    baseline: bool | None = None
    required: bool = False


class Fact(StrictModel):
    key: str
    count: int = Field(ge=0)
    evidence_ref: str


class SourceContext(StrictModel):
    entity_type: str
    entity_id: str
    version_id: str
    name: str
    source_module: str
    source_task_id: str
    source_trace_id: str
    task_trace_id: str
    capability_code: str
    status: Literal["succeeded", "running", "failed"]
    algorithm_mode: Literal["real", "llm", "mock"]
    dataset_id: str
    model_id: str | None = None
    dataset_version: str
    label_version: str
    model_version: str | None = None
    result_dataset_version: str
    result_label_version: str
    result_model_version: str | None = None
    evaluator_version: str
    positive_class: str = ""
    baseline_evaluator_version: str | None = None
    coverage_unit: Literal["sample", "scenario", "case"] = "sample"
    sample_ids: list[str]
    samples: list[Sample]
    facts: list[Fact] = Field(default_factory=list)
    captured_at: str
    interface: str
    content_hash: str
    record_ids: list[str] = Field(default_factory=list)
    can_rerun: bool = False


T = TypeVar("T")


class Envelope(BaseModel, Generic[T]):
    code: int = 0
    message: str = "success"
    data: T | None = None
    trace_id: str
    timestamp: str


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int
    summary: list[dict[str, Any]] = Field(default_factory=list)
