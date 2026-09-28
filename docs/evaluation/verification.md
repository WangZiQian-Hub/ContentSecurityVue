# 实施与验证记录

日期：2026-09-28。依据本次目标文件、交付报告业务定义、所附 PNG 与现场仓库，未采用材料中旧的 Mock 授权。未提交 Git commit，保留用户原有未提交修改。

## 已实现

- 指标管理、任务、新建、执行、结果、记录、指标详情、证据详情；复用原有五标签与路由，通过 query 下钻。
- 独立 typed API、Pinia store、请求中断/选择序号、3 秒轮询与失败退避、最后更新时间；真实 HTTP 与全局 Mock 开关隔离。
- 指标草稿、发布、不可变修订、启停；26 项资料定义初始化为草稿或待完善，无虚构发布历史。
- 服务端预检、正类/版本/样本/来源 hash 核验、冻结计划、pending 任务、启动、取消、失败重试与新 attempt。
- SQLite/SQLAlchemy2 持久化，Pydantic2 参数与响应 DTO，Alembic 初始迁移；任务、结果、证据、日志、幂等响应与导出落库。
- Coverage、FPR、Recall、Accuracy、配对风险减少率、计数、链路还原、三阶段及矩阵事实核验。分母零/缺失材料不伪造值；任务执行状态与验收结论独立。
- recordId 精确解析、歧义候选、冲突/不存在/演示记录区分；结果至证据、归档至来源、复测新任务。
- 服务端队列生成 HTML 可读报告与带 manifest 的 ZIP 证据包；鉴权申请短时下载票据；文件与内容 SHA-256 校验。
- 原模型工作台同步 execute 形状兼容；真实上游缺席时明确返回不可用，不宣称跨模块联调完成。

## 自动化结果

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| vue-tsc + Vite build | 通过；保留原项目大 chunk 提示 | [build.log](build.log) |
| ESLint | 0 error；5 个既有文件 warning，评估文件无 warning | [lint.log](lint.log) |
| 新增前端测试 | 11 / 11 通过 | [frontend-tests.log](frontend-tests.log) |
| 后端 pytest | 21 / 21 通过 | [JUnit XML](backend-test-results.xml)、[摘要](backend-tests.log) |
| Ruff | 通过 | [ruff.log](ruff.log) |
| mypy | 17 个 app 文件通过 | [mypy.log](mypy.log) |
| 原项目全量 Vitest | 138 通过、2 个旧隔离断言失败，详见下方 | [full-tests.log](full-tests.log) |
| 真实 HTTP + 既有 Vite 代理 | 通过，数据库指标 26，真实任务/记录 0；未接入来源 unavailable；演示记录 demo_only | [http-smoke.json](http-smoke.json) |
| 独立评估身份头 | 通过，未变更共享凭证 | [scoped-auth-smoke.json](scoped-auth-smoke.json) |
| OpenAPI 与运行服务一致 | 32 个路径、58 个 schemas | [openapi-verification.json](openapi-verification.json) |
| 受保护文件 | 234 个全部一致，AppLayout 精确符合唯一授权变化 | [protected-comparison.json](protected-comparison.json) |

关键断言覆盖：TP480/FN20/FP30/TN470 得 Coverage96%/FPR6%、95%/5% 分别通过与未通过、等于阈值、未舍入边界、零分母；缺标签/样本不一致/模型或数据漂移/未发布/阶段目标缺失/权限；后改修订不改历史值/阈值/结论/hash；同请求 ID 重放与不同 body 409；start/cancel 并发；上游失败重试/子任务与重启中断恢复；真实后台 worker 不依赖前端计时器；记录解析四种异常；异步报告/证据包内容/manifest/授权与过期票据/证据损坏阻止导出。前端覆盖请求隔离、字段转换、kind 参数、请求 ID、旧响应防覆盖、离页中断、轮询退避/终态停止及只允许的共享变化。

全量 Vitest 的两个失败均位于 `src/views/compliance/compliance-isolation.test.ts`：

1. 旧 protected-hashes 快照与本次开始时工作树不一致；**基线阶段即失败**，当时 128 通过、1 失败，见 [baseline-test.log](baseline-test.log)。用户在数据治理部分已有修改，未回滚或改写。
2. 旧 AppLayout 字节断言只允许历史 `/compliance` 接线，不允许新增 `/evaluation` 排除项。本轮用户明确授权后，该旧断言增加一项失败。未修改受保护的原测试；新增评估隔离测试依据本轮初始文件，验证恰好只改这一处。

## 保护范围

初始用户变更：src/mock/data-risk.ts、src/styles/data-governance.css、src/types/data-risk.ts、DataAnomalyPage.vue、DataRiskPage.vue、RiskChart.vue，及已有 ZIP / 开发日志。均未触碰。原 router/navigation、其他 api/stores、全局样式、共享组件、前端 package/lock/config 全部 hash 一致。

AppLayout 唯一 diff，见 [layout.diff](layout.diff)：

```diff
- <router-view /><CapabilityDock v-if="!['/data-resource', '/data-governance', '/model-train', '/compliance'].includes(current.path)" />
+ <router-view /><CapabilityDock v-if="!['/data-resource', '/data-governance', '/model-train', '/compliance', '/evaluation'].includes(current.path)" />
```

五标签显示条件、标题/用户/日期/全局演示标记和其他内容逐字保留。排除条件只新增 evaluation，不改变其他模块的真假值。

## 真实、测试夹具与未接入部分

| 类型 | 状态 |
| --- | --- |
| 平台机制 | HTTP、持久化、计算、快照、日志、状态机、证据及异步导出真实实现 |
| 前端演示模式 | 本模块未启用，也没有错误后降级；原平台其他模块数据模式不变 |
| 替代算法 | 未在运行服务中安装模拟/LLM 算法 |
| 自动测试夹具 | 仅 backend/tests 注入 FixtureAdapter，临时数据库；算法标识 real 用于测试正式来源的校验分支，不代表真实算法输出；不会装入生产数据库或成为 fallback |
| 上游资源与算法 | 未提供真实来源服务地址；保留 HTTP 契约与 unavailable 错误；源系统负责真实登记、标签、版本和结果 |
| 用户体系 | 独立单工作空间 Bearer 认证已实现；平台 SSO/用户目录尚未接入，未替换其他页面权限逻辑 |

## 尚未完成的环境验证

**真实页面截图与八大模块浏览器回归未完成。** 本轮 UI 工具返回 apps=[]、browsers=[]；Edge 与内置 IAB 均返回 Browser is not available，原生控制入口被禁用。没有伪造截图、使用设计 PNG 充当实现截图或宣称完成视觉验收。当前证据为构建、真实 HTTP、自动测试和逐字 hash 对比；这些不能替代浏览器点击与响应式视觉检查。

浏览器恢复后应补验：五标签分别切换；草稿编辑发布；选择实际来源并预检冻结；启动与取消；结果到证据；recordId 四种异常；报告异步状态与下载；1366/窄屏布局；其他八大模块代表页面前后截图。跨模块端到端真实算法联调还需按 [上游契约](upstream-contract.md) 提供真实服务，不能用自动测试夹具冒充。

当前 SQLite 部署限定单进程；来源读取、冻结和最终结果在事务边界内，超大规模任务需后续接入正式队列和数据库。生产没有默认开放管理员权限；本地启动器的随机开发凭证留在忽略目录，配置与文档不含密钥。
