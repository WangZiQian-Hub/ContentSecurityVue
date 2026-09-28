from .calculation import compute_metric
from .core import BusinessError
from .schemas import SourceContext


class PlatformEvaluationAdapter:
    capability_code = "evaluation"
    subject = "platform"

    @staticmethod
    def version() -> str:
        return "evaluation-1.0.0"

    @staticmethod
    def invoke(source: SourceContext, definitions: list[dict], stage: str) -> list[dict]:
        return [
            {
                **compute_metric(definition, source, stage),
                "metric_code": definition["metric_code"],
                "name": definition["name"],
                "revision_id": definition["revision_id"],
                "formula": definition["formula"],
                "formula_code": definition["formula_code"],
            }
            for definition in definitions
        ]


ADAPTER_REGISTRY = {"evaluation": PlatformEvaluationAdapter()}


def route(capability_code: str) -> PlatformEvaluationAdapter:
    if capability_code not in ADAPTER_REGISTRY:
        raise BusinessError("当前服务尚未接入此能力", 502, 30001, "capability_unavailable")
    return ADAPTER_REGISTRY[capability_code]
