# 全链路合规治理 · 后端对接需求

> **用途**：交给后端。逐页说明「前端已经做成什么样、后端还缺什么、需要怎么接」。
> **前情**：本文档汇总并更新了两份既有文档，细节仍以那两份为准：
> - [compliance-error-audit.md](./compliance-error-audit.md) —— 错误清单与评论接口
> - [compliance-task-five-elements.md](./compliance-task-five-elements.md) —— 任务五要素证据
> **页面说明**（给汇报用的）见 [compliance-module-overview.md](./compliance-module-overview.md)。

---

## 一、现状总览

**前端 5 个页面已全部完成**（含「示例演示」模式）。后端接口的完成度如下：

| # | 后端要做的 | 阻塞程度 | 影响页面 |
|---|---|---|---|
| **1** | **错误评论接口** `GET/POST /compliance/errors/{id}/comments` | 🔴 **完全没做** | ⑤ 合规风险审计 |
| **2** | **为 7 种任务类型补五要素证据** | 🔴 **只做了 1/8** | ③ 全链路追踪 |
| **3** | **神经元激活采集** | 🔴 **本地做不了** | ④ 模型内部审计 |
| **4** | `training_tasks.loss` 长度与 `epochs` 不一致 | 🟠 **数据不自洽** | ④ 模型内部审计 |
| **5** | `heatmap` 与 `abnormal_neurons` 判定不一致 | 🟠 **同一份数据自相矛盾** | ④ 模型内部审计 |
| **6** | `trace_detail` 的 2 个阶段是占位数据 | 🟡 前端已不展示 | — |
| **7** | `datasets` / `model_calls` 缺关联字段 | 🟡 前端已绕过 | — |
| **8** | `/alerts` 无模块前缀 + 重复定义 | 🟡 前端已改用原路径 | — |
| **9** | 谱系边指向不存在的证据 | 🟢 前端已友好处理 | ② 数据谱系追踪 |

---

## 二、🔴 必须实现：错误评论接口

**这是目前唯一一个"前端已写好、只等后端"的功能。**

### 2.1 为什么需要

「合规风险审计」页要能在**每条具体问题**下面评论（讨论"这条怎么处理"）。

**前端已经全部做完**，只差后端接口。现在评论暂存在浏览器 `localStorage` 里，页面上标注着「评论暂存本机，后端接口就绪后自动切换」。

### 2.2 接口契约

```http
# 查评论
GET /api/v1/compliance/errors/{error_id}/comments
    出参：data = [ ErrorComment, ... ]      # 按创建时间正序

# 发评论
POST /api/v1/compliance/errors/{error_id}/comments
    请求头：X-Request-Id: <uuid>
    入参：{ "content": "这条我已经联系数据组补登记了" }
    出参：data = ErrorComment                # 返回新建的这条
```

```ts
interface ErrorComment {
  id: string
  errorId: string
  content: string
  authorId: string | null
  authorName: string
  createdAt: string          // ISO 8601
}
```

### 2.3 ⚠️ 关键设计：`error_id` 是前端拼的字符串

**后端不需要理解它的含义，当成普通字符串存取即可。** 但要注意：

| # | 注意事项 |
|---|---|
| 1 | **编号里含中文和冒号**，如 `link:输入数据引用:edge-process-input-tsk_process_demo_06`。前端会做 `encodeURIComponent`，**后端按已解码的字符串处理** |
| 2 | **编号由业务对象拼成，是稳定的**（同一个问题每次算出的编号相同）。这是评论能挂住的前提 |
| 3 | **后端不需要预先建表**，第一次收到某编号的评论时按需创建即可 |

**编号格式：**

| 类型 | 格式 | 例子 |
|---|---|---|
| 链路断链 | `link:{关系名}:{边id}` | `link:输入数据引用:edge-process-input-tsk_process_demo_06` |
| 调用引用缺失 | `link:模型版本引用:{调用记录id}` | `link:模型版本引用:CALL-COMPLIANCE-001` |
| 任务执行失败 | `task:{taskId}:failed` | `task:tsk_process_demo_06:failed` |
| 检查点缺失 | `model:{训练任务id}:checkpoint:{轮次}` | `model:TR-COMPLIANCE-001:checkpoint:3` |

### 2.4 前端切换方式

前端有个开关，**后端接口上线后把这一行改成 `true` 即可**：

```ts
// src/views/compliance/RiskAlertPage.vue
const COMMENT_BACKEND = false      // ← 改成 true
```

### 2.5 验收标准

1. 打开「合规风险审计」，任选一条问题，发一条评论 → 刷新页面评论还在
2. 换一台机器打开同一页 → 评论还在（说明存到了服务端，不是本机）
3. 给同一条问题发第二条评论 → 两条都在，按时间正序
4. **含中文的 `error_id`**（如 `link:输入数据引用:xxx`）→ 能正常存取，不报 400/404

---

## 三、🔴 必须实现：为 7 种任务类型补五要素证据

### 3.1 现状

**「全链路追踪」页按任务类型筛查五要素证据。后端目前只为 `data_process`（数据处理）一种类型生成了证据。**

| 任务类型 (`capability_code`) | 中文名 | 任务数 | 证据状态 |
|---|---|---|---|
| `data_process` | 数据处理 | 7 | ✅ 有（`evidence-process-tsk_process_demo_01..07`） |
| `value_score` | 价值分析 | 15 | ❌ 无 |
| `data_ingest` | 数据接入 | 6 | ❌ 无 |
| `model_risk_governance` | 模型治理 | 2 | ❌ 无 |
| `anomaly_detect` | 风险治理 | 1 | ❌ 无 |
| `evaluation` | 模型评估 | 1 | ❌ 无 |
| `reasoning_audit` | 合规审计 | 1 | ❌ 无 |
| `scenario_governance` | 场景应用 | 1 | ❌ 无 |

> **前端表现**：点其他类型的任务，显示「这个任务（XX）在后端还没有登记五要素证据，暂时无法筛查。」
> **这是如实说明，不是前端 bug。**

### 3.2 证据编号规则（**前端已经按这个规则去取**）

```
data_process（数据处理）  →  evidence-process-{task_id}
其他所有类型             →  evidence-task-{task_id}
```

> **为什么要分两种**：`data_process` 的历史数据已经用了 `evidence-process-` 前缀，
> 为了不破坏已有数据，保留这个特例；新类型统一用 `evidence-task-`。

### 3.3 证据内容要求

每条证据的 `payload.redacted_fields` 必须是 **5 个字段，顺序固定**：

```json
{
  "redacted_fields": [
    { "key": "input",     "label": "输入", "value": "…", "state": "verified" },
    { "key": "time",      "label": "时间", "value": "…", "state": "verified" },
    { "key": "interface", "label": "接口", "value": "…", "state": "verified" },
    { "key": "version",   "label": "版本", "value": "…", "state": "verified" },
    { "key": "output",    "label": "输出", "value": "…", "state": "verified" }
  ]
}
```

> **顺序出处**：`back/app/routers/compliance.py:315` —— `keys = ["input", "time", "interface", "version", "output"]`

**`state` 三个取值，各有明确语义：**

| `state` | 前端显示 | 什么时候用 |
|---|---|---|
| `verified` | **已核验** | 该字段有值、可信 |
| `missing` | **待补证** | 该字段**本该有但没有** —— 这就是"缺项" |
| `not_applicable` | **不适用** | 该字段**对这个任务类型本来就不适用**，不算缺项 |

> ⚠️ **`not_applicable` 很重要**：不能因为"某类任务没有某个字段"就全标 `missing`，
> 否则会把"不适用"误报成"缺项"。**要求：每类任务的 5 个字段都要显式给出 `state`，不允许省略。**

### 3.4 各类型的字段映射建议

| 任务类型 | input | time | interface | version | output |
|---|---|---|---|---|---|
| `data_ingest` 数据接入 | 数据源 ID | 接入时间 | 接入接口 | 目标数据版本 | 接入条数 |
| `value_score` 价值分析 | 数据集版本 | 分析时间 | 价值评估方法 | 算法版本 | 评分结果 |
| `model_risk_governance` 模型治理 | 模型调用 ID | 治理时间 | 治理策略 | 模型版本 | 治理后输出 |
| `anomaly_detect` 风险治理 | 待检测对象 | 检测时间 | 检测规则 | 规则版本 | 风险等级 |
| `evaluation` 模型评估 | 模型版本 | 评估时间 | 评估方法 | 评估集版本 | 各指标得分 |
| `reasoning_audit` 合规审计 | 审计对象 | 审计时间 | 审计规则 | 规则版本 | 审计结论 |
| `scenario_governance` 场景应用 | 场景 ID | 应用时间 | 治理流程 | 场景版本 | 处理结果 |

### 3.5 验收标准

1. 「全链路追踪」页，任务类别下拉 **8 类全部可选**
2. 任意选一类下的任意任务 → **五个字段都有值或明确的 `not_applicable`**，不再是空白
3. 故意漏掉某个字段 → 页面显示 **「待补证」**
4. **字段顺序**是 `输入 → 时间 → 接口 → 版本 → 输出`

---

## 四、🔴 必须实现：神经元激活采集

### 4.1 现状

「模型内部审计」的**第二块（神经元激活审计）前端已做完**，包括：

- 采样单元激活矩阵（热力图）
- 超阈值单元表
- 证据适用范围（捕获对象 / 捕获记录 / 模型版本 / 归一化基线 / 算法版本 / 复核状态）

**但本地没有部署模型，采集不到真实的神经元激活数据。**
现在：**示例演示模式能看完整效果，真实接口模式显示说明文字。**

### 4.2 后端需要提供什么

**这需要推理服务侧配合**，不是加个查询接口就能解决的：

| # | 要做的 |
|---|---|
| 1 | 模型推理时，**在推理服务里挂一个 hook，采集指定层的神经元激活值** |
| 2 | 归一化后写入捕获记录（`capture_id`） |
| 3 | 提供查询：按 `model_id + version + capture_id` 返回激活矩阵 |

### 4.3 契约（前端已按此实现）

```ts
interface NeuronResult {
  kind: 'neuron_audit'
  availability: 'available' | 'unavailable'
  unavailableReason: string | null      // 不可用时给出中文原因
  modelVersion: string
  inferenceId: string | null            // 捕获对象：哪次推理
  captureId: string | null              // 捕获记录 ID
  layerIndices: number[]                // 采了哪几层，如 [8, 16, 24]
  neuronIndices: number[]               // 每层采了哪些单元，如 [205, 309, 411, 512]
  unit: string                          // 单位，如 "normalized activation"
  normalizationBaseline: string         // 归一化基线说明
  threshold: number                     // 判定阈值，如 0.8
  heatmap: (number | null)[][]          // 激活矩阵，null = 未采集
  abnormalNeurons: {                    // 超阈值的单元
    layer: number
    index: number
    value: number
    concept: string                     // 关联概念，如 "隐私实体"
    evidenceRefs: string[]
  }[]
  observedCount: number                 // 采样单元总数
  ratio: number | null                  // 超阈值占比
}
```

### 4.4 ⚠️ 硬性要求

| # | 要求 | 原因 |
|---|---|---|
| 1 | **`heatmap` 与 `abnormalNeurons` 必须用同一套判定逻辑生成** | 现在两者不一致（见第五节第 2 条） |
| 2 | **未采集的单元必须填 `null`，不能填 0** | 前端把 `null` 显示为「—（未采集）」，0 会被当成"激活值为零" |
| 3 | **不可用时给中文 `unavailableReason`** | 前端直接展示这句话 |

---

## 五、🟠 数据一致性问题（应修）

### 5.1 `training_tasks.loss` 数组长度与 `epochs` 不一致

**实测数据：**

```
TR-COMPLIANCE-001:
  epochs          = 10        ← 声明计划训 10 轮
  epoch           = 10        ← 声明已训到第 10 轮
  loss            = [2.4, 1.5, 0.8, 0.42, 0.23]      ← 只有 5 个值 ❌
  validation_loss = [2.6, 1.7, 0.95, 0.51, 0.29]     ← 只有 5 个值 ❌
```

**三个字段互相矛盾。**

**影响**：前端画训练损失曲线时，横轴铺到 10 轮，但**第 6~10 轮没有数据点**（曲线画一半）。

**前端已做的兜底**：横轴按 `epochs` 铺开，**留白如实表示"这段没有训练日志"**，不会再把检查点标记挤到一起。

**要求**：二选一

- **甲**：`loss` / `validation_loss` 长度补齐到 `epochs`
- **乙**：如果"损失值只抽样记录"是有意设计，**请在接口文档里明确说明抽样规则**

---

### 5.2 `heatmap` 与 `abnormal_neurons` 判定不一致

**实测数据（`AUDIT-NEURON-001`）：**

```
threshold = 0.8

heatmap:
  第 8 层 ：  0.21,  0.38,  0.83,  0.44
  第 16 层：  0.18,  0.91,  0.35,  0.56
  第 24 层：  0.41,  0.32,  0.87,  0.62
                              ↑ 0.87 > 0.8  应该算超阈值

abnormal_neurons 只列了 2 个：
  L8  / 309   z=0.83
  L16 / 205   z=0.91
  ← 漏了第 24 层的 0.87 ❌
```

**要求**：两者必须由**同一套判定逻辑**生成，不能各算各的。

---

## 六、🟡 前端已绕过、但建议后端清理的问题

### 6.1 `trace_detail` 的 2 个阶段是占位数据

```python
# back/app/routers/compliance.py:300
process = db.scalar(
    select(Task).where(Task.capability_code == "data_process")
              .order_by(Task.created_at.desc())        # ← 取「最新创建的数据处理任务」
)
```

**问题**：`trace_detail` 返回的「原始数据」「清洗治理」两个阶段，取的是**全库最新的一条数据处理任务**，
**和所查的 trace 没有任何关系**。

**前端处理**：**这两个阶段前端已经不展示了**（「全链路追踪」页已改成按任务查五要素，不再用 trace 分阶段）。

**要求**：如果 `trace_detail` 还要继续对外提供，这两个阶段应该
① 建立"调用 ↔ 数据来源"的真实关联后再生效，或 ② 直接移除。

---

### 6.2 `datasets` 与 `model_calls` 缺关联字段

| 缺什么 | 导致 | 前端绕过方式 |
|---|---|---|
| `datasets` 没有"我是哪个治理任务产出的"字段 | "数据集 ← 治理任务"这一环连不上 | 用谱系图里已有的边代替 |
| `model_calls` 没有 `task_id` | 34 个任务里只有 2 个能追溯到调用记录 | 模型层检查点改用 `/model-workbenches/current` |
| `model_calls` 没有 `dataset_id` | "这次推理用了哪份数据"查不到 | 不展示 |

**要求**（优先级低）：若要支持"从一次模型调用倒推用了哪份训练数据"，这两个字段必须补。

---

### 6.3 `/alerts` 路径问题

```
现状：
  /api/v1/alerts                    ← ❌ 没有模块前缀
  /api/v1/alerts/{id}
  /api/v1/alerts/{id}/{action}
  /api/v1/alerts/{id}/claim 等

  而且 /alerts 在后端被定义了两次：
  back/app/routers/compliance.py 和 back/app/routers/resources.py 各有一份
```

**建议**：统一到 `/api/v1/compliance/alerts`，删掉重复定义。

> **前端现状**：**已经不依赖 `/alerts` 了**（错误清单不再并入告警工单），所以这条**不阻塞**。

---

### 6.4 谱系边指向不存在的证据

```python
# back/app/routers/compliance.py:119-120
add_edge(f"edge-training-output-{version.id}", source_id, model_node_id, "训练产物登记",
         f"evidence-training-{version.task_id}", ...)      # ← 该训练任务未登记证据时会 404
```

**问题**：谱系图里指向 `evidence-training-{task_id}` 的边，如果该训练任务**没有登记过证据**，
点「查看源证据」时后端返回 404。

**前端处理**：证据接口加了 `silent` 标记，404 **不弹红色错误**，抽屉里显示中文说明
「该证据尚未登记；后续补证应追加记录」。

**要求**（可选）：未登记的证据最好返回 **200 + 空 payload**，而不是 404 —— 这样更符合"数据现状"而非"接口错误"的语义。

---

### 6.5 任务类型枚举一致性

前端 `src/utils/enums.ts` 的 `TASK_CATEGORY` 已按后端的 `capability_code` 补齐为 8 类：

| `capability_code` | 前端显示 | 后端是否在用 |
|---|---|---|
| `data_process` | 数据处理 | ✅ |
| `data_ingest` | 数据接入 | ✅ |
| `value_score` | 价值分析 | ✅ |
| `model_risk_governance` | 模型治理 | ✅ |
| `anomaly_detect` | 风险治理 | ✅ |
| `reasoning_audit` | 合规审计 | ✅ |
| `evaluation` | 模型评估 | ✅ |
| `scenario_governance` | 场景应用 | ✅ |

**要求**：**后端若新增任务类型，请同步通知前端**，否则前端会显示成"其他"。

---

## 七、接口清单速查

### 7.1 前端已在用、后端已实现的

| 接口 | 用于 |
|---|---|
| `GET /api/v1/compliance/overview` | ① 审计总览 |
| `GET /api/v1/compliance/contexts` | ②③④⑤ |
| `GET /api/v1/compliance/lineage` | ①②⑤ |
| `GET /api/v1/compliance/audits` | ④ |
| `GET /api/v1/compliance/audits/{id}` | ④ |
| `GET /api/v1/compliance/audits/{id}/reviews` | ④（人工复核） |
| `GET /api/v1/compliance/evidence/{id}` | ②③ |
| `GET /api/v1/compliance/traces/{id}` | 兼容保留 |
| `GET /api/v1/tasks` | ①③⑤ |
| `GET /api/v1/model-workbenches/current` | ①④⑤ |

### 7.2 🔴 需要新建的

```http
GET  /api/v1/compliance/errors/{error_id}/comments
POST /api/v1/compliance/errors/{error_id}/comments
```

### 7.3 🟡 可选（长期）

```http
GET /api/v1/compliance/errors          # 后端直接返回聚合好的错误清单
```

> **现状**：错误清单由**前端**从谱系 / 任务 / 模型工作台现算（3 个接口 + N 次谱系查询）。
> **好处**：后端零改动即可用，口径和总览页天然一致。
> **代价**：前端要发多个请求。
> **如果后端愿意聚合**，前端可以改成一次请求，但**要保证条数与口径和总览页一致**。

---

## 八、验收步骤（后端做完后照这个测）

| # | 步骤 | 期望 |
|---|---|---|
| 1 | 「合规风险审计」发一条评论 → 刷新 → 换机器打开 | 评论都在（说明存到了服务端） |
| 2 | 发一条 `error_id` 含中文的评论 | 不报 400/404 |
| 3 | 「全链路追踪」依次选 8 类任务 | 都能选出任务，五个字段都有值或 `not_applicable` |
| 4 | 故意让某任务的 `version` 字段缺失 | 页面显示「待补证」 |
| 5 | 「模型内部审计」选训练任务 | 缺检查点的轮次如实显示，条数与总览页模型层卡片一致 |
| 6 | 切到「真实接口」看神经元激活 | 显示后端给的中文 `unavailableReason`（若仍不可用） |
| 7 | 核对「审计总览」的「待处理问题」与「合规风险审计」清单条数 | **两边数字一致** |

---

## 九、一句话总结给后端

> **前端全部做完了。现在只差两件必须做的事：**
> ## **1️⃣ 错误评论接口（`/compliance/errors/{id}/comments`）—— 半小时的事，收益最大**
> ## **2️⃣ 为剩下 7 种任务类型补五要素证据 —— 工作量最大，也最有价值**
>
> **神经元激活需要推理服务侧配合，短期做不了可以继续用演示模式。**
> **其余是数据一致性和清理问题，不阻塞前端。**
