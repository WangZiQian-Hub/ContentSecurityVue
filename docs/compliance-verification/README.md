# 全链路合规治理实施与验收

已完成总览及六个独立子页、真实 HTTP 层、Pinia 状态管理、合规专属演示 fixture、证据抽屉、告警认领/补证/复核 UI，以及接口契约。**未完成真实后端与算法联调。**

入口：当前开发服务 `http://127.0.0.1:5174/compliance`。按用户后续要求，本地开发默认开启明确标注的“示例演示”，无后端也可展示七页；真实接口仍保留，切换到真实模式后请求失败不会回退 Mock。演示模式不会自动套用到未知传入 ID。其他页面及全局端口配置没有修改；后续需固定使用当前端口时可运行 `npm.cmd run dev -- --port 5174 --strictPort`。

## 验证结果

- 后续启动修复：保留当前 5174 服务，本地默认 Mock；`scripts/compliance-startup-check.cjs` 验证 42 个菜单入口/子路径可渲染、无页面运行错误，并记录既有重定向到 `startup-check.json`。默认合规总览不请求缺失后端，启动截图为 `startup-demo-5174.png`。无入站参数时使用指定示例记录，有入站参数时不替代真实对象。

- `npm.cmd test`：24 个测试文件、129 项测试通过（包含新增 19 项合规测试）。
- `npm.cmd run build`：vue-tsc 类型检查和 Vite 构建通过。
- `npm.cmd run lint`：0 error，5 个既有 warning 位于非合规组件/公共外壳，遵守范围约束未改动。
- 合规新增/修改代码的定向 `prettier --check` 通过；未对全仓格式化。
- `scripts/compliance-browser-check.cjs`：Edge headless，1920×1080、1366×900；7 个独立路由、图表联动、抽屉与 ESC、认领确认、缺证禁关、分页及筛选清理旧详情、同一会话切换七个 Tab 不触发 POST、入站参数、真实错误不回退、其他模块冒烟验证；结果见 [browser-check.json](browser-check.json)。
- `protected-hashes.json` 保存实施前所有受保护 src 文件哈希；自动化测试逐文件核对通过。已有数据治理改动完整保留。`initial-git-status.txt` 为实施前状态。
- 公共外壳只在原页面 Tab 与 CapabilityDock 两个排除数组增加 `/compliance`；自动化测试还原这两个字符串后与原版本完全一致，非合规路径条件结果不变。
- 构建存在原有依赖分块 / 大 chunk 提示，不影响构建通过；未越界修改全局构建策略。

## 截图

[截图浏览页](screenshots.html) 包含七页的两个视口、源证据抽屉、复核弹窗与真实 HTTP 错误态。`-lower` 是实际滚动主内容区后的截图，补充首屏下方表格和结论。没有调整截图倍率或把设计 PNG 当成实现截图。

项目既有 `App.vue` 使用 1900px 固定画布随窗口缩放，并由 `.main-content` 内部滚动。此次按范围限制保留，不修改全局画布或其他页面；1366px 截图反映应用本身的真实缩放行为。

## 文件范围

- `src/views/compliance/**`：七页容器/视图、独立作用域样式、证据/选择/复核组件、神经元 SVG、隔离验证测试。
- `src/api/compliance.ts`、`src/types/compliance.ts`、`src/stores/compliance.ts`：Q1–Q7、写操作、任务查询、强类型及过期响应保护。
- `src/mock/compliance.ts`：显式示例模式的数据；示例中 308 条应有关系、7 缺口、4 关系中 1 缺口、4 训练检查中 1 缺口、192 激活单元中 3 异常；同一 CP-12 贯穿链路。
- `src/api/compliance.test.ts`、`src/stores/compliance.test.ts`、`scripts/compliance-browser-check.cjs`：契约、异步状态与浏览器验证。
- `src/layouts/AppLayout.vue`：仅两处条件数组。
- `docs/compliance-delivery/**`：原包解压内容；`docs/compliance-api-contract.md`：接口与后端缺口；本目录：截图/验证留痕。

## 后端与真实算法缺口

全部待联调端点、参数、响应、状态码和结果扩展见 [接口契约](../compliance-api-contract.md)。包括 Q1–Q7 的 overview、lineage、audits 列表/详情、traces、contexts、alerts 列表/详情、evidence；告警 claim/evidence/resolve、审计 reviews；统一 tasks/execute 与 tasks/{id}。

工作区未发现 FastAPI/其他业务后端源码，未新建后台或数据库。服务端鉴权、事务、幂等、版本竞争、事件追加存储、真实任务落库、训练检查、激活采集等仍需后端实现。精确版本/捕获的新建 neuron_audit 输入扩展尚未联调，前端保持只读查询，不声称已经支持。

示例认领只演示本模块内存状态；不把内存操作当作服务端落库。示例补证/关闭不伪造通过；真实 HTTP 写请求失败或 409 后会重读服务端状态。单元测试的替代客户端仅为测试，不是运行时降级逻辑。
