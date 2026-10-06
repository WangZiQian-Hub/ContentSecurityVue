# 全链路追踪（任务五要素筛查）：后端需求

> **面向后端同学。** 前端已按本文约定写完并预留了调用点，后端照此补齐即可，前端不需要再改结构。

---

## 一、这次改了什么

| # | 变化 | 涉及位置 |
|---|---|---|
| 1 | **页面重新定位**：从"查一次调用的完整链路"改为 **"查一个任务的五要素留痕"** | `src/views/compliance/FullChainPage.vue` |
| 2 | **查询入口改了**：从「模型调用 ID / Trace ID」改为 **「任务类别 + 任务记录」** | 同上（选择器写在本页内） |
| 3 | **删掉了 3 个区块**：链路阶段图、跨阶段证据关联、整链核验结论 | 同上 |
| 4 | **保留并加强**：五要素留痕校验（横向 5 个格子） | 同上 |

### 为什么改

原来的 `trace_detail` 只以「模型调用」为起点，而 34 个任务里只有 2 个调用了模型，
其余 32 个任务查不到任何东西。改从**任务角度**出发后，任何任务都可以筛查五要素。

---

## 二、页面现在怎么取数（**已经实现，不需要后端改**）

### 2.1 任务列表（两个下拉的数据源）

```
GET /api/v1/tasks?page=1&page_size=200
     用到字段：task_id / name / capability_code / status /
               created_at / finished_at / dataset_name / dataset_version
```

**这个接口已经存在，前端直接在用。**

### 2.2 五要素（核心）

```
GET /api/v1/compliance/evidence/{evidence_id}
     用到字段：payload.redacted_fields[]，每项为 { key, label, value, state }
```

**这个接口也已经存在**，前端按下面的编号约定拼 `evidence_id`：

| 任务类型 | 前端拼出的证据编号 | 现状 |
|---|---|---|
| `data_process` | `evidence-process-{task_id}` | ✅ 后端已生成（7 条） |
| 其余 7 种 | `evidence-task-{task_id}` | ❌ **待后端补齐** |

---

## 三、⭐ 后端需要补什么

### 3.1 为其余 7 种任务类型生成五要素证据（**主要需求**）

**现状**：只有 `data_process` 有证据。

**出处**：`back/app/services/compliance_service.py` 的 `process_evidence()` / `training_evidence()`

**需要的**：对**每一个任务**都生成一条五要素证据，编号统一为：

```
evidence-task-{task_id}
```

**涉及的任务类型（按当前数据，共 8 种 34 个任务）**：

| capability_code | 中文类别 | 任务数 |
|---|---|---|
| `data_process` | 数据治理 | 7（已有 `evidence-process-*`，可保留） |
| `value_score` | 数据治理 | 15 |
| `data_ingest` | 数据资源 | 6 |
| `model_risk_governance` | 模型治理 | 2 |
| `anomaly_detect` | 风险治理 | 1 |
| `evaluation` | 测试评估 | 1 |
| `reasoning_audit` | 合规审计 | 1 |
| `scenario_governance` | 场景应用 | 1 |

### 3.2 五要素的 key 与状态取值

**key 必须固定为这 5 个**（前端按此顺序渲染，出处：`back/app/routers/compliance.py:315`）：

| key | 中文名 |
|---|---|
| `input` | 输入 |
| `time` | 时间 |
| `interface` | 接口 |
| `version` | 版本 |
| `output` | 输出 |

**每项的 `state` 取值**（沿用现有证据表的取值）：

| state | 含义 | 前端显示 |
|---|---|---|
| `verified` | 已留痕 | ✅ 已核验 |
| `missing` | 应留痕但缺失 | ⚠️ 待补证 |
| `not_applicable` | 该类任务天然没有这一要素 | 不适用（**不计入待补证**） |
| `unknown` | 无法判断 | 未知 |

> ⚠️ **`not_applicable` 很重要** —— 见 3.4。

### 3.3 每种任务类型的取值建议

以下是按现有 `tasks` 表字段整理的映射建议，供后端参考：

| capability_code | input | time | interface | version | output |
|---|---|---|---|---|---|
| `data_process` | `input_data.dataset_version_id` | `finished_at` | `input_data.template_id` + `rules` | `result.output_version` | `result.total_count` |
| `data_ingest` | `input_data.source_name` | `finished_at` | `input_data.connector_type` | **不适用** | `result.record_count` |
| `value_score` | `input_data.dataset_id` + `version_id` | `finished_at` | `input_data.scheme_id` | **不适用** | `result.overall_score` |
| `anomaly_detect` | `input_data.dataset_id` + `version_id` | `finished_at` | `input_data.scheme_id` | **不适用** | `result.anomaly_count` |
| `evaluation` | `input_data.model_id` + `dataset_id` | `finished_at` | `input_data.metric_codes` | **不适用** | `result.value` |
| `model_risk_governance` | `input_data.model_id` + `prompt` | `finished_at` | `input_data.params` | `model_id` 里的版本 | `result.governed_output` |
| `reasoning_audit` | `input_data.inference_id` | `finished_at` | **不适用** | **不适用** | `result.audit_id` |
| `scenario_governance` | `input_data.content` + `scenario_code` | `finished_at` | **不适用** | **不适用** | `result.governance_status` |

**时间统一取** `finished_at`；为空时（任务未完成）回退 `created_at`。

### 3.4 ⚠️ 必须支持 `not_applicable`

`data_ingest`、`value_score`、`anomaly_detect`、`evaluation`、`reasoning_audit`、`scenario_governance`
这 6 种任务**天然没有"产出版本"这一环节**。

**如果把它们记成 `missing`，会全部被误报成合规缺项。**
应记为 `not_applicable`，前端不把它计入"待补证"。

### 3.5 失败任务怎么算

| 要素 | 建议 | 理由 |
|---|---|---|
| `output` / `version` | `missing` | 任务本该产出，但失败了没产出 —— 确实该报缺项 |
| 其余 | 按 3.3 正常取值 | |

---

## 四、可选：任务五要素的聚合接口（性能优化）

**现状**：前端要发 2 次请求（任务列表 + 单条证据）。**这个量可以接受，不急。**

如果以后要做"**批量筛查所有任务的五要素**"（例如在总览页直接列出所有缺项任务），建议新增：

```
GET /api/v1/compliance/tasks/five-elements?from=&to=&capability_code=
     出参：data = [ { task_id, name, capability_code, status,
                     five_elements: [{ key, label, value, state }],
                     pending_count } ]
```

---

## 五、验收标准

后端按 3.1 补齐证据后：

1. 打开「全链路追踪」页
2. 「任务类别」下拉应有 **7 个类别**：数据治理 / 数据资源 / 风险治理 / 模型治理 / 测试评估 / 合规审计 / 场景应用
3. 选「数据治理」→「任务记录」应有 **22 条**（7 个 data_process + 15 个 value_score）
4. 任选一条 → 五要素 5 个格子应显示该任务的真实值
5. 选一个 `data_ingest` 任务 → 「版本」应显示**不适用**，而不是「待补证」
6. 后端直接查 `compliance_evidences` 表 → 应有 34 条以上证据（现有 11 条 + 新增）

---

## 六、附：本次**不需要**后端做的事

| 事项 | 说明 |
|---|---|
| 改 `/compliance/traces/{id}` | 本页**已不再调用**该接口 |
| 加 `model_calls.task_id` 字段 | 本页不再依赖"调用 ↔ 任务"的关联 |
| 修 `trace_detail` 的"取最新治理任务" | 该逻辑本页不再使用（但别处若仍用，仍是缺陷，见下） |
| 评论接口 | 属于另一份文档 [compliance-error-audit.md](./compliance-error-audit.md) |

---

## 七、附：仍然存在、但本次不处理的缺陷（供参考）

| # | 缺陷 | 位置 |
|---|---|---|
| 1 | `trace_detail` 的「原始数据」「清洗治理」两阶段取的是"最新创建的治理任务"，与所查调用无关 | `compliance.py:300` |
| 2 | `datasets` 表没有"我是哪个任务产出的"字段，导致"数据集 ← 治理任务"这一环连不上 | `models/tables.py` |
| 3 | `model_calls` 没有记录"用的数据是哪份" | 同上 |
| 4 | 前端 `utils/enums.ts` 的 `TASK_CATEGORY` 没有收录 `data_process`，会显示成"其他" | `src/utils/enums.ts` |
| 5 | `GET /compliance/evidence/{id}` 对未登记的证据返回 404（前端已按"数据状态"友好处理） | `compliance.py:289` |
| **6** | **`training_tasks` 的 `loss` / `validation_loss` 数组长度与 `epochs` 不一致**：例如 `TR-COMPLIANCE-001` 声明 `epochs=10, epoch=10`，但两个数组都只有 **5** 个值。前端已改为按 `epochs` 铺开横轴并如实留白（不会再把检查点标记挤到一起），但**数据本身不自洽**，建议后端补齐或明确"损失值仅为抽样记录" | `models/tables.py`、`core/seed.py` |
| **7** | **神经元审计的 `heatmap` 与 `abnormal_neurons` 不一致**：`AUDIT-NEURON-001` 阈值 `0.8`，`heatmap` 中第 24 层某单元为 **0.87**（超阈值），但 `abnormal_neurons` 只列出 `L8/309 (0.83)` 与 `L16/205 (0.91)`。建议二者用同一套判定逻辑生成 | `services/compliance_service.py` |
