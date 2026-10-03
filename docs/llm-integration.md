# 模型服务接入说明

## 开关与令牌
将 `.env.local` 中 `VITE_GOVERNANCE_BACKEND=llm` 取消注释后重启前端即可启用价值、异常、风险三个模块的模型通道。模型请求根地址默认为 `/llm-api/v1`，可由 `VITE_LLM_API_BASE_URL` 覆盖。访问令牌只保存在当前浏览器标签页的 `sessionStorage.llmAccessToken`，与业务 `accessToken` 独立。

## 代理与范围
开发代理将 `/llm-api/*` 转发至 `http://127.0.0.1:8001` 并把前缀重写为 `/api`；生产站点服务器必须提供同样重写。模型模式的三个模块固定使用 `language=all`，方案由模型 options 返回。资源目录、版本和业务处理仍走 `/api/v1`。

## 改动点
三模块使用独立 axios 通道、Bearer 模型令牌和 trace/request id。任务支持 pending/running 以 2 秒轮询，成功后读取保存结果；模型模式隐藏异常变更集、风险人工复核等写入口。价值导出遍历结果全部分页，风险使用服务端 export。

## 已知偏差
价值页顶部 KPI 仍来自现有本地演示组件，未接入模型 `/kpis`。模型模式结果正文来自模型保存结果，页面不会请求业务资源 samples 做正文校验。

## 联调步骤
先启动 8001 模型服务和治理 worker，再启动 `npm run dev`（5173），进入数据治理页面填写模型访问令牌。检查三个分析模块请求均为 `/llm-api/v1/**`，资源目录仍为 `/api/v1/**`，并覆盖 pending、running、succeeded、failed、令牌失效和 worker 未启动场景。

## 验证记录
已验证：TypeScript 构建检查、ESLint（无 error）、既有 Vitest 基线记录。
未验证：本环境未启动 8001 模型服务和 worker，未进行浏览器 Network 实机联调；原仓库基线已有保护文件哈希、缺少 `.env.example` 及异常路径断言失败。
