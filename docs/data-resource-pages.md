# 数据资源主子页面与联调说明

## 页面入口

`/data-resource` 是数据资源总览，不再默认显示接入表单。平台首页 `/dashboard` 保持原用途。

| 地址                      | 文件（src/views/data-resource/） |
| ------------------------- | -------------------------------- |
| /data-resource            | ResourceOverviewPage.vue         |
| /data-resource/ingest     | DataIngestPage.vue               |
| /data-resource/datasets   | DatasetManagePage.vue            |
| /data-resource/statistics | ResourceStatisticsPage.vue       |

DataResourcePage.vue 是父容器：当前页面 KPI + 导航 + router-view。显式子路由在 src/router/index.ts，页签链接在父组件中。AppLayout 对本模块不再重复生成页签。新增“资源总览”入口用于返回主页面。

## 数据分层

顶部卡片与其他模块统一使用 `<KpiStrip :kind="kpiKind" />`：KpiStrip → api/kpi.ts → GET /api/v1/kpis?kind=...。父页面根据当前路由选择 kind。组件不再支持 data 属性。

| 页面         | kind                |
| ------------ | ------------------- |
| 资源总览     | resource-overview   |
| 数据接入     | resource-ingest     |
| 数据集管理   | resource-datasets   |
| 数据资源统计 | resource-statistics |

四组卡片的示例数据集中在 src/mock/kpis.ts；修改名称、数值、单位、变化率和图标都在这里。四个页面使用上表的 kind。

图表、表格及报表继续通过 stores/data-resource.ts（Pinia）→ api/data-resource.ts → request.ts。summary 中的 kpis 仅用于报表快照和图表总量，不再驱动顶部卡片；示例快照从同一份 mock/kpis.ts 配置获取，真实后端应保持统计口径一致。类型见 types/data-resource.ts。JSON snake_case 和 TypeScript camelCase 由现有请求层转换。

VITE_USE_MOCK=true 时，展示 mock/data-resource.ts 中的只读截图示例；任务、版本及 trace_id 均为示例，不作为真实记录。创建/编辑/执行在示例模式会明确提示连接后端，不生成模拟成功。设置 false 并重启开发服务可走真实接口。此改动没有新增后端服务或数据库。

## 本次前端所需接口（需后端实现/确认）

统一响应体仍为 `{code,message,data,trace_id,timestamp}`。

顶部卡片接口：`GET /api/v1/kpis?kind=resource-overview`（其他页替换 kind）。成功响应的 data 为 `Kpi[]`，每项包含 id、label、value、unit、change_rate、icon。Mock 模式调用相同的 getKpis 函数读取示例配置；VITE_USE_MOCK=false 时才发送真实网络请求。

| 方法与路径（前缀 /api/v1）  | 请求                                                                                    | data                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| GET /data-resources/summary | view=overview/ingest/datasets/statistics；可选 start_date/end_date/source_type/language | ResourceSummary；包含 kpis、trend、modalities、sources、languages、quality、quality_score、issues、ranking |
| GET /datasets               | page/page_size/keyword/modality/language/source_type/quality_status                     | PageResult<ResourceDataset>                                                                                |
| POST /datasets              | name/description/owner/source_type/languages                                            | ResourceDataset，服务端生成 ID、版本及审计字段                                                             |
| PATCH /datasets/{id}        | 编辑后的字段                                                                            | ResourceDataset                                                                                            |
| GET /tasks                  | capability_code=data_ingest，page/page_size/keyword/status                              | PageResult<IngestTask>                                                                                     |
| POST /files                 | multipart/form-data，file                                                               | `{file_id}`；上传服务校验格式和大小                                                                        |
| POST /tasks/execute         | capability_code=data_ingest、name、input、config                                        | Task，必须真实落库并生成 trace_id                                                                          |

summary 与 files 为本次 UI 的建议扩展契约，并非原文档已实现接口。ResourceDataset 的 storage_gb/modalities/owner/quality_score 以及 IngestTask 的 progress/计数/source_name/dataset_name 是展示需要的扩展字段。后端需提供或在接口层适配。

接入 input 包含 dataset_id/dataset_name/source_type/languages/files，新增 connector_type（file/database/api/object_storage/queue/web）区分接入方式，保持 source_type 的业务分类枚举不变。files 是上传成功后的文件 ID 数组，不提交本机路径。非文件连接器的 source_address 由后端校验。凭证应由后台凭证管理提供。

统计查询在真实模式传递筛选参数；示例模式明确提示固定快照，不假装完成筛选。CSV 导出当前已加载 KPI 与使用排行，示例报表标记“示例”。接入进度来自任务记录，点击任务行可切换，刷新记录可重新查询；当前没有自动轮询。数据集抽屉提供基本信息、元数据、质量评分；详细质量报告、历史版本和原始内容预览需后端扩展后再实现。
