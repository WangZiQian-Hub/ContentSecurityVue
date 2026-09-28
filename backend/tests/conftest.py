from copy import deepcopy
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.core import BusinessError
from app.evaluation_service import source_hash
from app.main import create_app
from app.schemas import SourceContext, SourceRef


def source_fixture() -> SourceContext:
    """Synthetic test-only labels: TP480, FN20, FP30, TN470. Never seeded into production."""
    samples = []
    for expected, predicted, count in [(True, True, 480), (True, False, 20), (False, True, 30), (False, False, 470)]:
        for _ in range(count):
            samples.append(
                {
                    "sample_id": f"fixture-s-{len(samples)}",
                    "expected": expected,
                    "predicted": predicted,
                    "required": expected,
                    "baseline": True,
                }
            )
    source = SourceContext.model_validate(
        {
            "entity_type": "task_result",
            "entity_id": "fixture-result",
            "version_id": "fixture-result-v1",
            "name": "仅用于自动测试的可追溯夹具",
            "source_module": "risk-classification",
            "source_task_id": "fixture-source-task",
            "source_trace_id": "fixture-trace",
            "task_trace_id": "fixture-trace",
            "capability_code": "semantic_risk",
            "status": "succeeded",
            "algorithm_mode": "real",
            "dataset_id": "fixture-dataset",
            "model_id": "fixture-model",
            "dataset_version": "fixture-dsv1",
            "label_version": "fixture-labels1",
            "model_version": "v1.0.0",
            "result_dataset_version": "fixture-dsv1",
            "result_label_version": "fixture-labels1",
            "result_model_version": "v1.0.0",
            "evaluator_version": "fixture-eval1",
            "positive_class": "独立标注的风险样本",
            "baseline_evaluator_version": "fixture-eval1",
            "sample_ids": [s["sample_id"] for s in samples],
            "samples": samples,
            "captured_at": "2026-09-28T00:00:00+00:00",
            "interface": "fixture://automated-tests/semantic_risk",
            "content_hash": "",
            "record_ids": ["fixture-legacy-record"],
            "can_rerun": True,
        }
    )
    source.content_hash = source_hash(source)
    return source


class FixtureAdapter:
    def __init__(self):
        self.source = source_fixture()
        self.fail_rerun = False
        self.invocations = []

    def contexts(self, kind: str, keyword: str = "") -> list[SourceContext]:
        return [deepcopy(self.source)]

    def resolve(self, ref: SourceRef) -> SourceContext:
        return deepcopy(self.source)

    def rerun(self, source: SourceContext, child_task_id: str) -> SourceContext:
        self.invocations.append(child_task_id)
        if self.fail_rerun:
            raise BusinessError("测试夹具模拟上游失败", 502, 30001, "upstream_unavailable")
        return deepcopy(self.source)


@pytest.fixture
def environment(tmp_path):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        artifact_dir=tmp_path / "artifacts",
        admin_token="automated-test-admin",
        reader_token="automated-test-reader",
        worker_enabled=False,
    )
    adapter = FixtureAdapter()
    app = create_app(settings, adapter)
    app.state.repo.initialize()
    with TestClient(app) as client:
        client.headers["Authorization"] = "Bearer automated-test-admin"
        yield app, client, adapter, settings


def post(client, path, body=None, key=None):
    return client.post("/api/v1" + path, json=body, headers={"X-Request-Id": key or str(uuid4())})


def data(response):
    assert response.status_code == 200, response.text
    envelope = response.json()
    assert envelope["code"] == 0 and envelope["trace_id"] and envelope["timestamp"]
    return envelope["data"]


def publish_metrics(client):
    metrics = data(client.get("/api/v1/evaluation/metrics?page_size=100"))["items"]
    selected = []
    for metric in metrics:
        if metric["code"] not in {"alert_coverage", "false_positive_rate"}:
            continue
        revision = metric["latest_revision"]
        from app.schemas import RevisionDefinition

        definition = RevisionDefinition.model_validate(
            {k: revision[k] for k in RevisionDefinition.model_fields}
        ).model_dump()
        definition["positive_class"] = "独立标注的风险样本"
        base = f"/metrics/{metric['metric_id']}/revisions/{revision['revision_id']}"
        patched = data(
            client.patch(
                "/api/v1" + base,
                json={"expected_revision": 1, "definition": definition},
                headers={"X-Request-Id": str(uuid4())},
            )
        )
        data(post(client, base + "/publish", {"expected_revision": patched["expected_revision"]}))
        selected.append(revision["revision_id"])
    return selected


def config_fixture(client):
    return {
        "schema_version": "1.0",
        "target_stage": "final",
        "execution_mode": "reference",
        "source_refs": [
            {"entity_type": "task_result", "entity_id": "fixture-result", "version_id": "fixture-result-v1"}
        ],
        "dataset_version_ref": "fixture-dsv1",
        "label_version_ref": "fixture-labels1",
        "model_version_ref": "v1.0.0",
        "metric_revision_refs": publish_metrics(client),
        "sample_scope": {"mode": "all"},
    }


def create_task(client, config, key=None):
    checked = data(post(client, "/evaluation/preflights", config))
    assert checked["can_create"], checked
    config = {**config, "preflight_token": checked["token"]}
    body = {"capability_code": "evaluation", "name": "自动化夹具验收", "input": {}, "config": {"evaluation": config}}
    return data(post(client, "/tasks", body, key)), body


def complete(app, client, config):
    task, body = create_task(client, config)
    data(post(client, f"/tasks/{task['task_id']}/start", {"expected_status": "pending"}))
    app.state.evaluation.execute(task["task_id"])
    return data(client.get(f"/api/v1/evaluation/runs/{task['run_id']}")), body
