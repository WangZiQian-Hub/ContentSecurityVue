"""Documented response DTOs. Extension fields remain backward compatible."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .schemas import EvaluationConfig, RevisionDefinition, SourceRef, Threshold

TaskStatus = Literal["pending", "running", "succeeded", "failed", "cancelled"]
Judgment = Literal["not_evaluated", "passed", "failed", "inconclusive"]


class Output(BaseModel):
    model_config = ConfigDict(extra="allow", protected_namespaces=())


class IssueOut(Output):
    field: str
    reason_code: str
    message: str


class RevisionOut(RevisionDefinition):
    metric_id: str
    metric_code: str
    name: str
    category: str
    revision_id: str
    revision_no: int
    expected_revision: int
    configuration_status: Literal["draft", "published", "needs_definition"]
    created_at: str
    published_at: str | None


class MetricOut(Output):
    metric_id: str
    code: str
    name: str
    category: str
    description: str
    status: Literal["enabled", "disabled"]
    active_revision: RevisionOut | None
    latest_revision: RevisionOut | None
    configuration_status: str
    issues: list[IssueOut]


class SourceOut(SourceRef):
    model_config = ConfigDict(extra="allow", protected_namespaces=())
    name: str
    source_module: str
    source_task_id: str
    source_trace_id: str
    task_trace_id: str
    dataset_version: str
    label_version: str
    model_version: str | None
    algorithm_mode: Literal["real", "llm", "mock"]
    content_hash: str
    sample_count: int
    can_rerun: bool


class ContextsOut(Output):
    resolution: Literal["available", "unavailable"]
    candidates: list[SourceOut]
    allowed_actions: list[str]
    issues: list[IssueOut]


class PreflightOut(Output):
    token: str | None
    expires_at: str
    can_create: bool
    issues: list[IssueOut]
    resolved_refs: list[SourceOut]


class TaskOut(Output):
    task_id: str
    name: str
    capability_code: str
    status: TaskStatus
    allowed_actions: list[str]
    created_at: str
    trace_id: str
    run_id: str | None = None
    processed_count: int | None = None
    total_count: int | None = None


class CountOut(Output):
    name: str
    value: int


class MetricResultOut(Output):
    metric_code: str
    name: str
    revision_id: str
    value: float | None
    numerator: int | None
    denominator: int | None
    unit: str
    counts: list[CountOut]
    threshold_snapshot: Threshold | None
    judgment_status: Judgment
    reason_code: str | None
    gap: float | None
    formula: str
    formula_code: str
    evidence_refs: list[str] = Field(default_factory=list)


class SnapshotOut(Output):
    resolved_refs: list[SourceOut]
    metric_revisions: list[RevisionOut]
    dataset_version: str
    label_version: str
    model_version: str | None
    target_stage: str
    sample_manifest_hash: str
    sample_count: int
    source_result_hashes: list[str]
    evaluator_version: str
    execution_mode: str
    created_at: str


class ExportOut(Output):
    export_id: str
    run_id: str
    kind: Literal["report", "evidence_bundle"]
    state: Literal["queued", "running", "succeeded", "failed"]
    artifact_id: str | None
    error: str | None
    manifest_hash: str | None
    created_at: str
    finished_at: str | None


class RunOut(Output):
    run_id: str
    task_id: str
    record_id: str
    test_no: str
    name: str
    attempt_no: int
    retry_of: str | None
    judgment_status: Judgment
    task_status: TaskStatus
    algorithm_mode: str
    snapshot: SnapshotOut
    metric_results: list[MetricResultOut]
    allowed_actions: list[str]
    integrity_state: str
    config: EvaluationConfig
    exports: list[ExportOut]


class ResolutionOut(Output):
    resolution: Literal["resolved", "not_found", "ambiguous", "conflict", "demo_only"]
    run_id: str | None
    candidates: list[dict[str, str]]


class EvidenceMaterialOut(Output):
    source: SourceOut
    calculation: MetricResultOut
    captured_at: str


class EvidenceOut(Output):
    evidence_id: str
    run_id: str
    kind: str
    material: EvidenceMaterialOut
    sha256: str
    source_ref: SourceOut
    integrity_state: str
    missing_fields: list[str]
    redacted_fields: list[str]
    captured_at: str
    allowed_actions: list[str]
    mime_type: str


class IntegrityCheck(Output):
    name: str
    valid: bool


class ManifestOut(Output):
    entries: list[EvidenceOut]
    integrity_state: str
    checks: list[IntegrityCheck]


class TicketOut(Output):
    url: str
    expires_at: str
    file_name: str
    sha256: str
