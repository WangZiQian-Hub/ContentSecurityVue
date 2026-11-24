# HTTP 局域网部署的 UUID 兼容

通过 `http://192.168.100.128:21224` 等非回环 IP 的 HTTP 地址访问时，浏览器通常不处于安全上下文，可能不提供 `crypto.randomUUID()`。以前请求拦截器生成 `X-Request-Id` 时会在请求发出前报错，登录、上传和导出均可能受影响。

前端现在统一使用 `src/utils/uuid.ts` 的 `createUuid()`：优先使用原生 UUID；缺少时使用 `crypto.getRandomValues()` 生成 UUID v4。两者都不可用则明确提示升级浏览器，不使用 Math.random 作为幂等键来源，也不修改浏览器全局 crypto。

调用方已提供的 X-Request-Id 不会被覆盖。原有操作重试键的缓存、清理和新操作生成规则保持不变。

## 更新部署

源码开发环境重新加载应用；静态部署执行 `npm run build` 并部署新的 dist。

若使用之前的 Compose 方案，在后端 deploy 目录执行：

```powershell
docker compose --env-file private/compose.env -f compose.yaml -f compose.build.yaml build frontend
docker compose --env-file private/compose.env -f compose.yaml up -d --no-deps --pull never --force-recreate frontend
```

若服务器只接收镜像，应先在构建机生成并传输新的前端镜像，服务器 docker load 后再执行重建前端容器的命令。仅重启旧镜像不会更新 JavaScript。

刷新或强制刷新浏览器，确认已加载新静态资源。在实际 HTTP 地址检查登录请求能够发出，再验证上传、解析、导出及下载票据申请，浏览器控制台不再出现 randomUUID 的 TypeError。

## 兼容范围

此修复只解决 UUID 生成。项目中 `crypto.subtle.digest()` 的 SHA-256 完整性校验仍保留，它也可能受安全上下文限制；没有为了 HTTP 访问而跳过校验。需要这些功能时应使用可信 HTTPS 或 localhost 转发访问。

验证命令：

```sh
npx vitest run src/utils/uuid.test.ts src/api/request-uuid.test.ts
npm run build
```
