# 实施范围与后端对接

本项目参考全部九份 Markdown 文档与五张效果图，当前交付为前端框架。用户明确允许前端写死并预留 return 接口，因此本阶段不实现文档要求的 FastAPI、数据库、真实算法、LLM 服务、权限鉴权、真实审计留痕。

## 已采用的约定

- Vue 3 + TypeScript strict + Vite + Pinia + Element Plus + ECharts。
- 页面按整体平台能力组织，不显示课题编号。
- 用户要求九个一级入口，单独增加 `/model-training`；规范的 `/model-train` 保留。
- 所有能力统一 `POST /api/v1/tasks/execute`，前端不访问 adapter；补充材料的 `/api/tasks/execute` 采用正式 API 规范的带版本路径。
- 20 项能力与示例输入见 `src/api/capability.ts`；各业务页下方提供能力入口。
- 请求序列化为 snake_case，响应转换为 camelCase。注入 token、Request ID，并回传后端 Trace ID。
- 页面与图表为演示数据，刷新会恢复初始任务。Mock ID 使用 mock_ 前缀，避免冒充后端真实版本和审计 ID。

## 能力归属

| 后台责任 | 能力编码                                                                         | 前端位置                  |
| -------- | -------------------------------------------------------------------------------- | ------------------------- |
| t1       | data_ingest                                                                      | 数据资源                  |
| t1       | value_score、high_value_detect、causal_trace                                     | 数据治理 / 数据价值分析   |
| t2       | data_risk_weight、anomaly_detect、poison_trace、anomaly_repair                   | 数据治理 / 异常治理       |
| t2       | provenance_trace                                                                 | 全链路合规治理 / 谱系追踪 |
| t3       | semantic_risk、risk_knowledge                                                    | 数据治理 / 风险识别       |
| t3       | knowledge_edit、model_risk_governance                                            | 模型训推 / 模型评估与调用 |
| t4       | lineage_audit、training_monitor、reasoning_audit、neuron_audit、full_chain_audit | 全链路合规治理            |
| t4       | scenario_governance                                                              | 场景应用                  |
| platform | evaluation                                                                       | 测试评估                  |

## 接入步骤

1. 复制 `.env.example` 为 `.env.local`，设置 `VITE_USE_MOCK=false`。
2. 在 `vite.config.ts` 中设置后端代理地址；生产环境反向代理 `/api`，同时配置 SPA history fallback 到 index.html。
3. 按 `02-API接口规范.md` 实现统一响应体。任务调用和查询接口可沿用；资源列表的通用表格行是前端展示模型，需在 `src/api/` 各资源函数中将真实 DTO 映射为表格字段。
4. KPI 已预留 `GET /api/v1/kpis?kind=dashboard` 统计接口，返回结构见 `src/types/index.ts` 的 `Kpi`；图表、用户信息和通知仍是展示样例，需增加各自统计接口与状态管理。不要将切换 Mock 开关理解为完成全部后端联调。
5. 训练发起、模型部署、上传文件、用户权限变更等仅搭展示框架，具体后端动作契约需双方确认，当前不会执行这些真实操作。

## 后续实施优先级

依据《测试平台实施思路》：先实现平台任务、结果、日志、版本、指标、留痕的真实持久化；再通过适配器替换算法。训练与审计图表可暂用模拟算法输出，但正式版本的平台记录不得用前端 Mock 冒充。

测试中心应补齐中期/完成期阈值、数据集及模型版本关联、指标计算、报告、输入/时间/接口/版本/输出五项留痕。论文、专利属于成果登记，不作为算法性能指标。

补充 Markdown 的内嵌图片引用另一台电脑的 `C:\Users\15122\...` 路径，无法读取；本次视觉依据为用户实际提供的五张 PNG。
