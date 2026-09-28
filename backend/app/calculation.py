from fractions import Fraction
from typing import Any

from .schemas import SourceContext


def compute_metric(definition: dict, source: SourceContext, stage: str) -> dict[str, Any]:
    """Pure deterministic evaluation. Exact rational comparisons precede display rounding."""
    formula = definition["formula_code"]
    threshold = next((t for t in definition["thresholds"] if t["stage"] == stage), None)
    result: dict[str, Any] = {
        "value": None,
        "numerator": None,
        "denominator": None,
        "unit": definition["unit"],
        "counts": [],
        "threshold_snapshot": threshold,
        "judgment_status": "inconclusive",
        "reason_code": None,
        "gap": None,
    }
    if threshold is None:
        return {**result, "reason_code": "stage_target_missing"}
    samples = source.samples
    numerator: int | None = None
    denominator: int | None = None
    if formula in {"recall", "accuracy", "fpr", "coverage", "risk_reduction"}:
        if any(s.predicted is None or s.expected is None for s in samples):
            return {**result, "reason_code": "labels_missing"}
        tp = sum(s.expected is True and s.predicted is True for s in samples)
        fn = sum(s.expected is True and s.predicted is False for s in samples)
        fp = sum(s.expected is False and s.predicted is True for s in samples)
        tn = sum(s.expected is False and s.predicted is False for s in samples)
        result["counts"] = [
            {"name": key, "value": value} for key, value in [("TP", tp), ("FN", fn), ("FP", fp), ("TN", tn)]
        ]
        if formula == "recall":
            numerator, denominator = tp, tp + fn
        elif formula == "accuracy":
            numerator, denominator = tp + tn, len(samples)
        elif formula == "fpr":
            numerator, denominator = fp, fp + tn
        elif formula == "coverage":
            numerator = sum(s.required and s.predicted is True for s in samples)
            denominator = sum(s.required for s in samples)
        else:
            result["counts"] = []
            if any(s.baseline is None for s in samples):
                return {**result, "reason_code": "pairing_failed"}
            denominator = sum(s.baseline is True for s in samples)
            numerator = denominator - sum(s.predicted is True for s in samples)
    else:
        facts = {fact.key: fact.count for fact in source.facts if fact.evidence_ref}
        parameters = {p["name"]: p["value"] for p in definition["parameters"]}
        if formula == "count":
            numerator, denominator = facts.get(parameters.get("fact_key", "")), 1
        elif formula == "chain_restore":
            numerator, denominator = facts.get("matched_nodes"), facts.get("standard_nodes")
        elif formula in {"trace_complete", "matrix"}:
            keys = [key.strip() for key in parameters.get("required_keys", "").split(",") if key.strip()]
            if keys and all(key in facts for key in keys):
                numerator, denominator = int(all(facts[key] > 0 for key in keys)), 1
                result["counts"] = [{"name": key, "value": facts[key]} for key in keys]
        else:
            return {**result, "reason_code": "needs_definition"}
    if numerator is None or denominator is None:
        return {**result, "reason_code": "evidence_missing"}
    result.update(numerator=numerator, denominator=denominator)
    if denominator == 0:
        return {**result, "reason_code": "zero_denominator"}
    value = Fraction(numerator, denominator)
    target = Fraction(str(threshold["value"]))
    comparator = threshold["comparator"]
    passed = value >= target if comparator == "gte" else value <= target if comparator == "lte" else value == target
    return {
        **result,
        "value": float(value),
        "judgment_status": "passed" if passed else "failed",
        "gap": float(value - target),
    }


def judge(results: list[dict]) -> str:
    if any(r["judgment_status"] == "failed" for r in results):
        return "failed"
    if not results or any(r["judgment_status"] != "passed" for r in results):
        return "inconclusive"
    return "passed"
