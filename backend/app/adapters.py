from typing import Protocol

import httpx

from .config import Settings
from .core import BusinessError
from .schemas import SourceContext, SourceRef


class SourceAdapter(Protocol):
    def contexts(self, kind: str, keyword: str = "") -> list[SourceContext]: ...
    def resolve(self, ref: SourceRef) -> SourceContext: ...
    def rerun(self, source: SourceContext, child_task_id: str) -> SourceContext: ...


class HttpSourceAdapter:
    """Server-to-server integration. No fixture fallback, no browser-supplied measurements."""

    def __init__(self, settings: Settings):
        self.url = settings.upstream_url.rstrip("/")
        self.headers = {"Authorization": f"Bearer {settings.upstream_token}"}

    def _request(self, method: str, path: str, **kwargs: object) -> dict:
        if not self.url:
            raise BusinessError("来源服务尚未接入，暂时无法读取已登记的测试版本", 502, 30001, "upstream_unavailable")
        try:
            with httpx.Client(timeout=30, headers=self.headers) as client:
                response = client.request(method, self.url + path, **kwargs)  # type: ignore[arg-type]
                response.raise_for_status()
                envelope = response.json()
                if envelope.get("code") != 0:
                    raise ValueError("invalid source envelope")
                return envelope["data"]
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise BusinessError("来源服务读取失败，请稍后重试", 502, 30001, "upstream_unavailable") from exc

    def contexts(self, kind: str, keyword: str = "") -> list[SourceContext]:
        data = self._request("GET", "/evaluation-source/contexts", params={"kind": kind, "keyword": keyword})
        return [SourceContext.model_validate(item) for item in data["items"]]

    def resolve(self, ref: SourceRef) -> SourceContext:
        data = self._request("POST", "/evaluation-source/resolve", json=ref.model_dump())
        return SourceContext.model_validate(data)

    def rerun(self, source: SourceContext, child_task_id: str) -> SourceContext:
        data = self._request(
            "POST",
            "/evaluation-source/rerun",
            json={
                "source_ref": {
                    "entity_type": source.entity_type,
                    "entity_id": source.entity_id,
                    "version_id": source.version_id,
                },
                "capability_code": source.capability_code,
                "parent_task_id": child_task_id,
            },
            headers={**self.headers, "X-Request-Id": child_task_id},
        )
        return SourceContext.model_validate(data)
