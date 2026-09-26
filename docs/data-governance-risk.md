# 风险识别与分级

入口：`/data-governance/risk-classification`。复用父页面导航、总体卡片样式、PanelCard、Element Plus 和统一 Axios 请求封装。仅添加风险页路由、导航可用状态和风险总体组件；其他子页面正文与资源数据没有改动。

## 数据及统计

- `src/api/data-risk.ts` 是唯一请求适配入口。`VITE_USE_MOCK` 不为 `false` 时动态载入独立 `src/mock/data-risk.ts`；正式模式不回退到 mock。
- 资源样本直接读取现有 `resourceSamples`，沿用 `sample_3_00002` 等 ID、数据集版本和语种。没有新增或伪造 V-/A-/R- 样本。账户字段由服务侧遮蔽，仍保留类型与可关联元信息。
- 现有演示资源每个数据集只有完整的 120 条。当前默认数据集有效检测 120、风险候选 2：账户元信息 1 条中风险、缺少来源的新闻 1 条提示；高风险 0。不是参考图中 10,000 / 240 条的占位统计。账户样本已有待复核工单，默认展示“查看复核”。现有资源没有 S-000204，因此没有另造该样本。
- 全部六个数据集初始总体为有效检测 720、风险候选 12、高风险 0、待复核 6。卡片口径抽屉列出纳入结果，每个固定资源版本仅纳入最新全语种结果，重跑不重复累计。
- 候选集合是完整资源集合按已存储演示证据筛选的结果，不是 preview。完整搜索、分页和导出在 mock 服务中统一执行。列表、详情、图表及导出绑定同一 resultId。零值等级不绘制伪扇区。
- 图表按 maximumSuggestedLevel 互斥去重，人工复核结果独立保存。`findings` 支持多类别；列表主类别加 `+N`，详情显示全部命中及证据引用。无模型自报置信度。
- 英文等未保存条件显示无结果；检测任务完成后再读取保存结果。条件变化会清空旧列表、选择、抽屉、任务并废弃迟到响应。

## 已接入与待接入接口

以下均已接入前端适配层与独立 mock 服务。仓库没有风险后端服务实现或可联调地址，**生产 API、持久化、权限鉴定和 LLM 检测均待后端接入**，不能将适配层视为生产接口已验通。

| 接口（相对 `/api/v1`）                                        | 方法 | 用途                                                                       |
| ------------------------------------------------------------- | ---- | -------------------------------------------------------------------------- |
| `/data-governance/risk-options`                               | GET  | 资源/固定版本/语种/方案、等级定义、类别、分页选项、动作权限及复核人        |
| `/data-governance/risk-overview`                              | GET  | 总体四卡、口径和纳入记录                                                   |
| `/data-governance/risk-results/latest`                        | GET  | 完全匹配 datasetId/versionId/language/schemeId 的保存结果，无结果返回 null |
| `/data-governance/risk-results`                               | GET  | 当前固定条件的历史结果                                                     |
| `/data-governance/risk-results/:id`                           | GET  | 保存的统计和等级分布                                                       |
| `/data-governance/risk-results/:id/samples`                   | GET  | keyword/level/status/page/pageSize 服务端过滤分页                          |
| `/data-governance/risk-results/:id/samples/:sampleId`         | GET  | 遮蔽正文、修订、所有 findings/evidence、规则快照、绑定案例及工单           |
| `/tasks`                                                      | POST | kind=governance-risk，固定 Scope 创建检测任务                              |
| `/tasks/:id`                                                  | GET  | kind=governance-risk，任务状态、失败原因、保存结果 ID                      |
| `/data-governance/risk-results/:id/samples/:sampleId/reviews` | POST | 带 inputSampleRevisionId；无 reviewId 创建工单，有 reviewId 提交人工结论   |
| `/risk-knowledge`                                             | GET  | resultId/sampleId/keyword，仅查询当前命中规则版本及关联知识，不调用检测    |
| `/data-governance/risk-results/:id/export`                    | POST | 按 keyword/level/status 返回全部匹配遮蔽样本，不携带分页窗口               |

字段类型见 `src/types/data-risk.ts`。统一请求封装负责 snake_case/camelCase、授权头、请求标识和响应 envelope。正式后端应将用户身份及角色作为权限来源，不信任浏览器传入的 reviewer/actions。总体纳入记录也须受访问权限约束。

## 后端模型与工作流契约（待实现）

1. 服务端按固定 datasetId/versionId 加载样本及 sampleRevisionId，冻结方案、类别枚举、等级定义和知识规则版本。浏览器只提交 Scope，不传模型密钥或任意样本文本。
2. 模型输入保留个人信息字段类型、可关联特征和受控标记；不能脱敏至证据消失。原敏感值仅存受控服务端，UI、导出、证据与日志只返回遮蔽值。
3. 结构化返回使用 sampleId/sampleRevisionId/status/findings/reviewRecommended。每项 finding 含 category/suggestedLevel/reason/ruleId/ruleVersion/evidenceRefs。校验样本修订一致、规则来自提供集合、规则版本匹配、证据真实存在、类别等级合法。
4. 根据固定方案计算 primaryCategory/maximumSuggestedLevel，服务端汇总有效检测、风险率、等级分布及复核状态，持久化不可变原检测结果。失败和 UNASSESSABLE 单独计数并保存原因；空 findings 仅表示本方案未检出风险。
5. 任务状态 running/succeeded/failed，succeeded 必须带已持久化 resultId。详情、历史、知识检索不得重调模型。生产可将大批量导出改为异步任务及下载地址，并同步修改当前数组响应适配器。
6. 工单创建使用 `(resultId, sampleRevisionId)` 唯一约束；重复提交返回已有工单。结论需权限、待复核状态及修订校验，必须有意见。确认、调整、排除都保留原 findings。生产实现需要事务与审计日志；mock 仅会话内模拟这些约束。
7. 人工结论不修改原样本或原检测图表。脱敏、内容修订进入独立治理任务并生成新版本。本页不提供自动修复动作。

## 验证范围

- `src/api/data-risk.test.ts`：风险/价值页跨页资源 ID 与版本一致、受控遮蔽、等级与过滤数守恒、完整分页/导出、重复检测总体去重、条件匹配、工单幂等、必填意见、旧修订拒绝、人工结果不覆盖原结果、真实接口请求契约。
- `src/views/data-governance/DataRiskPage.test.ts`：条件与迟到响应隔离、图表筛选、选中行联动规则/案例、复核状态、分页、错误状态。
- 既有 `src/api/data-anomaly.test.ts` 回归验证 20 项规则可查询、审核修改集生成新版本、原版本不变、全匹配导出；没有将异常质量规则搬入语义风险页。
- 浏览器连接器当前无可用浏览器，无法完成真实浏览器截图与视觉验收；已用 Vue 组件状态测试和生产构建验证。生产 LLM、安全校验、权限与持久化需要后端联调后验收。
