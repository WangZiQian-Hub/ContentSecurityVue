# 数据权重判别准确率：后端接口对接说明

页面：`/data-governance/risk-classification`。本次只修改前端 `src`，并新增本说明；没有修改 `back`。

## 1. 新增接口与前端位置

| 用途                   | 方法 | 路径（不含基础前缀）                                        | 参数                                    | 前端函数                                |
| ---------------------- | ---- | ----------------------------------------------------------- | --------------------------------------- | --------------------------------------- |
| 上方总体准确率         | GET  | `/data-governance/risk-weight-accuracy/overview`            | 查询参数 `kind=governance-risk`         | `getRiskWeightAccuracyOverview()`       |
| 下方当前检测批次准确率 | GET  | `/data-governance/risk-results/{result_id}/weight-accuracy` | 路径参数 `result_id`，字符串；不传 kind | `getRiskResultWeightAccuracy(resultId)` |

- 请求函数：`src/api/data-risk.ts`。
- 数据类型：`src/types/data-risk.ts` 中的 `RiskWeightAccuracy`。
- 卡片与独立加载逻辑：`src/views/data-governance/components/RiskWeightAccuracyCard.vue`。
- 上方接入：`src/views/data-governance/components/RiskOverview.vue`。
- 下方接入：`src/views/data-governance/DataRiskPage.vue`。
- Mock：`src/mock/data-risk.ts` 中的 `weightAccuracyOverview()`、`resultWeightAccuracy(resultId)`。

已只读检查现有 `back`，未发现上述路径冲突。现有风险路由集中在 `back/app/routers/data_governance.py`，后端同学可在该模块新增路由。已有 `/risk-results/{result_id}` 与新增子路径的段数不同，不会相互覆盖。后端函数建议命名为 `risk_weight_accuracy_overview` 和 `risk_result_weight_accuracy`。

普通后端默认 baseURL 是 `/api/v1`，可由 `VITE_API_BASE_URL` 配置：

```http
GET /api/v1/data-governance/risk-weight-accuracy/overview?kind=governance-risk
GET /api/v1/data-governance/risk-results/risk-result-example/weight-accuracy
```

启用 `VITE_GOVERNANCE_BACKEND=llm` 时，走现有 `llmRequest`，baseURL 默认为 `/llm-api/v1`，可由 `VITE_LLM_API_BASE_URL` 配置。当前 Vite 代理将 `/llm-api` 重写为 `/api` 并转发到模型服务。请在实际选中的服务上实现这两个接口。认证继续沿用现有 Bearer token 和请求追踪机制。

## 2. 响应契约

两个接口使用相同 data 结构，沿用 `back/app/core/response.py` 的 `success()` 响应封装：

```json
{
  "code": 0,
  "message": "数据权重判别准确率查询成功",
  "data": {
    "accuracy_percent": 92.3,
    "correct_count": 923,
    "total_count": 1000
  },
  "trace_id": "example-trace-id",
  "timestamp": "2026-10-13T12:00:00+08:00"
}
```

示例数值只用于说明契约，不应硬编码为生产统计。

| 后端字段         | JSON 类型      | 前端字段与类型                  | 约束                                                    |
| ---------------- | -------------- | ------------------------------- | ------------------------------------------------------- |
| accuracy_percent | number 或 null | accuracyPercent: number \| null | 0～100，建议四舍五入保留一位小数；无可评估样本时为 null |
| correct_count    | number（整数） | correctCount: number            | 大于等于 0，且不超过 total_count                        |
| total_count      | number（整数） | totalCount: number              | 大于等于 0，表示纳入准确率评估的样本数                  |

前端现有请求封装将 snake_case 自动转成 camelCase，并提取 data，无需后端同时返回两套字段。两个函数返回 `Promise<RiskWeightAccuracy>`。

没有可评估样本，或尚无可用标准答案时，返回成功响应，data 为：

```json
{
  "accuracy_percent": null,
  "correct_count": 0,
  "total_count": 0
}
```

前端显示“暂无统计”；这与真实的 `0%`（有评估样本但正确数为 0）不同。接口未配置或服务错误时，前端显示“统计暂不可用”，提供重试，其他检测内容仍可使用。不存在的 result_id 返回 HTTP 404；无权访问按现有认证授权约定处理。不要把服务故障包装成 0% 或示例数据。

## 3. 统计口径

1. 准确率 = `correct_count / total_count × 100`。前端百分比和进度条共同使用 accuracy_percent，不额外计算另一套百分比。
2. 正确判别须与标准标签或经确认的参考结果比较，不能直接使用模型置信度、风险占比或待复核数量。需要业务与后端确定“数据权重判别正确”的匹配规则。
3. 建议分母仅纳入具有有效参考答案、且完成判别的样本；没有标注、检测失败和无法判别的样本不纳入本指标。后端应确认并统一采用该口径，分母因此不一定等于页面的有效检测样本数。
4. 下方对应 result_id 标识的完整检测批次，与该结果的固定版本、语种、分级方案一致；列表分页、搜索和风险等级筛选不改变该指标。
5. 总体按 `(dataset_id, version_id, scheme_id)` 分组，每组只取最新已完成的全语种（language=all）检测结果，再汇总正确数和评估总数；以 finished_at 排序，并约定时间相同时的稳定排序。重复检测替换该组的统计，不重复累计；单语种结果不与全语种结果重复纳入。
6. 总体百分比由汇总后的正确数除以汇总后的总数得到，不能直接平均各批次百分比。不同固定版本或方案是独立评估范围，同一内容跨版本或方案可能分别参与评估。
7. 当前真实 risk-overview 与原有 Mock 的其他卡片口径并不完全一致，本次不修改它们。新增准确率按上述专用契约独立统计，不直接沿用既有总量字段。

## 4. 调用时机与保存要求

- 进入页面：上方独立获取总体准确率；下方先通过现有 latest 接口加载已保存检测结果，有 result_id 后获取该批次准确率。
- 点击“重新检测”：沿用现有 POST risk-tasks → 查询任务状态 → GET risk-results/{result_id} 流程；任务成功且结果可读取后，下方查询新批次准确率，上方通过现有 risk-updated 事件重新加载总体统计。
- 切换数据集、固定版本、语种或方案：清除旧结果，按新条件加载已有结果及其准确率；总体统计保持全局口径。
- 切换历史结果：根据历史 result_id 加载对应准确率；不改变总体统计范围。
- 同一批次的样本搜索、筛选和翻页不重复获取准确率。卡片处理切换和卸载时的迟到响应，避免旧数据覆盖新结果。
- 本指标按检测结果保存为快照；当前人工复核功能不直接改写该快照。若未来要让人工复核实时修订准确率，需要另行约定快照版本和刷新策略。

建议后端在检测任务成功前保存相应的准确率统计或可重建统计的评估记录，并支持服务重启后查询、历史查询；GET 只读取统计，不启动新的模型检测。

## 5. Mock 演示与联调

Mock 启用条件沿用现有代码：`VITE_USE_MOCK !== 'false'` 且 `VITE_GOVERNANCE_BACKEND !== 'llm'`。修改环境变量后需要重启前端开发服务。

Mock 根据完整批次的实际资源样本数，以样本 ID 的固定散列模拟对错并保存统计快照；这是模拟评估结果，没有新增真实标准标签。重复检测相同输入得到相同统计；历史批次可独立查询。总体按第 3 节的分组规则汇总，单语种检测不重复累计。卡片说明会注明当前为模拟演示数据。小批次的准确率可能为 0% 或 100%，不固定展示截图的 92.3%。

真实联调设置 `VITE_USE_MOCK=false`（或选择 llm 模式），确认两个 GET 请求返回上述契约。前端没有实现后端路由，也没有在真实请求失败时自动回退到 Mock。

建议联调覆盖：首次加载、重新检测后刷新、历史结果、无可评估样本、真实零准确率、接口错误后重试、不同批次快速切换，以及重复检测不增加总体分母。
