import time

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from tests.conftest import FixtureAdapter, config_fixture, create_task, data, post


def test_persistent_worker_executes_and_exports_without_frontend_timer(tmp_path):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'worker.db'}",
        artifact_dir=tmp_path / "exports",
        admin_token="automated-test-admin",
        worker_enabled=True,
    )
    app = create_app(settings, FixtureAdapter())
    app.state.repo.initialize()
    with TestClient(app) as client:
        client.headers["Authorization"] = "Bearer automated-test-admin"
        task, _ = create_task(client, config_fixture(client))
        data(post(client, f"/tasks/{task['task_id']}/start", {}))
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            run = data(client.get(f"/api/v1/evaluation/runs/{task['run_id']}"))
            if run["task_status"] == "succeeded":
                break
            time.sleep(0.05)
        assert run["judgment_status"] == "failed"
        job = data(post(client, f"/evaluation/runs/{run['run_id']}/exports", {"kind": "report"}))
        while time.monotonic() < deadline:
            job = data(client.get(f"/api/v1/evaluation/exports/{job['export_id']}"))
            if job["state"] in {"succeeded", "failed"}:
                break
            time.sleep(0.05)
        assert job["state"] == "succeeded"


def test_unconnected_adapter_returns_explicit_unavailability(tmp_path):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'unconnected.db'}",
        artifact_dir=tmp_path / "exports",
        admin_token="automated-test-admin",
        worker_enabled=False,
        upstream_url="",
    )
    app = create_app(settings)
    app.state.repo.initialize()
    with TestClient(app) as client:
        client.headers["Authorization"] = "Bearer automated-test-admin"
        result = data(client.get("/api/v1/evaluation/contexts?kind=task_result"))
        assert result["resolution"] == "unavailable" and not result["candidates"]
        response = post(
            client,
            "/tasks/execute",
            {
                "capability_code": "evaluation",
                "config": {"baseline_version": "v1", "edited_version": "v2", "dataset_version": "d1"},
                "input": {"model_id": 1, "dataset_id": 1, "metric_codes": ["risk_reduction_rate"]},
            },
        )
        assert response.status_code == 502
        assert response.json()["data"]["reason_code"] == "upstream_unavailable"
