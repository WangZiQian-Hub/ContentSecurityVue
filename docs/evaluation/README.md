# 测试评估实施与启动

本次仅实现测试评估工作区与独立 FastAPI 服务，不修改其他业务模块。原始报告中的历史 Mock 授权未被沿用；默认真实 HTTP，服务失败不会回填示例结果。

## 启动

项目根目录运行：

```powershell
# 首次安装：依赖完全隔离在 backend，前端 package / lock 未改动
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt

# 运行可自动迁移的新建本地数据库，监听 127.0.0.1:8000
backend/.venv/Scripts/python.exe backend/scripts/run_dev.py

# 另一终端运行原有前端，已有代理指向 8000
npm.cmd run dev
```

打开 `http://127.0.0.1:5173/evaluation`。前端默认使用评估模块专属的示例演示数据，五个页面可直接查看；示例数据只保存在内存，刷新后重置，不写入后端，也不会生成正式报告。需要接入真实服务时，在启动前设置 `VITE_EVALUATION_MODE=http`，再按下方方式启动后端；真实模式使用此工作区独立的授权凭证，不改变平台其他页面的登录状态。

首次启动只有根据报告初始化的 **26 项指标草稿/待完善定义**，没有虚构任务、运行、结果、样本或报告。需要补齐正类与定义、发布修订并接入真实来源后，才能创建正式验收任务。自动测试有独立夹具，但不会注入此数据库。

## 服务配置

从 `backend/.env.example` 复制到 `backend/.env` 并填写所需值；不提交密钥。配置前缀为 `EVALUATION_`。

| 设置 | 说明 |
| --- | --- |
| DATABASE_URL | SQLite 独立数据库，默认 `sqlite:///./var/evaluation.db`；从 backend 目录解释相对路径 |
| ARTIFACT_DIR | 服务端报告、证据包存储目录，默认 `var/artifacts` |
| ADMIN_TOKEN | 可管理指标、创建/执行任务与申请下载票据的访问凭证 |
| READER_TOKEN | 仅可读取，写操作和下载票据返回 403 |
| UPSTREAM_URL | 已接入来源系统的服务端适配器基础地址；为空则来源明确不可用 |
| UPSTREAM_TOKEN | 来源系统访问凭证，不透传给浏览器 |
| WORKER_ENABLED | 默认 true，服务端持久队列工作线程；自动测试可关闭后精确控制并发场景 |
| TICKET_SECONDS | 下载票据有效期，默认 120 秒 |

当前是**单工作空间、单服务进程的 SQLite 开发部署**，请保持 `workers=1`。静态 Bearer 凭证是独立服务的权限边界，尚未对接平台 SSO/用户目录，不等同于已有演示用户“张三”的登录状态。生产对接时在服务端身份依赖处替换认证，不需要改变其他页面。

单独迁移与标准启动（工作目录 backend）：

```powershell
.venv/Scripts/python.exe -m alembic upgrade head
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

迁移 `0001_evaluation` 只为此独立数据库增加表；禁止指向已有业务数据库直接执行。破坏性 downgrade 被禁用。备份须包含数据库与 artifacts 目录。进程重启后，未结束任务标记为 `failed / worker_interrupted`，用户可创建新 attempt；排队导出继续执行，中断导出重新排队。

## 页面与操作

| 地址 | 作用 |
| --- | --- |
| `/evaluation`、`/evaluation/metrics` | 指标库、筛选、分页、新建草稿、启用/停用 |
| `/evaluation/metrics?metricId=...&revisionId=...` | 详情、编辑草稿、发布、创建新修订、历史修订；也支持 metricCode 精确解析 |
| `/evaluation/tasks` | evaluation 专用任务列表，服务端统计待启动/运行/失败数量 |
| `/evaluation/tasks?view=new` | 选择来源精确版本、阶段、已发布指标；动态材料要求；预检与冻结 |
| `/evaluation/execution?taskId=...` | 服务端进度、事件、允许的启动/取消/重试与历史尝试 |
| `/evaluation/results?runId=...` | 独立验收结论、冻结阈值、百分点差距、逐项证据与失败样本 |
| `/evaluation/records?recordId=...` | 兼容来源记录；区分 not_found、ambiguous、conflict、demo_only |
| `/evaluation/records?runId=...` | 归档、五要素核验、异步报告与证据包 |
| `/evaluation/records?runId=...&evidenceId=...` | 精确来源、分子分母、适用计算明细、SHA-256 |

引用已有结果只读；重新运行由后端创建关联子任务并调用来源适配器。复测创建新计划、新任务；失败重试复用冻结计划生成新任务/运行/attempt，不改旧结果。

污染样本识别率与整体合规提升尚未有正式口径，服务器阻止发布，不允许换成 Recall/Accuracy 绕过。其他草稿也须补齐其所需集合、计数范围、匹配规则等。比例计算先以精确分数比较，再转换展示数值；分母为零不是 0 分，不允许假通过。

原 AppLayout 的全局“原型演示”标记按授权范围保留；评估区单独显示“实时数据”。共享布局只在 CapabilityDock 排除数组加 `/evaluation`，五标签仍由原布局绘制。

## 验证与契约

- [OpenAPI](openapi.json)：实际 FastAPI 生成，运行服务 `/docs` 和 `/openapi.json` 可访问。
- [来源接口契约](upstream-contract.md) 与 [来源 JSON Schema](upstream-source.schema.json)。
- [实施与验证记录](verification.md)：结果、限制与保护基线。

```powershell
# 项目根目录
npm.cmd run build
npm.cmd run lint
npm.cmd test -- tests/evaluation

# backend 工作目录
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/python.exe -m ruff check app tests scripts alembic
.venv/Scripts/python.exe -m mypy app --config-file pyproject.toml
```

来源系统缺席时，生产服务保持 unavailable；用 `backend/tests` 的夹具完成自动化闭环，不代表真实算法、SSO 或原业务后端已经联调。
