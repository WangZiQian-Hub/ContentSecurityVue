# 内容安全治理原型平台

参考效果图搭建的 Vue 前端项目。八个一级菜单、34 个二级路由、共享布局、图表与模拟接口。顶部搜索可定位页面，当前任务、消息、用户入口可打开，业务操作返回模拟结果。

## 在 VS Code 中启动

本机已安装项目依赖，可双击 `start-dev.cmd` 启动；双击 `内容安全治理平台.code-workspace` 用 VS Code 打开项目。

用 VS Code 打开本目录，终端执行（Node.js 22+）：

```sh
npm install
npm run dev
```

也可使用 pnpm：`pnpm install`、`pnpm dev`。本项目附带 pnpm 锁文件。

访问终端显示的地址，默认 `http://127.0.0.1:5173`。

```sh
npm run build
npm run lint
npm run format:check
npm run test
```

## 目录

```text
src/api/           请求封装、能力注册和 return 接口
src/mock/          示例数据
src/types/         数据类型
src/stores/        Pinia 数据装配
src/router/        八个一级菜单和子路由
src/layouts/       公共顶部、侧栏、搜索与弹窗
src/components/    指标卡、面板、图表、表格、能力表单
src/views/         各业务页面
src/styles/        蓝色主题及响应式布局
docs/              对接说明与页面验证资料
```

默认无需后端。`src/api/task.ts` 的 `executeTask()`、`listTasks()` 均有显式 `return`，`src/api/capability.ts` 注册全部 20 项能力。真实请求统一发送到 `/api/v1`，由环境变量切换；详见 [后端对接与范围说明](docs/integration.md)。

当前是前端原型：图表和 KPI 为样例，模拟任务保存在内存中，未实现真实模型训练、后台权限、数据库和审计落库。九份文档中涉及这些内容的要求已记录为后续实施范围。

设计依据、模块拆分原因与实现取舍见 [设计与实现说明](docs/设计与实现说明.md)。
