# 可直接交给 Codex 的实施指令

请在用户提供的 `content-safety-platform.zip` 主项目代码基础上，实现“全链路合规治理”总览和六个子页面，并编写与后端交互的接口层。先读取同目录《全链路合规治理页面设计与接口报告.md》、7张页面PNG、2张交互状态PNG，以及开发规范01–07、README。优先看 `4K高清图` 内的图像细节。图像数值和短ID是设计示例，不能写死进在线业务。

## 一、必须遵守的范围

1. 保留8个一级菜单与其他模块所有内容、样式、页面代码、Mock数据、操作行为。禁止编辑 `src/views/dashboard/**`、`data-resource/**`、`data-governance/**`、`model-train/**`、`evaluation/**`、`scenario/**`、`system/**`；不要修改它们的store/API和全局CSS。不要对全仓格式化或重置已有用户改动。
2. 主要变更限定为 `src/views/compliance/**`，新增 `src/api/compliance.ts`、`src/types/compliance.ts`、`src/stores/compliance.ts`、合规专属Mock、合规目录下组件/作用域样式、必要的合规测试和接口文档。
3. 允许共享外壳的**最小隔离改动**：`AppLayout.vue` 内原有页面Tab与 `CapabilityDock` 的显示判断只对 `/compliance` 隐藏，以便合规容器提供本地7项Tab及结构化审计操作。优先只在两个现有排除条件增加 `/compliance`，不能改其他路径逻辑、顶部侧栏样式或共享组件。禁止用全局CSS或DOM删除旧Tab/入口。通过回归检查证明非合规路由输出不变。
4. 保留 `/compliance` 和六个既有子路径；总览为根路径，新增本地“审计总览”Tab，不引入 `/compliance/overview` 的未登记地址。现有 `/:tab?` 路由足够时不要改 `router/index.ts` 或 `navigation.ts`。路由参数改变时独立加载子页，不能六个Tab共用静态汇总内容。
5. 复用现有布局、PanelCard、AppIcon和配色；合规组件使用 scoped CSS 或 `.compliance-*` 命名。图片公共外壳是视觉说明，实施时以现有外壳为准。所有图标使用Element Plus或合规目录自有SVG，绝对不要用Emoji、字符方框、低清截图代替。图标轮廓、大小、对齐、hover/focus与标签要认真核对。

## 二、先核实已有代码再实现

读取 `src/router/index.ts`、`navigation.ts`、`layouts/AppLayout.vue`、`components/CapabilityDock.vue`、`api/request.ts`、`api/task.ts`、`api/resource.ts`、`types/model-workbench.ts`，以及三个已有跳入合规页的位置。记录初始git状态和受保护页面哈希，避免覆盖用户改动。

已知：训练页传 `trainingTaskId`，模型调用页传 `taskId: selected.id` 与 `traceId`，模型评估页传 `modelId`。其中 `selected.id` 是 `ModelCall.id`，不保证是统一task_id。必须经报告Q5解析后再读任务/审计结果；不成功要提示，不得选择第一条记录充当结果。

其他页面不一定支持query精确定位。禁止擅自改它们以适配本模块。模型管理可以使用它已支持的modelId；数据集、治理、训练、场景、测试等没有定位支持时，在合规页内打开只读“源证据详情”抽屉，提供完整ID复制与“打开来源模块”。进入来源模块不等于定位了那条记录，按钮文案与验收必须准确。

## 三、按图实现有独立职责的页面

- `/compliance`：范围/日期、两项行动指标（关系缺口、待复核审计）、当前范围解释、五类交接矩阵、待复核队列。统计分母来自后端策略和登记事实，不从当前分页计数。不复制综合态势KPI或六个重复导航入口卡。
- `/compliance/lineage`：对象/版本/方向选择、可缩放的工程关系图、选中关系证据、逐边校验表。多父节点、断点和部分关系未知要真实表达，不把关系当因果。表与图来自同一结果，互相定位。
- `/compliance/training-monitor`：接收trainingTaskId，规则检查时间轴、检查点证据包、关联告警。没有训练创建/暂停、loss曲线或训练样本治理表单。
- `/compliance/reasoning-audit`：调用选择、可观测步骤、风险规则证据、可选的内部激活关联。重新审计必须用户显式触发。不能伪造模型隐藏思维链。
- `/compliance/neuron-audit`：精确模型版本+捕获记录；层/单元矩阵有坐标、单位、基线、阈值，异常表与矩阵一致。无捕获数据就显示不支持/未采集，不能补零或生成“真实”随机图。概念关联是线索，不自动判定因果。
- `/compliance/risk-alert`：服务端筛选分页队列、详情、规则/证据、处置记录、认领、补证与复核关闭。对应补充状态图实现证据抽屉和复核弹窗，证据缺失或权限不足时按钮禁用并说明具体原因。
- `/compliance/full-chain`：解析Trace/调用，五要素、八阶段、整链结论与缺口入口。历史数据/治理/训练记录通过模型版本来源关联，保留source_trace_id和原时间；不能冒充同一次调用中的训练过程。

图中示例关联贯穿同一个CP-12缺口：谱系→训练→ALT-2309→整链。示例计数要保持报告第7节一致。示例短ID不得取代实际请求ID，使用 `displayId` 与完整引用分离。

## 四、接口与状态

使用Vue3 + TS + Pinia，页面负责展示，API负责请求，store负责数据装配和异步状态。沿用 `src/api/request.ts`，TS为camelCase、JSON为snake_case，统一baseURL `/api/v1`、响应信封和请求头。不要改公共请求层破坏其他模块，也不要跨页面导入并修改它们的内部store。

按报告Q1–Q7定义强类型请求/响应：总览、谱系、审计列表/详情、整链读模型、上下文解析、告警、证据详情。基础任务和资源路径来自原规范；Q1–Q7中的扩展是本次新增契约，先检查实际后端是否已有同等接口，再按一个明确契约落定。

已有结果优先GET，过滤/换Tab/刷新不POST。用户点“重新审计”才用 `POST /tasks/execute` 或规范异步任务，能力码保留lineage_audit/training_monitor/reasoning_audit/neuron_audit/full_chain_audit。遵守规范的input必需字段：full_chain_audit只在获得task_id或dataset_id后执行，不直接传不支持的trace_id；neuron版本/捕获扩展需要明确服务端schema支持，不能假装原契约已具备。

审计执行状态、证据核验状态、风险等级、人工复核状态必须分字段。任务succeeded不等于合规通过，业务已治理不等于原始输出没有风险，关系已发现不等于证据已核验。null、无权限、未知与不适用不得统一变为0或正常。

每页实现loading/empty/error/forbidden/partial等状态；神经元加unavailable。选择变化清空不匹配旧结果；用AbortController或序号忽略过期响应；卸载停止轮询；分页筛选变化重置page。服务端失败必须保留真实错误与重试，禁止自动降级为Mock成功。

Mock只用于明确的开发演示模式，并隔离在合规专属fixture。与真实API同类型、确定性数据、明确“示例数据”。优先读现有Mock对象作只读映射，禁止修改原模块fixture；找不到某传入ID时返回未找到，不生成无依据关联。

## 五、后端交互与后端不存在时的交付

主压缩包当前只确认有前端。若本次工作区存在后端，按开发规范的api→service→adapter/repository分层，增加Q1–Q7与处置/复核接口，复用任务、结果、日志和版本表，必要扩展用迁移，任务与留痕真实落库，算法可以通过明确标记的模拟adapter替换。

如果工作区仍然只有前端，完成真实HTTP请求层、对应类型、错误态、可运行Mock演示及 `docs/compliance-api-contract.md`（最好同时OpenAPI schema），列清每个缺失服务端端点、参数、响应、状态码和结果扩展。不要编造已存在服务，不把空数组/Promise.resolve当完成的在线接口，不以Mock跑通声称后端联调完成，也不未经任务需要重建整个后台。

告警动作按报告定义：claim、evidence、resolve均带expected_version与幂等请求ID；身份和操作时间取后端。`pending→processing→resolved`。关闭前检查关联补证和复核结果；失败或409时重载真实状态，不能本地直接打勾。历史告警、日志和算法结果不覆盖，新增alert_events与audit_reviews或等价追加事件；审计review的结论与原任务结果独立。

总览关系期望数、校验计数、风险/合规状态、证据引用、热力图和结论全由服务端提供。前端只做数字格式、图布局、色阶、筛选和选择，不用颜色、词匹配、ID名称或时间相近猜关联。请求响应trace_id不是被审计对象trace_id，必须显式传目标查询。

## 六、质量要求与交付验证

1. 从本仓库package.json找正确脚本，运行必需lint、类型检查、构建与相关测试。新增有意义的测试：各Tab独立；三类现有入站参数；ModelCall.id解析/冲突/未知；字段映射；无证据不通过；无捕获不显示矩阵；过期请求不覆盖新结果；告警关闭失败不改本地状态；在线失败不回退Mock。
2. 验证交互：谱系边与表联动、热力图异常坐标对应、证据抽屉、分页、筛选、复核弹窗的必填校验、键盘焦点/ESC与加载态；对截图逐页检查每个图标、表格对齐、文字截断、溢出和状态色。至少检查1920和常见笔记本宽度，不用缩放截图掩盖布局问题。
3. 验证跨页实际能力：准确接收原页面链接；不支持精确返回时走抽屉+复制ID+打开模块；历史训练与当前调用分开。不得给源页面拼不生效的query后就宣称联动完成。
4. 对比受保护文件哈希和git diff。除明确允许的合规文件、两处共享外壳隔离条件及必要契约文档/测试外，不引入其他修改。禁止广泛格式化、改全局图标组件或全局样式。共享外壳在非合规路径下的回归应通过。
5. 最终汇报：已实现页面/交互、修改文件、测试结果、实际请求端点、已联调与未联调接口、Mock范围、后台与真实算法缺口。将“前端演示可运行”和“真实端到端通过”分开陈述。
