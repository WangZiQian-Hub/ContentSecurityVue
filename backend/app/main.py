import logging
import threading
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from .adapters import HttpSourceAdapter, SourceAdapter
from .api import router
from .config import Settings
from .core import BusinessError, now, uid
from .evaluation_service import EvaluationService
from .export_service import ExportService
from .metric_service import MetricService
from .models import Export, Task
from .repositories import Repository
from .task_service import TaskService


def create_app(settings: Settings | None = None, adapter: SourceAdapter | None = None) -> FastAPI:
    settings = settings or Settings()
    repository = Repository(settings.database_url)
    evaluation = EvaluationService(repository, adapter or HttpSourceAdapter(settings))
    metrics = MetricService(repository)
    tasks = TaskService(repository, evaluation)
    exports = ExportService(repository, evaluation, settings)
    stop = threading.Event()

    def worker() -> None:
        while not stop.wait(0.25):
            try:
                with repository.transaction() as session:
                    task_ids = [
                        t.public_id
                        for t in repository.list(session, Task)
                        if t.status == "running" and t.payload["capability_code"] == "evaluation"
                    ]
                    export_ids = [e.public_id for e in repository.list(session, Export) if e.status == "queued"]
                for task_id in task_ids:
                    evaluation.execute(task_id)
                for export_id in export_ids:
                    exports.generate(export_id)
            except Exception:
                logging.exception("evaluation worker loop failed")

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        # Alembic upgrade is required before serving; tests explicitly initialize isolated databases.
        metrics.seed()
        tasks.recover()
        with repository.transaction() as session:
            for job in repository.list(session, Export):
                if job.status == "running":
                    job.status = "queued"
                    job.payload = {**job.payload, "state": "queued"}
        thread = threading.Thread(target=worker, daemon=True)
        if settings.worker_enabled:
            thread.start()
        yield
        stop.set()
        if thread.is_alive():
            thread.join(timeout=35)
        repository.engine.dispose()

    app = FastAPI(title="Content Safety Evaluation API", version="1.0.0", lifespan=lifespan)
    app.state.settings, app.state.repo = settings, repository
    app.state.evaluation, app.state.metrics = evaluation, metrics
    app.state.tasks, app.state.exports = tasks, exports

    @app.middleware("http")
    async def trace(request: Request, call_next):
        supplied = request.headers.get("X-Trace-Id", "")
        request.state.trace_id = (
            supplied if 0 < len(supplied) <= 100 and supplied.replace("_", "").isalnum() else uid("trc")
        )
        response = await call_next(request)
        response.headers["X-Trace-Id"] = request.state.trace_id
        return response

    def error_response(request: Request, error: BusinessError) -> JSONResponse:
        return JSONResponse(
            status_code=error.status,
            content={
                "code": error.code,
                "message": error.message,
                "data": {"reason_code": error.reason, "issues": error.issues},
                "trace_id": request.state.trace_id,
                "timestamp": now(),
            },
        )

    @app.exception_handler(BusinessError)
    async def business_error(request: Request, error: BusinessError) -> JSONResponse:
        return error_response(request, error)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError) -> JSONResponse:
        issues = [
            {"field": ".".join(str(p) for p in e["loc"]), "reason_code": "invalid_input", "message": e["msg"]}
            for e in error.errors()
        ]
        return error_response(request, BusinessError("请求字段不符合要求", issues=issues))

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, error: HTTPException) -> JSONResponse:
        return error_response(
            request,
            BusinessError("接口或资源不存在" if error.status_code == 404 else "请求无法处理", error.status_code),
        )

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, error: Exception) -> JSONResponse:
        logging.exception("request failed trace_id=%s", request.state.trace_id)
        return error_response(
            request, BusinessError("服务处理失败，请保留链路编号联系管理员", 500, 10000, "internal_error")
        )

    app.include_router(router)
    return app


app = create_app()
