import hashlib
import io
import json
import zipfile
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.calculation import compute_metric, judge
from app.core import digest
from app.evaluation_service import source_hash
from app.main import create_app
from app.models import Evidence, MetricRevision, RecordLink, Task, Ticket
from app.schemas import RevisionDefinition
from tests.conftest import complete, config_fixture, create_task, data, post, source_fixture


def definition(formula, value=0.95, comparator="gte"):
    return {
        "formula_code": formula,
        "unit": "ratio",
        "parameters": [],
        "thresholds": [{"stage": "final", "value": value, "comparator": comparator, "unit": "ratio"}],
    }


def test_exact_formulas_and_boundaries():
    source = source_fixture()
    coverage = compute_metric(definition("coverage"), source, "final")
    fpr = compute_metric(definition("fpr", 0.05, "lte"), source, "final")
    assert (coverage["value"], coverage["denominator"], coverage["judgment_status"]) == (0.96, 500, "passed")
    assert (fpr["value"], fpr["denominator"], fpr["judgment_status"]) == (0.06, 500, "failed")
    assert compute_metric(definition("coverage", 0.96), source, "final")["judgment_status"] == "passed"
    assert compute_metric(definition("coverage", 0.96000001), source, "final")["judgment_status"] == "failed"
    source.samples = [s for s in source.samples if s.expected]
    assert compute_metric(definition("fpr"), source, "final")["reason_code"] == "zero_denominator"
    for sample in source.samples:
        sample.baseline = False
    assert compute_metric(definition("risk_reduction"), source, "final")["reason_code"] == "zero_denominator"
    assert judge([coverage, fpr, {"judgment_status": "inconclusive"}]) == "failed"
    assert judge([coverage, {"judgment_status": "inconclusive"}]) == "inconclusive"
    assert judge([]) == "inconclusive"


def test_real_persistence_and_immutable_revision(environment):
    app, client, _, _ = environment
    config = config_fixture(client)
    run, _ = complete(app, client, config)
    assert run["task_status"] == "succeeded" and run["judgment_status"] == "failed"
    assert len(run["metric_results"]) == 2
    before = digest(run)
    evidence = data(client.get(f"/api/v1/evaluation/runs/{run['run_id']}/evidence"))
    assert evidence["integrity_state"] == "complete"
    assert all(check["valid"] for check in evidence["checks"])
    revision = run["snapshot"]["metric_revisions"][0]
    revised = {k: revision[k] for k in RevisionDefinition.model_fields}
    revised["thresholds"][0]["value"] = 0.01
    new = data(post(client, f"/metrics/{revision['metric_id']}/revisions", revised))
    data(
        post(
            client, f"/metrics/{revision['metric_id']}/revisions/{new['revision_id']}/publish", {"expected_revision": 1}
        )
    )
    assert digest(data(client.get(f"/api/v1/evaluation/runs/{run['run_id']}"))) == before
    after = data(client.get(f"/api/v1/evaluation/runs/{run['run_id']}/evidence"))
    assert [e["sha256"] for e in after["entries"]] == [e["sha256"] for e in evidence["entries"]]
    resolution = data(client.get("/api/v1/evaluation/record-resolutions?record_id=fixture-legacy-record"))
    assert resolution["run_id"] == run["run_id"]


@pytest.mark.parametrize(
    "failure", ["labels", "samples", "model", "dataset", "trace", "hash", "algorithm", "stage", "unpublished"]
)
def test_preflight_blocks_invalid_sources(environment, failure):
    app, client, adapter, _ = environment
    config = config_fixture(client)
    if failure == "labels":
        adapter.source.samples[0].expected = None
    elif failure == "samples":
        adapter.source.samples.pop()
    elif failure == "model":
        adapter.source.result_model_version = "v2.0.0"
    elif failure == "dataset":
        adapter.source.result_dataset_version = "other"
    elif failure == "trace":
        adapter.source.task_trace_id = "other"
    elif failure == "algorithm":
        adapter.source.algorithm_mode = "mock"
    elif failure == "stage":
        config["target_stage"] = "midterm"
    elif failure == "unpublished":
        with app.state.repo.transaction() as session:
            revision = next(r for r in app.state.repo.list(session, MetricRevision) if r.status == "draft")
            config["metric_revision_refs"] = [revision.public_id]
    adapter.source.content_hash = source_hash(adapter.source) if failure != "hash" else "bad"
    check = data(post(client, "/evaluation/preflights", config))
    assert not check["can_create"] and check["token"] is None and check["issues"]


def test_create_rechecks_version_drift(environment):
    _, client, adapter, _ = environment
    config = config_fixture(client)
    checked = data(post(client, "/evaluation/preflights", config))
    adapter.source.samples[0].predicted = False
    adapter.source.content_hash = source_hash(adapter.source)
    response = post(
        client,
        "/tasks",
        {"capability_code": "evaluation", "config": {"evaluation": {**config, "preflight_token": checked["token"]}}},
    )
    assert response.status_code == 409


def test_idempotency_and_concurrent_start_cancel(environment):
    app, client, _, _ = environment
    config = config_fixture(client)
    task, body = create_task(client, config, "create-once")
    assert data(post(client, "/tasks", body, "create-once"))["task_id"] == task["task_id"]
    assert post(client, "/tasks", {**body, "name": "different"}, "create-once").status_code == 409
    path = f"/tasks/{task['task_id']}/start"
    first = data(post(client, path, {"expected_status": "pending"}, "start-once"))
    assert data(post(client, path, {"expected_status": "pending"}, "start-once")) == first
    assert len(data(client.get("/api/v1/evaluation/tasks"))["items"]) == 1
    task2, _ = create_task(client, config)
    with ThreadPoolExecutor(2) as pool:
        futures = [
            pool.submit(
                post,
                client,
                f"/tasks/{task2['task_id']}/{action}",
                {"expected_status": "pending"} if action == "start" else None,
            )
            for action in ["start", "cancel"]
        ]
        responses = [f.result() for f in futures]
    assert all(r.status_code in {200, 409} for r in responses)
    app.state.evaluation.execute(task2["task_id"])
    detail = data(client.get(f"/api/v1/evaluation/runs/{task2['run_id']}"))
    assert detail["task_status"] == "cancelled" and detail["judgment_status"] == "inconclusive"


def test_retry_children_and_restart(environment):
    app, client, adapter, settings = environment
    config = config_fixture(client)
    config["execution_mode"] = "rerun"
    adapter.fail_rerun = True
    run, _ = complete(app, client, config)
    assert run["task_status"] == "failed" and run["judgment_status"] == "inconclusive"
    retry = data(post(client, f"/evaluation/runs/{run['run_id']}/retries", {"reason": "恢复上游"}))
    assert retry["run_id"] != run["run_id"]
    adapter.fail_rerun = False
    data(post(client, f"/tasks/{retry['task_id']}/start", {}))
    app.state.evaluation.execute(retry["task_id"])
    assert data(client.get(f"/api/v1/evaluation/runs/{retry['run_id']}"))["attempt_no"] == 2
    pending, _ = create_task(client, config)
    data(post(client, f"/tasks/{pending['task_id']}/start", {}))
    second = create_app(settings, adapter)
    with TestClient(second) as restarted:
        restarted.headers["Authorization"] = "Bearer automated-test-admin"
        recovered = data(restarted.get(f"/api/v1/tasks/{pending['task_id']}"))
        assert recovered["status"] == "failed" and recovered["reason_code"] == "worker_interrupted"
        assert data(restarted.get(f"/api/v1/evaluation/runs/{retry['run_id']}"))["task_status"] == "succeeded"
    with app.state.repo.transaction() as session:
        assert app.state.repo.list(session, Task, retry["task_id"])[0].status == "succeeded"


def test_exports_manifest_authorization_and_expiry(environment):
    app, client, _, _ = environment
    run, _ = complete(app, client, config_fixture(client))
    for kind in ["report", "evidence_bundle"]:
        job = data(post(client, f"/evaluation/runs/{run['run_id']}/exports", {"kind": kind}))
        assert job["state"] == "queued" and not job["artifact_id"]
        app.state.exports.generate(job["export_id"])
        job = data(client.get(f"/api/v1/evaluation/exports/{job['export_id']}"))
        assert job["state"] == "succeeded"
        ticket = data(post(client, f"/evaluation/artifacts/{job['artifact_id']}/download-tickets"))
        response = client.get(ticket["url"])
        assert response.status_code == 200
        assert hashlib.sha256(response.content).hexdigest() == ticket["sha256"]
        if kind == "evidence_bundle":
            with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
                manifest = json.loads(archive.read("manifest.json"))
                assert digest(manifest) == job["manifest_hash"]
                for entry in manifest["entries"]:
                    assert hashlib.sha256(archive.read(entry["file_name"])).hexdigest() == entry["sha256"]
        else:
            assert "测试评估报告" in response.content.decode()
        with app.state.repo.transaction() as session:
            for row in app.state.repo.list(session, Ticket):
                row.payload = {"expires_at": "2000-01-01"}
        assert client.get(ticket["url"]).status_code == 403
    client.headers["Authorization"] = "Bearer automated-test-reader"
    assert post(client, f"/evaluation/runs/{run['run_id']}/exports", {"kind": "report"}).status_code == 403
    assert not data(client.get(f"/api/v1/evaluation/runs/{run['run_id']}"))["allowed_actions"]
    del client.headers["Authorization"]
    assert client.get("/api/v1/evaluation/metrics").status_code == 401


def test_evidence_corruption_prevents_export(environment):
    app, client, _, _ = environment
    run, _ = complete(app, client, config_fixture(client))
    with app.state.repo.transaction() as session:
        evidence = app.state.repo.list(session, Evidence, run["run_id"])[0]
        altered = deepcopy(evidence.payload)
        altered["material"]["calculation"]["value"] = 1
        evidence.payload = altered
    assert post(client, f"/evaluation/runs/{run['run_id']}/exports", {"kind": "report"}).status_code == 422


def test_record_resolution_states(environment):
    app, client, _, _ = environment
    assert data(client.get("/api/v1/evaluation/record-resolutions?record_id=mock_record"))["resolution"] == "demo_only"
    assert data(client.get("/api/v1/evaluation/record-resolutions?record_id=missing"))["resolution"] == "not_found"
    with app.state.repo.transaction() as session:
        for record_id, parent in [("conflict", "missing"), ("ambiguous", "one"), ("ambiguous", "two")]:
            session.add(
                RecordLink(
                    public_id=str(uuid4()),
                    parent_id=parent,
                    record_id=record_id,
                    namespace="test",
                    status="linked",
                    payload={},
                )
            )
    assert data(client.get("/api/v1/evaluation/record-resolutions?record_id=conflict"))["resolution"] == "conflict"
    assert data(client.get("/api/v1/evaluation/record-resolutions?record_id=ambiguous"))["resolution"] == "ambiguous"


def test_unpublished_is_readonly_and_reserved_definitions(environment):
    _, client, _, _ = environment
    config = config_fixture(client)
    metrics = data(client.get("/api/v1/evaluation/metrics?page_size=100"))["items"]
    coverage = next(m for m in metrics if m["code"] == "alert_coverage")
    revision = coverage["active_revision"]
    definition_body = {k: revision[k] for k in RevisionDefinition.model_fields}
    response = client.patch(
        f"/api/v1/metrics/{coverage['metric_id']}/revisions/{revision['revision_id']}",
        json={"expected_revision": revision["expected_revision"], "definition": definition_body},
        headers={"X-Request-Id": str(uuid4())},
    )
    assert response.status_code == 409
    metric = next(m for m in metrics if m["code"] == "pollution_identification_rate")
    assert (
        post(
            client,
            f"/metrics/{metric['metric_id']}/revisions/{metric['latest_revision']['revision_id']}/publish",
            {"expected_revision": 1},
        ).status_code
        == 422
    )
    checked = data(post(client, "/evaluation/preflights", config))
    body = {
        "capability_code": "evaluation",
        "config": {"evaluation": {**config, "preflight_token": checked["token"], "measured_value": 1}},
    }
    assert post(client, "/tasks", body).status_code == 422


def test_legacy_execute_shape_and_contract(environment):
    _, client, adapter, _ = environment
    config_fixture(client)
    from app.schemas import Fact

    adapter.source.facts = [Fact(key="baseline_version:v0.9.0", count=1, evidence_ref="fixture-baseline")]
    adapter.source.content_hash = source_hash(adapter.source)
    body = {
        "capability_code": "evaluation",
        "input": {
            "metric_codes": ["alert_coverage", "false_positive_rate"],
            "model_id": "fixture-model",
            "dataset_id": "fixture-dataset",
        },
        "config": {"baseline_version": "v0.9.0", "edited_version": "v1.0.0", "dataset_version": "fixture-dsv1"},
    }
    task = data(post(client, "/tasks/execute", body, "legacy-execute"))
    assert task["status"] == "succeeded" and len(task["result"]["results"]) == 2
    assert data(post(client, "/tasks/execute", body, "legacy-execute"))["task_id"] == task["task_id"]
    listing = data(client.get("/api/v1/test-records"))
    assert listing["items"][0]["result"] == "failed"
    assert client.get("/api/v1/evaluation/metrics?page=0").status_code == 422
