# 合规风险审计：错误清单与评论接口

> **面向后端同学。** 前端已按本文约定写完并预留了调用点，后端照此实现即可，前端不需要再改结构。

---

## 一、这次改了什么

| # | 变化 | 涉及位置 |
|---|---|---|
| 1 | 标签改名：**「合规风险预警」→「合规风险审计」** | `src/views/compliance/presentation.ts`、`src/router/navigation.ts` |
| 2 | **页面重写**：从"告警工单列表"改成 **「错误清单 + 评论」** | `src/views/compliance/RiskAlertPage.vue` |
| 3 | **审计环节并入**：原「待复核审计」卡片和表格从「审计总览」页移除 | `src/views/compliance/OverviewPage.vue` |
| 4 | 总览页第 4 张卡片改成 **「待处理问题」**，点击跳到本页 | 同上 |
| 5 | 新增 2 个评论接口函数（前端已写好，后端待实现） | `src/api/compliance.ts` |
| 6 | 新增 4 个数据结构 | `src/types/compliance.ts` |

**设计意图**：原来的"缺口 / 告警 / 审计报告"是三套概念，用户要在多个页面之间跳。
现在统一成 **"一条错误"**，在一页里看全、逐条评论。

---

## 二、错误清单是什么

「合规风险审计」页展示一份**错误清单**，每条错误有两个来源：

| 来源 | `source` | 含义 | 谁算的 |
|---|---|---|---|
| **系统检测** | `system` | 前端按固定检查口径，从谱系 / 任务 / 模型工作台**现算**出的缺口 | 前端 |
| **告警工单** | `alert` | 后端 `compliance_alerts` 表里**已登记**的工单 | 后端 |

### 系统检测的 4 类检查口径

| 层级 | 检查项 | 算法 | 数据来源 |
|---|---|---|---|
| 链路层 | 数据版本 → 治理任务 | 谱系边 `verification_state === 'missing'` | `GET /compliance/lineage` |
| 链路层 | 治理版本 → 训练任务 | 同上 | 同上 |
| 链路层 | 训练产物 → 模型版本 | 同上 | 同上 |
| 链路层 | 模型版本 → 推理输出 | 调用记录的 `(model_id, version)` 不在模型版本登记表里 | `GET /model-workbenches/current` |
| 任务层 | 执行状态 | `status === 'failed'` | `GET /tasks` |
| 模型层 | 训练检查点齐全 | 应有检查点数 − 实际保存数（按 `epochs / 3` 存档规则推算） | `GET /model-workbenches/current` |

> **说明**：任务层只检查**执行状态**，不检查五要素完备性；
> 五要素的细查在「全链路追踪」页做。模型层同理，神经元激活部分暂未纳入。

### "已修复"怎么判定

前端把每轮算出的错误编号存进浏览器本机档案。**上一轮出现过、本轮消失的**，标记为「已修复」，
仍然保留在清单里（灰显），评论一并保留。**后端不需要参与这个判定。**

---

## 三、⭐ 错误编号（`error_id`）规范

评论挂在这个编号上，所以**编号必须稳定**。前端按业务对象拼成：

| 类型 | 格式 | 例子 |
|---|---|---|
| 链路断链 | `link:{关系名}:{边id}` | `link:输入数据引用:edge-process-input-tsk_process_demo_06` |
| 调用引用缺失 | `link:模型版本引用:{调用记录id}` | `link:模型版本引用:CALL-COMPLIANCE-001` |
| 任务执行失败 | `task:{taskId}:failed` | `task:tsk_process_demo_06:failed` |
| 检查点缺失 | `model:{训练任务id}:checkpoint:{轮次}` | `model:TR-COMPLIANCE-001:checkpoint:3` |
| 告警工单 | `alert:{告警id}` | `alert:ALERT-COMPLIANCE-001` |

### ⚠️ 后端注意事项

1. **编号里含中文和冒号**，前端会做 URL 编码（`encodeURIComponent`），后端按**已解码的字符串**处理。
2. **后端不需要认识这些编号**，当成普通字符串存取即可。
3. 建议评论表加索引：`(error_id, created_at)`。
4. 编号**可能很长**（最长约 60 字符），字段长度建议 ≥ 128。

---

## 四、后端需要实现的接口

### 4.1 评论接口（**必须**）

前端已经写好调用（`src/api/compliance.ts` 的 `errorComments` / `addErrorComment`）：

```
GET  /api/v1/compliance/errors/{error_id}/comments
     出参：data = [ { id, author, content, created_at } ]

POST /api/v1/compliance/errors/{error_id}/comments
     入参：{ "content": "评论内容" }
     出参：data = { id, author, content, created_at }
     请求头：X-Request-Id（幂等，沿用现有规范）
```

**字段约定**（与现有响应一致，前端会自动转驼峰）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 评论 ID |
| `author` | string | 评论人（后端从登录态取，前端不传） |
| `content` | string | 评论正文，建议上限 500 字 |
| `created_at` | string | ISO 8601 带时区，如 `2026-10-05T14:30:00+08:00` |

**错误处理**：沿用现有 `{code, message, data, trace_id, timestamp}` 信封。

**当前状态**：前端有开关 `COMMENT_BACKEND`（`RiskAlertPage.vue` 第 25 行附近），
现在是 `false`（评论暂存浏览器本机）。**后端接口就绪后改成 `true` 即切换，其他代码不用动。**

---

### 4.2 错误清单聚合接口（**建议**，性能优化）

**现状**：前端为了算出这份清单，要发 **约 15 次请求**
（2 次对象清单 + 11 次谱系 + 1 次模型工作台 + 1 次任务列表），首屏约 2 秒。

**建议新增**：

```
GET /api/v1/compliance/errors
     入参：from / to / scope（可选，与 /compliance/overview 一致）
     出参：data = [ AuditError, ... ]
```

```ts
interface AuditError {
  id: string                 // 见第三节的编号规范
  source: 'system' | 'alert'
  layer: 'link' | 'task' | 'model'
  title: string              // 一句话，如 "数据集 6 → 治理任务 06"
  detail: string             // 具体原因
  state: 'open' | 'fixed'
  target: string | null      // 前端跳转的目标子页面
}
```

**收益**：前端从 15 次请求变成 1 次，首屏秒开。

---

### 4.3 缺口转工单（**可选**，长期）

**现状**：系统检测出的缺口**不会**生成告警工单，两者是隔离的。
用户在错误清单里看到缺口、评论完，工单还是得另外建。

```
POST /api/v1/compliance/errors/{error_id}/promote
     出参：data = 新建的告警工单
```

---

### 4.4 接口路径一致性问题（**待讨论**）

排查发现，合规模块里 `/alerts` 没有模块前缀：

```
/api/v1/compliance/overview     ← 有前缀
/api/v1/compliance/audits       ← 有前缀
/api/v1/alerts                  ← ❌ 没有前缀（但它是合规模块的接口）
/api/v1/alerts/{id}/claim
/api/v1/alerts/{id}/evidence
/api/v1/alerts/{id}/resolve
```

**另外**：`/alerts` 在后端被定义了两次 —— `routers/compliance.py` 和 `routers/resources.py` 各有一份。
因为 `main.py` 里 `compliance` 先注册，**`resources.py` 那一份是死代码**。

**建议**（破坏性改动，需评估）：

```
/api/v1/alerts  →  /api/v1/compliance/alerts
```

⚠️ 前端 `src/api/compliance.ts` 有 6 处要跟着改。

---

## 五、前端已经预留的位置

| 位置 | 内容 |
|---|---|
| `src/types/compliance.ts` | `AuditError`、`ErrorComment`、`AuditErrorLayer`、`AuditErrorSource`、`AuditErrorState` |
| `src/api/compliance.ts` | `complianceApi.errorComments()`、`complianceApi.addErrorComment()` |
| `src/views/compliance/RiskAlertPage.vue` | `COMMENT_BACKEND` 开关、`loadComments()`、`postComment()` 两个封装函数 |
| `src/mock/compliance.ts` | `demoAuditErrors`（示例演示模式的错误清单） |

**切换到服务端存储要改的代码**（仅 1 行）：

```ts
// src/views/compliance/RiskAlertPage.vue
const COMMENT_BACKEND = false   // → 改成 true
```

---

## 六、已知限制（前端侧，供参考）

| # | 限制 | 说明 |
|---|---|---|
| 1 | **评论暂存浏览器本机** | 换浏览器 / 换电脑看不到，别人也看不到。等 4.1 接口 |
| 2 | **首屏约 2 秒** | 要发约 15 次请求。等 4.2 聚合接口 |
| 3 | **"已修复"判定依赖本机档案** | 存在 `localStorage`，换机器会丢。后端不需要参与 |
| 4 | **任务层不含五要素** | 只查执行状态；五要素在「全链路追踪」页细查 |
| 5 | **模型层不含神经元激活** | 后端暂无聚合接口 |
| 6 | **缺口不会自动生成工单** | 见 4.3 |
| 7 | **演示模式不支持评论** | 示例演示模式下评论接口会抛错（前端已避开，走本机存储） |

---

## 七、验收建议

后端实现 4.1 后，前端把 `COMMENT_BACKEND` 改成 `true`，然后：

1. 打开「合规风险审计」页，错误清单应有 11 条（当前数据：6 链路 + 1 任务 + 3 检查点 + 1 工单）
2. 任选一条，发一条评论
3. 刷新页面 —— 评论仍在（说明存到了服务端，而不是浏览器）
4. 换一个浏览器打开 —— 评论仍在
5. 直接查评论表 —— 应能看到 `error_id` 和 `content`
