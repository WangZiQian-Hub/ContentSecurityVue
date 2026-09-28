# 来源读取与能力重跑契约

浏览器仅调用 `/api/v1` 平台资源，不能直接调用算法。服务链为 TaskService → EvaluationService → registry 的 platform/evaluation adapter；来源读取由 HttpSourceAdapter 封装。前端上下文查询使用 `kind=task_result|model_comparison|audit_record|dataset_snapshot`，同时接受历史 `source_kind` 别名。

来源系统尚未接入。本契约为可调用的 HTTP 适配接口，**不是宣称原数据治理、模型或合规页面已有对应后端**。

`EVALUATION_UPSTREAM_URL` 为下列路径的共同前缀。请求使用单独的服务端 Bearer token，30 秒超时，不回退 fixture。成功响应统一 `{code:0,message:"success",data:...,trace_id,timestamp}`；异常转换成 502 / 30001 / upstream_unavailable，不暴露上游凭证。

| 接口 | 输入 | data |
| --- | --- | --- |
| GET `/evaluation-source/contexts` | kind、keyword | `{items: SourceContext[]}` |
| POST `/evaluation-source/resolve` | entity_type、entity_id、version_id | 精确 SourceContext，不选近似版本 |
| POST `/evaluation-source/rerun` | source_ref、capability_code、parent_task_id；X-Request-Id 为稳定子任务 ID | 新完成的 SourceContext，版本与冻结范围一致；新 source_task_id/trace/version 指向真实执行 |

完整 `SourceContext` 字段由 [JSON Schema](upstream-source.schema.json) 定义。标准标签和预测均按 `sample_id` 对齐；`sample_ids` 是冻结集合，`samples` 必须同集合且不重复。`expected/predicted/baseline` 为布尔标签或缺失，正类含义由 `positive_class` 明确，须与指标修订一致。`required` 冻结应覆盖集合，`coverage_unit` 必须匹配样本/场景/用例类型。真实来源必须状态 succeeded、algorithm_mode=real，样本/版本/任务链路/内容哈希全部匹配。LLM/mock 不能自动升级为正式验收。

`content_hash` 是 SourceContext 按 Pydantic 标准化（含默认字段）后、排除 content_hash 本身的规范 JSON SHA-256；算法为 UTF-8、ensure_ascii=False、sort_keys=True、separators=(',', ':')、禁止 NaN。Python 参考实现是 `app.evaluation_service.source_hash`。来源适配器须返回真实不可变版本，创建会重新读取并比较预检 hash，客户端无法填写测量值。

计数与核验型指标读取 `facts[{key,count,evidence_ref}]`，来源服务负责从真实冻结资源统计/标准链路/执行矩阵生成事实，不能从名称推断通过。`fact_key/counting_scope`、`matching_rule/deduplication_rule`、`required_keys/linkage_rule` 或 `matrix_definition` 必须在指标中明确；所需事实不存在时预检阻止。三阶段 `required_keys` 固定为 data,training,output。风险减少率要求相同样本和相同 evaluator_version/baseline_evaluator_version。

模型工作台同步兼容：`POST /tasks/execute` 继续接受 input.metric_codes/dataset_id/model_id 与 config.baseline_version/edited_version/dataset_version。来源解析为 `kind=model_comparison`，需唯一满足模型/数据/编辑后版本，并有 `facts.key="baseline_version:<所选基线版本>"` 的证据引用。未接入返回 502，非唯一或版本不匹配返回 422；保留 task.result.results、report 状态字段，增加 run_id/record_id/judgment_status/evidence_refs。

源模块跳转仅使用已核验的实际能力：模型 ID 跳模型管理；全链路必须原 source_task_id 与匹配 trace；数据/异常/风险/场景仅打开模块。未构造缺少 captureId 的神经元查询，也未把 data-governance/quality 当作已实现页面。

证据包包含冻结来源（样本 ID、标准标签、预测、事实引用）、指标定义、计算明细、版本、日志及 manifest。来源 Schema 不接受原始正文、密码、token 等任意额外字段，默认只传计算必需内容。API 证据详情省略大批量样本，样本详情通过授权分页接口读取；SHA-256 对应包中原始规范材料，摘要不冒充原始材料哈希。下载先鉴权生成短时票据，再通过二进制下载路径读取文件，不经过 JSON 解包器。

当前无法提供真实上游可用地址、权限体系或历史结果，因此未做跨模块真实数据联调；可以直接按此契约接入，不需要修改原业务页面。
