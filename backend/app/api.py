import secrets
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .core import BusinessError, now
from .responses import (
    ContextsOut,
    EvidenceOut,
    ExportOut,
    ManifestOut,
    MetricOut,
    PreflightOut,
    ResolutionOut,
    RevisionOut,
    RunOut,
    TaskOut,
    TicketOut,
)
from .schemas import Page, Sample
from .models import Export, Metric, MetricRevision, Plan, Run, Task
from .schemas import (
    Envelope,
    EvaluationConfig,
    ExpectedRevision,
    ExportRequest,
    MetricCreate,
    MetricStatus,
    RetryRequest,
    RevisionDefinition,
    RevisionPatch,
    StartRequest,
    TaskCreate,
)

router = APIRouter(prefix="/api/v1")
bearer_auth = HTTPBearer(auto_error=False)
evaluation_auth = APIKeyHeader(name="X-Evaluation-Authorization", auto_error=False)


def identity(
    request: Request,
    bearer: HTTPAuthorizationCredentials | None = Depends(bearer_auth),
    scoped: str | None = Depends(evaluation_auth),
) -> str:
    settings = request.app.state.settings
    auth = scoped or (f"Bearer {bearer.credentials}" if bearer else "")
    if settings.admin_token and secrets.compare_digest(auth, "Bearer " + settings.admin_token):
        return "administrator"
    if settings.reader_token and secrets.compare_digest(auth, "Bearer " + settings.reader_token):
        return "reader"
    raise BusinessError("请使用已授权的账户登录", 401, 90001, "unauthenticated")


def writer(owner: str = Depends(identity)) -> str:
    if owner != "administrator":
        raise BusinessError("当前账户没有修改或导出权限", 403, 90002, "forbidden")
    return owner


def wrap(request: Request, data: Any) -> dict:
    return {"code": 0, "message": "success", "data": data, "trace_id": request.state.trace_id, "timestamp": now()}


def permissions(value: Any, owner: str) -> Any:
    if isinstance(value, list):
        return [permissions(item, owner) for item in value]
    if isinstance(value, dict):
        return {
            key: ([] if owner == "reader" else item) if key == "allowed_actions" else permissions(item, owner)
            for key, item in value.items()
        }
    return value


def read(request: Request, owner: str, action: Any) -> dict:
    with request.app.state.repo.transaction() as session:
        return wrap(request, permissions(action(session), owner))


def mutate(request: Request, owner: str, body: Any, action: Any) -> dict:
    key = request.headers.get("X-Request-Id", "")
    if not key or len(key) > 128:
        raise BusinessError("写操作必须提供有效请求编号", 422, 10001, "request_id_required")
    result = request.app.state.repo.idempotent(owner, request.method + " " + request.url.path, key, body, action)
    return wrap(request, result)


def paginate(items: list[dict], page: int, page_size: int, summary: list | None = None) -> dict:
    return {
        "items": items[(page - 1) * page_size : page * page_size],
        "total": len(items),
        "page": page,
        "page_size": page_size,
        "total_pages": (len(items) + page_size - 1) // page_size,
        "summary": summary or [],
    }


@router.get("/evaluation/session", response_model=Envelope[dict])
def session_info(request: Request, owner: str = Depends(identity)) -> dict:
    return wrap(
        request,
        {"role": owner, "allowed_actions": ["read", "write", "export"] if owner == "administrator" else ["read"]},
    )


@router.get("/evaluation/metrics", response_model=Envelope[Page[MetricOut]])
@router.get("/metrics", response_model=Envelope[Page[MetricOut]])
def metrics(
    request: Request,
    keyword: str = "",
    category: str = "",
    configuration_status: str = "",
    status: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    owner: str = Depends(identity),
) -> dict:
    def load(session: Session) -> dict:
        service = request.app.state.metrics
        rows = [service.project(session, m) for m in service.repo.list(session, Metric)]
        rows = [
            r
            for r in rows
            if keyword.lower() in (r["name"] + r["code"]).lower()
            and (not category or r["category"] == category)
            and (not status or r["status"] == status)
            and (not configuration_status or r["configuration_status"] == configuration_status)
        ]
        for row in rows:
            row["metric_code"] = row["code"]
        summary = [
            {"name": state, "value": sum(r["configuration_status"] == state for r in rows)}
            for state in ["published", "draft", "needs_definition"]
        ]
        return paginate(rows, page, page_size, summary)

    return read(request, owner, load)


@router.post("/metrics", response_model=Envelope[MetricOut])
def create_metric(request: Request, data: MetricCreate, owner: str = Depends(writer)) -> dict:
    return mutate(request, owner, data.model_dump(), lambda s: request.app.state.metrics.create(s, data))


@router.patch("/metrics/{metric_id}", response_model=Envelope[MetricOut])
def status_metric(request: Request, metric_id: str, data: MetricStatus, owner: str = Depends(writer)) -> dict:
    def action(session: Session) -> dict:
        metric = request.app.state.repo.get(session, Metric, metric_id)
        metric.status = data.status
        return request.app.state.metrics.project(session, metric)

    return mutate(request, owner, data.model_dump(), action)


@router.get("/metrics/{metric_id}/revisions", response_model=Envelope[Page[RevisionOut]])
def revisions(
    request: Request,
    metric_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    owner: str = Depends(identity),
) -> dict:
    def load(session: Session) -> dict:
        request.app.state.repo.get(session, Metric, metric_id)
        return paginate(
            [r.payload for r in request.app.state.repo.list(session, MetricRevision, metric_id)], page, page_size
        )

    return read(request, owner, load)


@router.get("/metrics/{metric_id}/revisions/{revision_id}", response_model=Envelope[RevisionOut])
def revision(request: Request, metric_id: str, revision_id: str, owner: str = Depends(identity)) -> dict:
    return read(request, owner, lambda s: request.app.state.metrics.revision(s, metric_id, revision_id).payload)


@router.post("/metrics/{metric_id}/revisions", response_model=Envelope[RevisionOut])
def revise(request: Request, metric_id: str, data: RevisionDefinition, owner: str = Depends(writer)) -> dict:
    return mutate(request, owner, data.model_dump(), lambda s: request.app.state.metrics.revise(s, metric_id, data))


@router.patch("/metrics/{metric_id}/revisions/{revision_id}", response_model=Envelope[RevisionOut])
def patch_revision(
    request: Request, metric_id: str, revision_id: str, data: RevisionPatch, owner: str = Depends(writer)
) -> dict:
    return mutate(
        request, owner, data.model_dump(), lambda s: request.app.state.metrics.patch(s, metric_id, revision_id, data)
    )


@router.post("/metrics/{metric_id}/revisions/{revision_id}/publish", response_model=Envelope[RevisionOut])
def publish(
    request: Request, metric_id: str, revision_id: str, data: ExpectedRevision, owner: str = Depends(writer)
) -> dict:
    return mutate(
        request,
        owner,
        data.model_dump(),
        lambda s: request.app.state.metrics.publish(s, metric_id, revision_id, data.expected_revision),
    )


@router.get("/evaluation/contexts", response_model=Envelope[ContextsOut])
def contexts(
    request: Request,
    kind: str = "task_result",
    keyword: str = "",
    source_kind: str = "",
    source_id: str = "",
    version_id: str = "",
    owner: str = Depends(identity),
) -> dict:
    return wrap(
        request,
        permissions(request.app.state.evaluation.contexts(source_kind or kind, keyword, source_id, version_id), owner),
    )


@router.post("/evaluation/preflights", response_model=Envelope[PreflightOut])
def preflight(request: Request, data: EvaluationConfig, owner: str = Depends(writer)) -> dict:
    return mutate(request, owner, data.model_dump(), lambda s: request.app.state.evaluation.preflight(s, data, owner))


@router.post("/tasks", response_model=Envelope[TaskOut])
def create_task(request: Request, data: TaskCreate, owner: str = Depends(writer)) -> dict:
    return mutate(
        request,
        owner,
        data.model_dump(),
        lambda s: request.app.state.tasks.create(s, data, owner, request.state.trace_id),
    )


@router.post("/tasks/execute", response_model=Envelope[TaskOut])
def execute_task(request: Request, data: TaskCreate, owner: str = Depends(writer)) -> dict:
    created = create_task(request, data, owner)["data"]
    with request.app.state.repo.transaction() as session:
        task = request.app.state.repo.get(session, Task, created["task_id"])
        if task.status == "pending":
            request.app.state.tasks.start(session, task.public_id)
    request.app.state.evaluation.execute(created["task_id"])
    return read(
        request,
        owner,
        lambda s: request.app.state.tasks.project(s, request.app.state.repo.get(s, Task, created["task_id"])),
    )


@router.get("/tasks", response_model=Envelope[Page[TaskOut]])
@router.get("/evaluation/tasks", response_model=Envelope[Page[TaskOut]])
def tasks(
    request: Request,
    keyword: str = "",
    status: str = "",
    stage: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    owner: str = Depends(identity),
) -> dict:
    def load(session: Session) -> dict:
        rows = [
            request.app.state.tasks.project(session, task)
            for task in request.app.state.repo.list(session, Task)
            if task.payload["capability_code"] == "evaluation"
        ]
        rows = [
            r
            for r in rows
            if keyword.lower() in r["name"].lower()
            and (not stage or r["target_stage"] == stage)
            and (not status or r["status"] == status)
        ]
        return paginate(
            rows,
            page,
            page_size,
            [
                {"name": state, "value": sum(r["status"] == state for r in rows)}
                for state in ["pending", "running", "failed"]
            ],
        )

    return read(request, owner, load)


@router.get("/tasks/{task_id}", response_model=Envelope[TaskOut])
def task_detail(request: Request, task_id: str, owner: str = Depends(identity)) -> dict:
    return read(
        request, owner, lambda s: request.app.state.tasks.project(s, request.app.state.repo.get(s, Task, task_id))
    )


@router.post("/tasks/{task_id}/start", response_model=Envelope[TaskOut])
def start(request: Request, task_id: str, data: StartRequest, owner: str = Depends(writer)) -> dict:
    return mutate(request, owner, data.model_dump(), lambda s: request.app.state.tasks.start(s, task_id))


@router.post("/tasks/{task_id}/cancel", response_model=Envelope[TaskOut])
def cancel(request: Request, task_id: str, owner: str = Depends(writer)) -> dict:
    return mutate(request, owner, {}, lambda s: request.app.state.tasks.cancel(s, task_id))


@router.post("/evaluation/runs/{run_id}/retries", response_model=Envelope[TaskOut])
def retry(request: Request, run_id: str, data: RetryRequest, owner: str = Depends(writer)) -> dict:
    return mutate(
        request,
        owner,
        data.model_dump(),
        lambda s: request.app.state.tasks.retry(s, run_id, owner, request.state.trace_id, data.reason),
    )


@router.get("/evaluation/tasks/{task_id}/progress", response_model=Envelope[TaskOut])
def progress(request: Request, task_id: str, owner: str = Depends(identity)) -> dict:
    return task_detail(request, task_id, owner)


@router.get("/evaluation/tasks/{task_id}/events", response_model=Envelope[dict])
def events(
    request: Request,
    task_id: str,
    cursor: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    owner: str = Depends(identity),
) -> dict:
    from .models import Event

    def load(session: Session) -> dict:
        request.app.state.repo.get(session, Task, task_id)
        rows = sorted(
            (e for e in request.app.state.repo.list(session, Event, task_id) if e.id > cursor), key=lambda e: e.id
        )
        return {
            "items": [e.payload for e in rows[:limit]],
            "next_cursor": rows[min(limit, len(rows)) - 1].id if rows else cursor,
            "has_more": len(rows) > limit,
        }

    return read(request, owner, load)


@router.get("/evaluation/runs", response_model=Envelope[Page[RunOut]])
@router.get("/evaluation/records", response_model=Envelope[Page[RunOut]])
@router.get("/test-records", response_model=Envelope[dict])
def runs(
    request: Request,
    terminal_only: bool = True,
    keyword: str = "",
    judgment_status: str = "",
    integrity_state: str = "",
    from_date: str = Query("", alias="from"),
    to_date: str = Query("", alias="to"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    owner: str = Depends(identity),
) -> dict:
    def load(session: Session) -> dict:
        rows = [
            request.app.state.evaluation.run_detail(session, r.public_id)
            for r in request.app.state.repo.list(session, Run)
            if not terminal_only or r.status not in {"pending", "running"}
        ]
        rows = [
            r
            for r in rows
            if keyword.lower() in (r["name"] + r["test_no"]).lower()
            and (not judgment_status or r["judgment_status"] == judgment_status)
            and (not integrity_state or r["integrity_state"] == integrity_state)
            and (not from_date or r["created_at"] >= from_date)
            and (not to_date or r["created_at"][:10] <= to_date)
        ]
        for row in rows:
            row["exports"] = [j.payload for j in request.app.state.repo.list(session, Export, row["run_id"])]
        if request.url.path.endswith("/test-records"):
            rows = [
                {**r, "id": r["record_id"], "result": r["judgment_status"]}
                for r in rows
                if r["judgment_status"] in {"passed", "failed"}
            ]
        return paginate(rows, page, page_size)

    return read(request, owner, load)


@router.get("/evaluation/record-resolutions", response_model=Envelope[ResolutionOut])
def resolve_record(request: Request, record_id: str, owner: str = Depends(identity)) -> dict:
    return read(request, owner, lambda s: request.app.state.evaluation.resolve_record(s, record_id))


@router.get("/evaluation/runs/{run_id}", response_model=Envelope[RunOut])
def run_detail(request: Request, run_id: str, owner: str = Depends(identity)) -> dict:
    return read(request, owner, lambda s: request.app.state.evaluation.run_detail(s, run_id))


@router.get("/evaluation/runs/{run_id}/samples", response_model=Envelope[Page[Sample]])
def samples(
    request: Request,
    run_id: str,
    metric_code: str = "",
    outcome: str = "failed",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    owner: str = Depends(identity),
) -> dict:
    def load(session: Session) -> dict:
        detail = request.app.state.evaluation.run_detail(session, run_id)
        task = request.app.state.repo.get(session, Task, detail["task_id"])
        snapshot = request.app.state.repo.get(session, Plan, task.payload["plan_id"]).payload["snapshot"]
        run = request.app.state.repo.get(session, Run, run_id)
        source = run.payload.get("execution_source") or snapshot["resolved_refs"][0]
        metric = next((m for m in snapshot["metric_revisions"] if m["metric_code"] == metric_code), None)
        if metric_code and not metric:
            raise BusinessError("该运行不包含指定指标", 404, 10002)
        formula = metric["formula_code"] if metric else "accuracy"
        if formula not in {"accuracy", "recall", "coverage", "fpr", "risk_reduction"}:
            return paginate([], page, page_size)
        rows = source["samples"]
        if outcome == "failed":
            if formula == "fpr":
                rows = [s for s in rows if s["expected"] is False and s["predicted"] is True]
            elif formula == "coverage":
                rows = [s for s in rows if s["required"] and s["predicted"] is not True]
            elif formula == "recall":
                rows = [s for s in rows if s["expected"] is True and s["predicted"] is not True]
            elif formula == "risk_reduction":
                rows = [s for s in rows if s["predicted"] is True]
            else:
                rows = [s for s in rows if s["predicted"] != s["expected"]]
        return paginate(rows, page, page_size)

    return read(request, owner, load)


@router.get("/evaluation/runs/{run_id}/evidence", response_model=Envelope[ManifestOut])
def evidence_manifest(request: Request, run_id: str, owner: str = Depends(identity)) -> dict:
    return read(request, owner, lambda s: request.app.state.evaluation.evidence_manifest(s, run_id))


@router.get("/evaluation/evidence/{evidence_id}", response_model=Envelope[EvidenceOut])
def evidence_detail(request: Request, evidence_id: str, owner: str = Depends(identity)) -> dict:
    return read(request, owner, lambda s: request.app.state.evaluation.evidence(s, evidence_id))


@router.post("/evaluation/runs/{run_id}/exports", response_model=Envelope[ExportOut])
def export(request: Request, run_id: str, data: ExportRequest, owner: str = Depends(writer)) -> dict:
    return mutate(request, owner, data.model_dump(), lambda s: request.app.state.exports.create(s, run_id, data, owner))


@router.get("/evaluation/exports/{export_id}", response_model=Envelope[ExportOut])
def export_status(request: Request, export_id: str, owner: str = Depends(identity)) -> dict:
    return read(request, owner, lambda s: request.app.state.repo.get(s, Export, export_id).payload)


@router.post("/evaluation/artifacts/{artifact_id}/download-tickets", response_model=Envelope[TicketOut])
def download_ticket(request: Request, artifact_id: str, owner: str = Depends(writer)) -> dict:
    return mutate(request, owner, {}, lambda s: request.app.state.exports.ticket(s, artifact_id, owner))


@router.get("/evaluation/downloads/{token}")
def download(request: Request, token: str) -> FileResponse:
    with request.app.state.repo.transaction() as session:
        path, name = request.app.state.exports.download(session, token)
    return FileResponse(
        path, filename=name, media_type="application/octet-stream", headers={"Cache-Control": "no-store"}
    )


@router.get("/datasets", response_model=Envelope[dict])
@router.get("/models", response_model=Envelope[dict])
def upstream_resources(request: Request, owner: str = Depends(identity)) -> dict:
    raise BusinessError("资源登记服务尚未接入，请在来源模块完成登记", 502, 30001, "upstream_unavailable")
