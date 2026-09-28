import hashlib
import html
import io
import secrets
import zipfile
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from .config import Settings
from .core import BusinessError, canonical, digest, now, uid
from .evaluation_service import EvaluationService
from .models import Event, Evidence, Export, Plan, Task, Ticket
from .repositories import Repository
from .schemas import ExportRequest


class ExportService:
    def __init__(self, repo: Repository, evaluation: EvaluationService, settings: Settings):
        self.repo, self.evaluation, self.settings = repo, evaluation, settings
        settings.artifact_dir.mkdir(parents=True, exist_ok=True)

    def create(self, session: Session, run_id: str, request: ExportRequest, owner: str) -> dict:
        expected_format = "html" if request.kind == "report" else "zip"
        if request.format and request.format != expected_format:
            raise BusinessError("导出类型与文件格式不匹配")
        manifest = self.evaluation.evidence_manifest(session, run_id)
        if manifest["integrity_state"] != "complete":
            raise BusinessError("材料不完整或校验失败，暂不能生成正式报告", 422, 60002, "evidence_missing")
        export_id = uid("exp")
        payload = {
            "export_id": export_id,
            "run_id": run_id,
            "kind": request.kind,
            "state": "queued",
            "artifact_id": None,
            "error": None,
            "manifest_hash": None,
            "created_at": now(),
            "finished_at": None,
        }
        session.add(Export(public_id=export_id, owner=owner, parent_id=run_id, status="queued", payload=payload))
        return payload

    def generate(self, export_id: str) -> None:
        try:
            with self.repo.transaction() as session:
                job = self.repo.get(session, Export, export_id)
                if job.status != "queued":
                    return
                job.status = "running"
                job.payload = {**job.payload, "state": "running"}
            with self.repo.transaction() as session:
                job = self.repo.get(session, Export, export_id)
                run_id = job.parent_id or ""
                if self.evaluation.evidence_manifest(session, run_id)["integrity_state"] != "complete":
                    raise BusinessError("证据校验失败", reason="evidence_missing")
                run = self.evaluation.run_detail(session, run_id)
                task = self.repo.get(session, Task, run["task_id"])
                plan = self.repo.get(session, Plan, task.payload["plan_id"])
                files = {
                    "snapshot.json": canonical(plan.payload["snapshot"]),
                    "results.json": canonical(run["metric_results"]),
                    "events.json": canonical([e.payload for e in self.repo.list(session, Event, run["task_id"])]),
                }
                for evidence in self.repo.list(session, Evidence, run_id):
                    files[f"evidence/{evidence.public_id}.json"] = canonical(evidence.payload["material"])
                manifest = {
                    "run_id": run_id,
                    "algorithm_mode": run["algorithm_mode"],
                    "redaction_profile": "standard",
                    "entries": [
                        {
                            "file_name": name,
                            "sha256": hashlib.sha256(content).hexdigest(),
                            "size_bytes": len(content),
                            "source_refs": run["snapshot"]["resolved_refs"],
                            "redacted_fields": ["raw_content"],
                        }
                        for name, content in files.items()
                    ],
                }
                manifest_hash = digest(manifest)
                if job.payload["kind"] == "evidence_bundle":
                    buffer = io.BytesIO()
                    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
                        for name, content in files.items():
                            archive.writestr(name, content)
                        archive.writestr("manifest.json", canonical(manifest))
                    content = buffer.getvalue()
                    suffix = "zip"
                else:
                    content = self.report(run, manifest_hash, task.owner).encode("utf-8")
                    suffix = "html"
                artifact_id = uid("artifact")
                path = self.settings.artifact_dir / f"{artifact_id}.{suffix}"
                path.write_bytes(content)
                job.status = "succeeded"
                job.payload = {
                    **job.payload,
                    "state": "succeeded",
                    "artifact_id": artifact_id,
                    "file_name": path.name,
                    "sha256": hashlib.sha256(content).hexdigest(),
                    "manifest_hash": manifest_hash,
                    "finished_at": now(),
                    "error": None,
                }
        except Exception:
            with self.repo.transaction() as session:
                job = self.repo.get(session, Export, export_id)
                job.status = "failed"
                job.payload = {
                    **job.payload,
                    "state": "failed",
                    "error": "报告生成失败，请检查证据材料或存储空间",
                    "finished_at": now(),
                }

    @staticmethod
    def report(run: dict, manifest_hash: str, owner: str) -> str:
        def escape(value: object) -> str:
            return html.escape(str(value))

        rows = "".join(
            "<tr>"
            + "".join(
                f"<td>{escape(value)}</td>"
                for value in [
                    result["name"],
                    result["formula"],
                    result["numerator"],
                    result["denominator"],
                    result["value"],
                    result["threshold_snapshot"],
                    result["judgment_status"],
                    result["reason_code"],
                ]
            )
            + "</tr>"
            for result in run["metric_results"]
        )
        return f"""<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>测试评估报告</title>
<style>body{{font:16px/1.7 system-ui;max-width:1100px;margin:40px auto;color:#16315a}}table{{border-collapse:collapse;width:100%}}td,th{{border:1px solid #cedced;padding:8px}}pre{{white-space:pre-wrap;overflow-wrap:anywhere}}h1{{color:#0965ce}}</style>
<h1>测试评估报告</h1><p>{escape(run["name"])} · {escape(run["test_no"])}</p>
<p>执行人：{escape(owner)} · 阶段：{escape(run["snapshot"]["target_stage"])} · 算法模式：{escape(run["algorithm_mode"])}</p>
<p>时间：{escape(run["started_at"])} — {escape(run["finished_at"])}</p>
<p>验收结论：{escape(run["judgment_status"])} · 运行：{escape(run["run_id"])} · 重试来源：{escape(run["retry_of"])}</p>
<h2>逐项测量</h2><table><tr><th>指标</th><th>公式</th><th>分子</th><th>分母</th><th>实测</th><th>冻结阈值</th><th>判定</th><th>原因</th></tr>{rows}</table>
<h2>冻结范围、版本与指标修订</h2><pre>{escape(canonical(run["snapshot"]).decode())}</pre>
<h2>留痕五要素</h2><p>输入、时间、接口、版本、输出：完整且已核验。</p>
<p>证据 manifest SHA-256：{escape(manifest_hash)}。哈希用于一致性校验。</p></html>"""

    def ticket(self, session: Session, artifact_id: str, owner: str) -> dict:
        job = next((j for j in self.repo.list(session, Export) if j.payload.get("artifact_id") == artifact_id), None)
        if not job or job.status != "succeeded":
            raise BusinessError("报告尚未生成或文件不存在", 404, 10002)
        token = secrets.token_urlsafe(32)
        expires = (datetime.now(UTC) + timedelta(seconds=self.settings.ticket_seconds)).isoformat()
        session.add(
            Ticket(
                public_id=hashlib.sha256(token.encode()).hexdigest(),
                owner=owner,
                parent_id=job.public_id,
                status="issued",
                payload={"expires_at": expires},
            )
        )
        return {
            "url": f"/api/v1/evaluation/downloads/{token}",
            "expires_at": expires,
            "file_name": job.payload["file_name"],
            "sha256": job.payload["sha256"],
        }

    def download(self, session: Session, token: str) -> tuple[Path, str]:
        ticket = self.repo.get(session, Ticket, hashlib.sha256(token.encode()).hexdigest())
        if ticket.payload["expires_at"] < now():
            raise BusinessError("下载票据已过期，请重新申请", 403, 90002, "ticket_expired")
        job = self.repo.get(session, Export, ticket.parent_id or "")
        path = self.settings.artifact_dir / job.payload["file_name"]
        if not path.is_file():
            raise BusinessError("导出文件缺失", 404, 10002, "artifact_missing")
        if hashlib.sha256(path.read_bytes()).hexdigest() != job.payload["sha256"]:
            raise BusinessError("导出文件校验失败", 409, 10003, "artifact_corrupt")
        return path, job.payload["file_name"]
