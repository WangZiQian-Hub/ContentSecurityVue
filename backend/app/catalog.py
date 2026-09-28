from .schemas import MetricCreate, RevisionDefinition

# Acceptance definitions are configuration drafts, never invented execution data.
# Ambiguous definitions intentionally cannot be published until the business definition exists.
CATALOG = [
    (
        "governance_documents",
        "治理体系文档核验",
        "data_value",
        "needs_definition",
        None,
        None,
        "all",
        "boolean",
        "1.1 / 1.2",
    ),
    ("governance_standard_count", "治理标准数量", "data_value", "count", None, 2, "gte", "count", "1.1 / 1.2"),
    ("corpus_sample_count", "样例语料规模", "data_value", "count", 30000, 50000, "gte", "count", "1.3"),
    ("corpus_volume", "语料库规模", "data_value", "count", 500000000, 1000000000, "gte", "count", "1.3"),
    ("high_value_recall", "高价值语料召回率", "data_value", "recall", 0.7, 0.8, "gte", "ratio", "1.4"),
    ("value_algorithm_count", "高价值发现算法数量", "data_value", "count", 1, 3, "gte", "count", "1.4"),
    (
        "data_weight_accuracy",
        "数据权重判别准确率",
        "data_governance",
        "accuracy",
        0.8,
        0.9,
        "gte",
        "ratio",
        "2.1 / 4.3",
    ),
    ("graph_type_count", "实体及关系种类", "data_governance", "needs_definition", 5, 10, "gte", "count", "2.1"),
    ("triple_count", "图谱三元组数量", "data_governance", "count", 50000, 100000, "gte", "count", "2.1"),
    (
        "poison_chain_restore_rate",
        "投毒链路还原率",
        "data_governance",
        "chain_restore",
        0.75,
        0.8,
        "gte",
        "ratio",
        "2.1",
    ),
    (
        "repair_language_type_matrix",
        "修复语种与异常类型覆盖",
        "data_governance",
        "matrix",
        1,
        1,
        "all",
        "boolean",
        "2.2",
    ),
    (
        "pollution_identification_rate",
        "污染样本识别率",
        "data_governance",
        "needs_definition",
        0.9,
        0.95,
        "gte",
        "ratio",
        "2.3 / 4.3",
    ),
    ("risk_technology_count", "语义风险识别技术数量", "risk_detect", "count", 3, 3, "gte", "count", "3.1"),
    (
        "knowledge_evolution",
        "风险知识库演进核验",
        "risk_detect",
        "needs_definition",
        None,
        None,
        "all",
        "boolean",
        "3.1",
    ),
    (
        "risk_reduction_rate",
        "高风险语义内容减少率",
        "model_capability",
        "risk_reduction",
        None,
        0.3,
        "gte",
        "ratio",
        "3.2",
    ),
    ("alert_coverage", "合规预警覆盖率", "risk_detect", "coverage", None, 0.95, "gte", "ratio", "3.3 / 4.3"),
    ("false_positive_rate", "误报率", "risk_detect", "fpr", None, 0.05, "lte", "ratio", "3.3 / 4.3"),
    ("three_stage_trace_complete", "三阶段记录完整性", "compliance", "trace_complete", 1, 1, "all", "boolean", "4.1"),
    ("audit_capability_count", "审计能力数量", "compliance", "count", 2, None, "gte", "count", "4.2"),
    ("audit_specification_count", "审计规范数量", "compliance", "count", None, 3, "gte", "count", "4.2"),
    ("audit_framework_count", "审计框架数量", "compliance", "count", None, 1, "gte", "count", "4.2"),
    (
        "integration_cases",
        "核心能力集成用例核验",
        "compliance",
        "needs_definition",
        None,
        None,
        "all",
        "boolean",
        "4.3",
    ),
    ("scenario_coverage", "应用场景覆盖数量", "compliance", "count", None, 3, "gte", "count", "4.3"),
    ("industry_model_count", "行业模型覆盖数量", "model_capability", "needs_definition", 3, 10, "gte", "count", "4.4"),
    ("own_model_count", "自主模型覆盖数量", "model_capability", "needs_definition", None, 2, "gte", "count", "4.4"),
    ("compliance_improvement", "整体合规水平提升", "compliance", "needs_definition", 0.1, 0.25, "gte", "ratio", "4.4"),
]

FORMULAS = {
    "recall": ("TP / (TP + FN)", "标准正类样本数"),
    "accuracy": ("(TP + TN) / (TP + TN + FP + FN)", "固定测试集样本总数"),
    "coverage": ("命中的应覆盖单元 / 应覆盖单元", "冻结的应覆盖样本集合"),
    "fpr": ("FP / (FP + TN)", "标准正常样本数"),
    "risk_reduction": ("(基线风险数 − 治理后风险数) / 基线风险数", "同一集合的基线风险数"),
    "chain_restore": ("正确还原标准节点数 / 标准节点数", "冻结标准节点，匹配和去重规则待填写"),
    "count": ("按冻结范围计数", "不适用"),
    "trace_complete": ("数据、训练、输出三个阶段均正确关联", "不适用"),
    "matrix": ("冻结执行矩阵全部覆盖", "不适用"),
    "needs_definition": ("待确认", "待确认"),
}


def initial_definitions() -> list[tuple[MetricCreate, RevisionDefinition]]:
    result = []
    for code, name, category, formula, mid, final, comparator, unit, ref in CATALOG:
        text, denominator = FORMULAS[formula]
        definition = RevisionDefinition.model_validate(
            {
                "formula_code": formula,
                "formula": text,
                "denominator_definition": denominator,
                "positive_class": "",
                "unit": unit,
                "applicable_objects": "固定来源结果及版本",
                "test_method": "paired"
                if formula == "risk_reduction"
                else "evidence"
                if unit != "ratio"
                else "automatic",
                "thresholds": [
                    {"stage": stage, "value": value, "unit": unit, "comparator": comparator}
                    for stage, value in [("midterm", mid), ("final", final)]
                    if value is not None
                ],
                "parameters": [{"name": "coverage_unit", "value": "sample"}] if formula == "coverage" else [],
                "input_requirements": ["dataset_version", "label_version", "source_results"],
                "required_evidence": ["input", "time", "interface", "version", "output"],
                "source_document_refs": [f"测试评估页面设计与接口报告 §5 / 指标 {ref}"],
            }
        )
        result.append((MetricCreate.model_validate({"code": code, "name": name, "category": category}), definition))
    return result
