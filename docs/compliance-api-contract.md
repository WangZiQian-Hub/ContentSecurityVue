# 全链路合规治理接口契约

版本：2026-09-27。**本工作区只有前端，以下全部服务端端点尚未完成真实联调。** 已实现 HTTP 客户端不代表服务端存在。开发服务器返回 HTML/404/502 时页面保留错误，不回退示例。

## 运行方式与范围

- `npm.cmd run dev` 后打开终端所示地址的 `/compliance`。按用户要求，本地开发默认启用明确标注的独立 Mock fixture，当前运行端口保留 5174；真实 HTTP 层及后端 8000 代理配置保留。页面开关可切换真实接口；`VITE_COMPLIANCE_DEMO=false` 可配置真实接口启动。生产构建默认真实接口，除非环境显式指定演示模式（当前本机 `.env.local` 指定为 true）。
- `VITE_API_BASE_URL` 配置真实 API 根地址，默认 `/api/v1`。沿用 `src/api/request.ts` 的认证、请求 ID、响应解包和键名转换。生产部署需反向代理 `/api/v1`；未修改共享 Vite/请求配置。
- `VITE_USE_MOCK` 是旧模块开关，不控制本模块。公共外壳的旧演示徽标仅反映旧模块设置，本模块模式以自身提示为准。
- 独立设计示例只读映射已有模型工作台 ID；找不到 ID 返回未找到；已存在但没有审计产物的对象显示无结果。独立设计样例的完整 ID 带 `demo_` 前缀，`display_id` 仅用于展示。
- 示例认领仅在本模块内存中演示，页面明确标记，不持久化。补证/关闭/审计执行不伪造成功。切换模式重置示例会话。

## 通用协议

所有路径均相对 `/api/v1`。JSON snake_case，前端 camelCase。完整类型源为 `src/types/compliance.ts`，包括 Q1–Q7 与所有结果扩展；实现入口为 `src/api/compliance.ts`。不得把短别名或请求响应 `trace_id` 当作被审计对象 ID。

响应信封：`{code:0,message:"success",data:T,trace_id:"请求追踪ID",timestamp:"ISO8601"}`。错误响应 `code != 0`，`data:null`。列表 data 为 `{items,total,page,page_size,total_pages}`，页码从 1 开始，page_size 1–100。

请求头：`Authorization: Bearer ...`、`X-Request-Id`，已获得请求追踪 ID 时传 `X-Trace-Id`。身份和操作时间只由后端认证上下文及服务端时间产生。写操作按 `X-Request-Id` 幂等：相同请求 ID 与载荷返回首次结果，不重复追加事件；相同 ID 不同载荷应拒绝。弹窗在一次提交/重试中保留请求 ID。

状态码：200 成功；400/422 参数或证据语义不合法；401 未认证；403 无权限；404 对象/证据不存在；409 版本/状态冲突；429 限流；500 服务错误；502 上游不可用。超时和网络错误独立显示，可通过页面查询按钮重试。

公共引用：`subject_ref={entity_type,entity_id:string|number,version_id:string|null,display_id,label}`。ID 保留其实体种类与原类型。证据使用稳定完整字符串引用 `evidence_refs[]`。`null` 表示未知或缺失，不转换为 0。

四种状态分离：`execution_status=pending|running|succeeded|failed|cancelled`；`verification_state/state=verified|missing|unavailable|not_applicable|unknown`；`compliance_status=normal|risk|alarm|null`；`review_status=pending|confirmed|rejected|needs_evidence`。告警另用 `current_status=pending|processing|resolved`。任务 succeeded 不表示合规通过。

## 待联调端点清单

| 编号 | 方法与路径 | 入参 | data 类型 / 关键字段 | 联调状态 |
|---|---|---|---|---|
| Q1 | GET `/compliance/overview` | `from,to` ISO8601，半开区间 `[from,to)`；`scope=all|training|inference` | Overview：`as_of,scope,scope_description,expected_count,missing_count,handoffs[],pending_reviews_count,completed_audits_count` | 未联调 |
| Q2 | GET `/compliance/lineage` | `entity_type,entity_id,version_id?,direction=upstream|downstream|both` | Lineage：`nodes[],edges[],gaps[]` | 未联调 |
| Q3 | GET `/compliance/audits` | `capability_code?,subject_type?,subject_id?,version_id?,capture_id?,review_status?,from?,to?,scope?,page,page_size` | 分页 AuditSummary | 未联调 |
| Q3 | GET `/compliance/audits/{audit_id}` | 完整审计 ID | AuditDetail：摘要 + `task_id,execution_status,compliance_status,adapter_version,data_origin,evidence_refs,result,allowed_actions` | 未联调 |
| Q4 | GET `/compliance/traces/{trace_id}` | 目标 trace_id，`include_provenance=true` | TraceResult：`current_trace_id,records[],checks[],gaps[],audit_ref,conclusion,compliance_status` | 未联调 |
| Q5 | GET `/compliance/contexts` | `source_kind` 必填；`source_id?,trace_id?` | ComplianceContext：`resolution,subject_ref,task_id,inference_id,trace_id,model_id,model_version,capture_id,candidates[]` | 未联调 |
| Q6 | GET `/alerts` | `risk_level?,status?,stage?,subject_type?,subject_id?,page,page_size` | 分页 AlertSummary | 未联调 |
| Q6 | GET `/alerts/{id}` | 完整告警 ID | AlertDetail：摘要 + `rule_ref,evidence_refs,supplementary_evidence_refs,assignee_id,version,events,allowed_actions,resolve_blockers,trace_id` | 未联调 |
| Q7 | GET `/compliance/evidence/{evidence_id}` | 完整证据 ID | Evidence：`id,display_id,source_module,subject_ref,occurred_at,source_trace_id,version_ref,redacted_fields,integrity_state,allowed_actions` | 未联调 |
| W1 | POST `/alerts/{id}/claim` | `{expected_version}` | 最新 AlertDetail | 未联调 |
| W2 | POST `/alerts/{id}/evidence` | `{evidence_refs[],reason,expected_version}` | 最新 AlertDetail | 未联调 |
| W3 | POST `/alerts/{id}/resolve` | `{review_conclusion,evidence_refs[],expected_version}` | 最新 AlertDetail | 未联调 |
| W4 | POST `/compliance/audits/{id}/reviews` | `{conclusion:confirmed|rejected|needs_evidence,reason,evidence_refs[],expected_version}` | 最新 AuditDetail | 未联调 |
| T1 | POST `/tasks/execute` | `{capability_code,input}`，300 秒超时 | `{task_id,status,error_message?}`；执行状态与审计结论分离 | 原规范端点，本次未联调 |
| T2 | GET `/tasks/{task_id}` | 完整任务 ID | 同上；pending/running 时每 2 秒查询，离页停止 | 原规范端点，本次未联调 |

Q1 handoff：`{kind,label,expected_count,verified_count,missing_count,unavailable_count,missing_reason,target,subject_ref}`。统计为后端全量策略结果，分母为 0 显示“暂无可核验对象”。`target` 只能是本地已登记子页路径。待复核队列另用 Q3 分页查询，不从单页推算总数。

Q2 node：公共引用 + `{id,type}`。edge：`{id,from_id,to_id,relation,verification_state,evidence_refs,missing_reason,training_task_id}`。允许多父节点、未知关系、断点；接口应返回未知端点节点占位及不可用状态，不删掉缺口。图与表共用同一组边。

Q3 摘要：`{id,display_id,capability_code,subject_ref,review_status,review_reason,version}`。详情 result 为 discriminated union，`kind` 与能力码对应。明确增加可选 `from,to,scope` 过滤，与总览 Q1 相同范围；普通对象审计查询可省略。列表返回多个结果时必须用户选择，不能自动选第一条。仅一个精确匹配结果时自动读详情。后端分页列表及详情均需按主体、版本、捕获权限校验；前端同时拒绝不匹配主体/能力/版本/捕获结果。

Q4 record：`{stage,record_scope:provenance|current,subject_ref,source_trace_id,occurred_at,evidence_refs,verification_state}`。八阶段为原始数据、清洗治理、训练数据版本、训练过程、模型版本、模型推理、内容输出、场景应用。历史数据通过模型版本来源关联，保留原始 trace/time，不改写为本次调用。`checks` 为后端对全部适用阶段的五要素核验，可返回每阶段明细：`{key,label,stage?,required,state,evidence_refs,missing_reason}`。不适用说明写入 missing_reason；任一必需项缺失不能给出通过结论。`gaps={reason,evidence_refs,alert_id}[]`。

Q5 明确扩展：省略 `source_id` 时仅返回当前用户可见的引用候选，不启动任何算法，用于本模块对象选择器；`source_kind=model|model_call|training_task|dataset|task|trace`。候选为 `{source_kind,source_id,subject_ref,model_version,capture_id,label}`。模型多个版本或多个捕获返回 ambiguous 并由用户选定。`resolution=resolved|not_found|ambiguous|conflict`；未解析的字段一律 null。传入 ModelCall.id 必须经调用记录映射到统一 task_id；与 trace_id 冲突不得择一。已有模型工作台的 ID 规则不能全局更改。

Q6 明确扩展：status 可为逗号分隔的 `pending,processing`；列表默认这两个状态。stage 为 `training|inference|application`，应可扩展其他已登记阶段。摘要 `{id,display_id,subject_ref,description,risk_level,current_status,stage}`。事件 `{id,description,actor_id,occurred_at}` 只追加不覆盖。`allowed_actions=claim|evidence|resolve` 集合，`resolve_blockers[]` 为服务端当前缺失证据、权限或规则失败原因。补证必须校验稳定引用存在性、归属、权限与规则；追加补证后由服务端返回新的 blocker 状态，不因输入非空直接解锁关闭。

Q7 明确扩展：`redacted_fields=[{key,label,value:string|null,state}]`，只返回审计所需且已授权的字段，不返回敏感全文。`allowed_actions=copy|open_source` 集合。source_module 映射：`model-training/model-invoke/model-management/data-resource/data-governance/scenario/evaluation`。模型管理可传已支持的 modelId；其他来源仅“打开来源模块”，不宣称定位具体记录。404/403 不合成假日志。

## 结果扩展

- training_monitor：`{kind,checks:[{key,label,required,state,evidence_refs,missing_reason,rule_id,rule_version,occurred_at,detail}],checkpoints:[{id,label,expected_version,snapshot_ref,rule_version,evidence_refs}]}`。关联告警按 training_task 主体调用 Q6。snapshot_ref 缺失保持 null，不能用 expected_version 补齐。
- reasoning_audit：`{kind,steps:[{id,label,detail,occurred_at,verification_state,risk_level,evidence_refs}],risk_nodes:[{step_id,rule_ref,description,evidence_refs,alert_id}],audit_result,activation:null|{model_id,model_version,inference_id,capture_id}}`。steps 只包含可观测处理步骤。activation 四项均与已解析上下文匹配才关联神经元页。
- neuron_audit：`{kind,availability:available|unavailable,unavailable_reason,model_version,inference_id,capture_id,layer_indices[],neuron_indices[],unit,normalization_baseline,threshold,heatmap[][],abnormal_neurons:[{layer,index,value,concept,evidence_refs}],observed_count,ratio}`。矩阵二维索引对应 layer_indices/neuron_indices；未采集单元 null，未采集捕获不返回矩阵。阈值、异常项、统计比例来自服务端；前端只排版和映射色阶。

## 执行、并发与持久化

读页面、刷新、换 Tab 和筛选仅 GET。显式点击“重新审计”才调用 T1。保留能力码 `lineage_audit/training_monitor/reasoning_audit/neuron_audit/full_chain_audit`。

基础输入：lineage_audit 至少一个 model_id/dataset_id/task_id；training_monitor 必填 training_task_id；reasoning_audit 必填 inference_id 或 model_id+input；full_chain_audit 必须解析得到 task_id 或 dataset_id，不能仅传 trace_id。神经元基础输入只有 model_id、可选 layer，不能锁定本设计要求的版本/捕获，**精确版本捕获的新执行入口保持不可用，待后端扩展 schema 并联调后启用**。当前神经元 UI 只读 GET，未假装原契约具备精确捕获执行能力。

告警状态 pending→processing→resolved。claim 验证版本与权限；evidence 追加引用；resolve 再检查 processing、补证及规则复核。409/失败后前端重读详情；重读也失败时清除可操作详情并要求刷新，不乐观改为 resolved。后端必须事务性落库 `alert_events` 与 `audit_reviews`（或等价事件表），原 alerts/task_results/task_logs 不覆盖。版本号由后端增长。审计人工复核与原算法结果分离。

当前没有数据库迁移、服务端鉴权/幂等/事务实现、真实审计适配器或真实激活采集。以上机制是待后端实现的契约，不是已完成的线上功能。

## 验证边界

单元测试验证真实客户端调用参数、键名映射、上下文冲突、过期请求隔离、失败不回退、关闭失败不更新、示例证据一致性。浏览器测试与截图使用显式示例开关；真实模式截图保留真实 HTTP 不可用错误。全部测试均不等同于真实后端端到端联调。
