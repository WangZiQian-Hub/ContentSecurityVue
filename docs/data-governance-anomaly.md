# 异常数据治理

入口：`/data-governance/anomaly`。沿用数据治理外壳、PanelCard、Element Plus 和请求层；只调整共享容器以启用异常页签，没有修改数据处理、价值分析或资源页面业务。

## 真实结果的人工复核

当 `VITE_USE_MOCK=false` 且 `VITE_GOVERNANCE_BACKEND=llm` 时，`8001` 负责检测和保存候选，`8000` 负责复核和发布。已保存的 v2.0 / v2.1 结果可直接复核，无需重新调用模型；第一版只接受 `topic_label` 修改。

1. 在当前数据集版本的异常结果中选一条建议，检查原标签、正文和建议标签，点击 **提交复核**。
2. 打开 **人工复核**，选择 **审核通过** 或 **驳回**。通过只加入待发布修改集，不立即修改样本。
3. 检查修改集，点击 **生成新版本 → 确认生成新版本**。新版本仍在同一数据集下，旧版本和历史结果不变。重新选择新版本可检测修复后的样本。

复核使用 `8000 /api/v1/data-governance/anomaly-reviews/{result_id}` 下的 `GET /state`、`POST /samples/{sample_id}/candidates/{action}` 及 `POST /change-set/{remove|validate|generate-version}`。业务登录负责写权限；`X-Model-Access-Token` 仅用于让业务后端在配置的模型服务上核验候选归属，不使用模型管理员密钥。模型服务默认位于 `http://127.0.0.1:8001`，如部署位置不同，在业务后端配置可信的 `LLM_GOVERNANCE_ORIGIN`。连接检查失败不会把真实结果切成模拟数据。

首次更新后重启 `8000`，由正常建表流程创建 `anomaly_reviews`。检测服务和 worker 无需为本功能重启。旧版本仍可查看复核历史，但不能继续发布；发布前修改集或基础版本已变化时，必须重新校验。

## 早期非 LLM 接口与演示约定

全部接口经过 `src/api/request.ts`，继承 `/api/v1`、鉴权、trace/request ID、请求 snake_case / 响应 camelCase、统一 envelope。所有异常接口携带 `kind=governance-anomaly`（GET 在 query，POST 在 body），不使用 module 替代 kind。

范围：`datasetId, versionId, language, schemeId`；任务沿用 `POST /tasks { kind, name, input }`。服务端应逐字段完全匹配范围，返回已保存结果；无匹配返回 null。候选操作发送 `candidateId, inputSampleRevisionId`，不得只凭行 ID 修改审核对象。版本生成发送 `validationToken`，后端必须再次校验并实施幂等控制。

| 接口                                                                           | 前端状态                                        | 服务端状态                           |
| ------------------------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------ |
| GET /datasets/:datasetId/versions/:versionId/samples?ids=                      | 复用现有资源接口，校验 ID/正文/语种             | 沿用现有适配；演示时读取共享资源集合 |
| GET /data-governance/options?kind=governance-anomaly                           | 已接适配层及独立 mock，含目录、方案、20 项规则  | 异常 kind 的真实响应待联调           |
| GET /overview?kind=governance-anomaly                                          | 独立总体状态、统计口径                          | 待接聚合服务                         |
| GET /data-governance/anomaly-results/latest                                    | 完全匹配历史结果                                | 待接持久化结果服务                   |
| GET /data-governance/anomaly-results                                           | 历史结果抽屉                                    | 待接，按完整范围返回                 |
| GET /data-governance/anomaly-results/:id                                       | 当前结果及聚合                                  | 待接                                 |
| GET /data-governance/anomaly-results/:id/samples                               | 服务端过滤分页；全量导出逐页读取                | 待接，应保证同一结果快照             |
| GET /data-governance/anomaly-results/:id/samples/:sampleId                     | 保存的依据、来源、候选及时间线                  | 待接；详情不得触发 LLM               |
| POST /tasks；GET /tasks/:id                                                    | 异步创建和轮询；kind 沿用现有约定               | 异常任务 worker 待接                 |
| POST /data-governance/anomaly-results/:id/samples/:sampleId/candidates/:action | generate / submit / approve / reject / withdraw | 待接；鉴权和状态转换由后端执行       |
| GET /data-governance/change-sets/current                                       | 按单数据集、单基础版本聚合                      | 待接                                 |
| POST /data-governance/change-sets/remove                                       | 移除条目并记录排除项                            | 待接                                 |
| POST /data-governance/change-sets/validate                                     | 展示修改数、排除项、校验结果、目标说明          | 待接，返回校验令牌                   |
| POST /data-governance/change-sets/generate-version                             | 校验后一次生成，展示后端返回版本 ID/label       | 待接真实事务版本服务                 |

`VITE_USE_MOCK=false` 启用真实请求，不会静默退回演示。浏览器没有模型密钥、模型调用或自行推算的 v2.4。

## 演示与边界

独立服务 `src/mock/data-anomaly.ts` 使用数据资源的完整样本集合，未新增样本 ID。默认是资源目录中数据集 3 / dsv_000003 / 中文，不冒充图中不存在的 S-000182 或 v2.3。每版本演示资源共 120 条，默认中文有效 41 条，其中 39 条文化正文对应预置的标签异常；12 条已审核项进入同一修改集，27 条待处理。四张总体卡片也基于保存的演示结果聚合，不复制效果图里的总体数字。

标签、修订标识与检测证据属于独立演示记录；原资源接口目前不提供标签或正式修订 ID。来源文件和行号不存在则显示未记录。所有异常都具有原文引用；没有证据的重复、格式、缺失类型显示 0，不伪造重复关系、来源或污染传播。20 项规则可查询，但不声称已实现 20 项后端检测算法。

演示任务按完整资源集合读取预置证据，不调用 LLM。演示写操作保存在本次模块会话内；刷新会恢复初始场景。生成版本实际创建独立完整快照和新修订，原共享资源不变，但尚不注册到跨模块资源目录。跨模块样本定位按钮禁用并解释原因。

候选从 DRAFT → PENDING_REVIEW → APPROVED/REJECTED；审批通过只加入修改集。生成新版本后才标记 PUBLISHED。重新生成产生新候选并记录 replacesCandidateId；已提交对象不得覆盖，可先撤回。移除修改集条目后旧校验令牌失效。真实后端还必须实现：基础版本预期校验、修订一致性、字段冲突、规则/数据失效、撤销审核及删除候选同步移除、权限、审计、事务和幂等。

LLM worker 待接：固定样本内容与版本化标准输入；结构化输出验证 ID、字段白名单、类型、原文引用；精确重复/格式/必填规则由后端处理；失败不能伪装为空 findings。重复候选应保留主记录/排除重复项；缺字段不可从可信来源补齐时只能标记待补充。

## 验证

API 测试覆盖资源 ID/正文/语种一致性、类型与状态守恒、全量分页导出、完全匹配历史结果、20 规则目录、异步任务、12 条审核项一次生成一个快照、原资源不变、旧令牌拒绝、候选取代及提交锁定、kind 与修订参数传递。页面测试覆盖条件切换竞态、清除旧详情、分页和类型/详情联动。构建及全仓测试结果见交付说明。
