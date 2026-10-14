# 训练中合规事件监控 —— 后端接口对接文档

> 面向业务后端（FastAPI，默认 `http://<host>:8000`）开发人员。
> 前端为「模型训练页」新增了**合规事件监控**面板，需要后端提供 **2 个 GET 接口**。
> 本文档给出：接口路径、请求参数、响应格式、字段枚举、与前端代码的对应关系、统计口径建议，以及一份可直接参考的 FastAPI 实现。
>
> 前端代码已完成并预留接口；后端未实现期间前端自动回落固定模拟数据，不影响页面演示。后端实现后前端**无需改动**即可切换为真实数据。

---

## 1. 功能与页面位置

- 页面入口：`/model-train/training`（模型训练 → 模型训练子页签）。
- 面板名称：**合规事件监控**，位于训练页右侧，替代原「任务关联」面板。
- 展示内容：
  1. 3 张统计卡：**累计事件数**、**高风险数**、**已处置数**；
  2. 「最近事件记录」表：时间、事件类型、级别、状态（默认展示最近 3 条）；
  3. 「查看全部记录」弹窗：分页展示全部事件，含事件详情列；
  4. 页签栏「事件记录」按钮上的红色角标数字 = 累计事件数。
- 训练任务处于**运行中**（`status=running`）时，前端每 **5 秒**轮询一次概览接口。

---

## 2. 接口总览

| # | 方法 | 路径 | 用途 |
|---|---|---|---|
| 1 | GET | `/api/v1/compliance-events/overview` | 统计概览 + 最近事件（面板主体） |
| 2 | GET | `/api/v1/compliance-events` | 事件分页列表（「全部记录」弹窗） |

两个接口都挂在**业务后端**（与 `/api/v1/tasks`、`/api/v1/training-tasks` 同一服务），不是模型服务 8001。

---

## 3. 通用约定（与现有接口一致，务必遵守）

### 3.1 路径前缀

- 后端路由统一前缀 `/api/v1`（在 `app/main.py` 中 `include_router(..., prefix="/api/v1")`）。
- 前端开发环境通过 Vite 代理把 `/api/v1/*` 转发到 `http://127.0.0.1:8000`，后端无需处理跨域。

### 3.2 统一响应信封

所有响应必须使用项目已有的 `app.core.response.success()` 包装：

```json
{
  "code": 0,
  "message": "success",
  "data": { },
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-10-13T17:32:42.123456+08:00"
}
```

- `code=0` 表示成功；非 0 视为失败。
- 前端**只读取 `data` 字段**的内容，外层信封由 `src/api/request.ts` 的响应拦截器统一解包。
- 错误走现有异常处理（如 FastAPI 的 `HTTPException`）。

### 3.3 字段命名：后端用 snake_case，前端用 camelCase

- 前端发送的查询参数会被请求拦截器自动由驼峰转下划线：
  - `trainingTaskId` → `training_task_id`、`pageSize` → `page_size`。
- 后端响应中的下划线字段会被响应拦截器自动转成驼峰：
  - `high_risk` → `highRisk`、`recent_events` → `recentEvents`、`event_type` → `eventType`。
- 因此**后端返回请使用 snake_case**（与现有 `/training-tasks`、`/tasks` 接口一致）；本文档中给出的 JSON 示例即后端应返回的原始格式。

### 3.4 鉴权与链路头

- 前端请求会自动携带：
  - `Authorization: Bearer <token>`（从 `sessionStorage.accessToken` 取，与现有业务接口一致）；
  - `X-Request-Id`、`X-Trace-Id`（UUID，前端生成）。
- 后端如已有鉴权中间件，这两个接口保持一致即可，无需特殊处理。

### 3.5 时间格式

- 事件时间字段 `time` 必须是 **ISO 8601 字符串**（带时区），例如 `"2026-10-13T17:32:42+08:00"`，与后端 `now_shanghai().isoformat()` 输出一致。
- 前端表格只展示 `时:分:秒`（`toLocaleTimeString()`），但弹窗/详情会保留完整信息。

---

## 4. 接口一：合规事件监控概览

### 4.1 请求

```
GET /api/v1/compliance-events/overview?training_task_id=TR-7d9a4f21
```

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| `training_task_id` | query | string | 否 | 训练任务 ID（对应 `TrainingTask.id`，形如 `TR-xxxxxxxx`）。不传或为空时返回**全部训练任务**的汇总（前端在未选中任务时会这样调用）。 |

### 4.2 响应：`data` 结构

```jsonc
{
  "summary": {
    "total": 3,        // 累计事件数（整数）
    "high_risk": 1,    // 高风险数（整数）
    "handled": 2       // 已处置数（整数）
  },
  "recent_events": [   // 最近事件，按时间倒序，最多 3 条
    { /* ComplianceEvent，结构见 4.4 */ }
  ]
}
```

### 4.3 完整成功响应示例

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "summary": {
      "total": 3,
      "high_risk": 1,
      "handled": 2
    },
    "recent_events": [
      {
        "id": "CE-1001",
        "time": "2026-10-13T17:32:42+08:00",
        "event_type": "敏感样本触发",
        "level": "high",
        "status": "recorded",
        "detail": "训练样本命中敏感词规则，已记录待人工确认"
      },
      {
        "id": "CE-1002",
        "time": "2026-10-13T17:20:41+08:00",
        "event_type": "训练数据越权访问尝试",
        "level": "medium",
        "status": "blocked",
        "detail": "训练进程尝试访问未授权数据分片，已被安全策略拦截"
      },
      {
        "id": "CE-1003",
        "time": "2026-10-13T17:08:34+08:00",
        "event_type": "模型输出异常告警",
        "level": "low",
        "status": "recorded",
        "detail": "模型输出分布异常，已记录观察"
      }
    ]
  },
  "trace_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2026-10-13T17:32:50+08:00"
}
```

### 4.4 事件对象字段（ComplianceEvent）

| 字段（后端 snake_case） | 类型 | 必填 | 前端字段（camelCase） | 说明 |
|---|---|---|---|---|
| `id` | string | 是 | `id` | 事件唯一标识，不透明字符串，前端只展示/透传 |
| `time` | string | 是 | `time` | ISO 8601 时间，见 3.5 |
| `event_type` | string | 是 | `eventType` | 事件类型名称，**直接展示中文文案**（如「敏感样本触发」） |
| `level` | string enum | 是 | `level` | 风险级别，枚举见第 6 节，**传英文枚举值** |
| `status` | string enum | 是 | `status` | 处置状态，枚举见第 6 节，**传英文枚举值** |
| `detail` | string | 否 | `detail` | 事件详情/处置说明，弹窗「详情」列展示；可为空 |

### 4.5 空数据（无事件时）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "summary": { "total": 0, "high_risk": 0, "handled": 0 },
    "recent_events": []
  },
  "trace_id": null,
  "timestamp": "2026-10-13T17:32:50+08:00"
}
```

---

## 5. 接口二：合规事件分页列表

### 5.1 请求

```
GET /api/v1/compliance-events?training_task_id=TR-7d9a4f21&page=1&page_size=10
```

| 参数 | 位置 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|---|
| `training_task_id` | query | string | 否 | 无 | 训练任务 ID；不传则返回全部 |
| `page` | query | int | 否 | `1` | 页码，从 1 开始 |
| `page_size` | query | int | 否 | `10` | 每页条数，建议 1~100 |

### 5.2 响应：`data` 为项目统一分页结构

分页结构与 `/api/v1/tasks`、`/compliance/audits` 完全一致：

```jsonc
{
  "items": [ { /* ComplianceEvent */ } ],
  "total": 3,          // 符合条件的总条数
  "page": 1,           // 当前页
  "page_size": 10,     // 每页条数
  "total_pages": 1     // 总页数（total 为 0 时返回 0）
}
```

### 5.3 完整成功响应示例

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "CE-1001",
        "time": "2026-10-13T17:32:42+08:00",
        "event_type": "敏感样本触发",
        "level": "high",
        "status": "recorded",
        "detail": "训练样本命中敏感词规则，已记录待人工确认"
      },
      {
        "id": "CE-1002",
        "time": "2026-10-13T17:20:41+08:00",
        "event_type": "训练数据越权访问尝试",
        "level": "medium",
        "status": "blocked",
        "detail": "训练进程尝试访问未授权数据分片，已被安全策略拦截"
      },
      {
        "id": "CE-1003",
        "time": "2026-10-13T17:08:34+08:00",
        "event_type": "模型输出异常告警",
        "level": "low",
        "status": "recorded",
        "detail": "模型输出分布异常，已记录观察"
      }
    ],
    "total": 3,
    "page": 1,
    "page_size": 10,
    "total_pages": 1
  },
  "trace_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "timestamp": "2026-10-13T17:33:00+08:00"
}
```

### 5.4 空数据

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "page_size": 10,
    "total_pages": 0
  },
  "trace_id": null,
  "timestamp": "2026-10-13T17:33:00+08:00"
}
```

---

## 6. 枚举值定义（**只允许传英文枚举，不要传中文**）

### 6.1 风险级别 `level`

| 枚举值 | 前端展示文案 | 标签颜色 |
|---|---|---|
| `high` | 高风险 | 红色 |
| `medium` | 中风险 | 橙色 |
| `low` | 低风险 | 蓝色 |
| 未识别值 | 原样显示 | 灰色 |

### 6.2 处置状态 `status`

| 枚举值 | 前端展示文案 | 标签颜色 |
|---|---|---|
| `recorded` | 已记录 | 灰色 |
| `blocked` | 已拦截 | 红色 |
| `handled` | 已处置 | 绿色 |
| `ignored` | 已忽略 | 灰色 |
| 未识别值 | 原样显示 | 灰色 |

> 前端只负责把英文枚举映射成中文标签和颜色，枚举值以外的内容会原样降级展示，不会报错。

---

## 7. 统计卡口径建议

`summary` 三个数值由**后端计算**，前端不做任何加减，原样展示。建议口径如下（可按实际业务调整，但需保证 3 个值之间不矛盾）：

| 字段 | 建议口径 |
|---|---|
| `total` | 该训练任务下的全部合规事件数（不限级别/状态） |
| `high_risk` | **高风险且尚未处置**的事件数：`level=high AND status=recorded`（即仍待人工处理的高风险事件） |
| `handled` | **已闭环**的事件数：`status IN ('blocked','handled','ignored')`，以及低风险记录即自动结案（`level=low AND status=recorded`） |

以上口径与前端当前固定样例（3 / 1 / 2）一致：高风险 1 条待处理（已记录）、中风险 1 条已拦截、低风险 1 条记录即结案。

---

## 8. 与前端代码的对应关系

| 前端文件 | 作用 |
|---|---|
| `src/api/compliance-events.ts` | 接口调用层：`getComplianceEventOverview()`、`listComplianceEvents()`，即本文档两个接口的消费方 |
| `src/types/compliance-event.ts` | 类型定义：`ComplianceEvent`、`ComplianceEventSummary`、`ComplianceEventOverview`，枚举文案映射 |
| `src/mock/compliance-events.ts` | 固定模拟数据（3 条），字段结构与真实接口完全一致 |
| `src/stores/compliance-events.ts` | Pinia store：加载概览/分页、轮询、弹窗状态 |
| `src/views/model-train/ComplianceEventMonitor.vue` | 面板与「全部记录」弹窗 UI |
| `src/api/request.ts` | 统一 axios 实例：baseURL `/api/v1`、信封解包、驼峰↔下划线转换、鉴权头 |

### 8.1 字段映射（wire → 前端）

| 后端返回（snake_case） | 前端类型字段（camelCase） | 展示位置 |
|---|---|---|
| `summary.total` | `summary.total` | 统计卡「累计事件」、事件记录按钮角标 |
| `summary.high_risk` | `summary.highRisk` | 统计卡「高风险」 |
| `summary.handled` | `summary.handled` | 统计卡「已处置」 |
| `recent_events[]` | `recentEvents[]` | 「最近事件记录」表 |
| `items[] / total / page / page_size / total_pages` | 同名驼峰 | 「全部记录」弹窗表格 + 分页器 |
| `event.id` | `id` | 行 key |
| `event.time` | `time` | 时间列（展示时:分:秒） |
| `event.event_type` | `eventType` | 事件类型列 |
| `event.level` | `level` | 级别列（英文枚举→中文标签） |
| `event.status` | `status` | 状态列（英文枚举→中文标签） |
| `event.detail` | `detail` | 弹窗「详情」列 |

### 8.2 Mock 与联调切换机制

前端环境变量 `VITE_USE_MOCK`（见 `.env.local`）：

| 场景 | 前端行为 |
|---|---|
| `VITE_USE_MOCK=true` | 直接使用固定模拟数据，不发起请求 |
| `VITE_USE_MOCK=false` 且接口返回 200 | 展示后端真实数据 |
| `VITE_USE_MOCK=false` 但接口返回 **404** | 判定后端尚未实现，自动回落模拟数据，页面不报错、不空白 |
| `VITE_USE_MOCK=false` 且接口返回 401/500 等其他错误 | 正常提示错误（不回落 mock） |

后端上线时**不需要前端改代码**：只要接口不再返回 404，前端自动切换。

---

## 9. FastAPI 参考实现（可直接参考）

以下代码风格与现有 `app/routers/training_tasks.py`、`app/routers/compliance.py` 保持一致，仅为参考。

### 9.1 新建路由文件 `app/routers/compliance_events.py`

```python
from math import ceil

from fastapi import APIRouter, Query
from sqlalchemy import select, func

from app.core.database import SessionLocal
from app.core.response import success
from app.models.tables import TrainingTask
# 若新建了合规事件表，见 9.2；若暂不落库，可先从内存/日志读取

router = APIRouter()

RECENT_LIMIT = 3


def _event_payload(row) -> dict:
    """事件对象，字段保持 snake_case，与前端契约一致。"""
    return {
        "id": row.id,
        "time": row.created_at.isoformat(),
        "event_type": row.event_type,
        "level": row.level,          # high / medium / low
        "status": row.status,        # recorded / blocked / handled / ignored
        "detail": row.detail,
    }


@router.get("/compliance-events/overview")
def compliance_event_overview(
    training_task_id: str | None = Query(default=None),
):
    """合规事件监控概览：统计卡 + 最近 3 条事件。"""
    with SessionLocal() as db:
        filters = []
        if training_task_id:
            # 任务不存在时返回 404，前端会回落 mock 或空态
            if db.get(TrainingTask, training_task_id) is None:
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail="训练任务不存在")
            filters.append(ComplianceEvent.training_task_id == training_task_id)

        stmt = select(ComplianceEvent).where(*filters)
        total = db.scalar(
            select(func.count()).select_from(ComplianceEvent).where(*filters)
        )
        high_risk = db.scalar(
            select(func.count()).select_from(ComplianceEvent).where(
                *filters,
                ComplianceEvent.level == "high",
                ComplianceEvent.status == "recorded",
            )
        )
        closed_statuses = ["blocked", "handled", "ignored"]
        handled = db.scalar(
            select(func.count()).select_from(ComplianceEvent).where(
                *filters,
                (ComplianceEvent.status.in_(closed_statuses))
                | ((ComplianceEvent.level == "low") & (ComplianceEvent.status == "recorded")),
            )
        )
        recent = db.scalars(
            stmt.order_by(ComplianceEvent.created_at.desc()).limit(RECENT_LIMIT)
        ).all()

        return success(
            data={
                "summary": {
                    "total": total or 0,
                    "high_risk": high_risk or 0,
                    "handled": handled or 0,
                },
                "recent_events": [_event_payload(row) for row in recent],
            },
            message="合规事件概览查询成功",
        )


@router.get("/compliance-events")
def list_compliance_events(
    training_task_id: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
):
    """合规事件分页列表。"""
    with SessionLocal() as db:
        filters = []
        if training_task_id:
            filters.append(ComplianceEvent.training_task_id == training_task_id)

        total = db.scalar(
            select(func.count()).select_from(ComplianceEvent).where(*filters)
        ) or 0
        start = (page - 1) * page_size
        rows = db.scalars(
            select(ComplianceEvent)
            .where(*filters)
            .order_by(ComplianceEvent.created_at.desc())
            .offset(start)
            .limit(page_size)
        ).all()

        return success(
            data={
                "items": [_event_payload(row) for row in rows],
                "total": total,
                "page": page,
                "page_size": page_size,
                "total_pages": ceil(total / page_size) if total else 0,
            },
            message="合规事件列表查询成功",
        )
```

### 9.2 建议的数据表（`app/models/tables.py`）

```python
class ComplianceEvent(Base):
    __tablename__ = "compliance_events"

    id = Column(String(64), primary_key=True)          # 如 CE-xxxx
    training_task_id = Column(String(64), nullable=True, index=True)
    event_type = Column(String(128), nullable=False)   # 中文事件类型
    level = Column(String(16), nullable=False)         # high / medium / low
    status = Column(String(16), nullable=False, default="recorded")
    detail = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=now_shanghai)
```

项目启动时会自动建表（沿用现有 `Base.metadata.create_all` 机制）。事件的**产生**（训练中检测、拦截、记录）属于合规检测链路，不在本次前端需求范围内；在事件落库前，可先返回空结构（前端展示空态），也可按第 4 节样例插入少量演示数据联调。

### 9.3 注册路由（`app/main.py`）

```python
from app.routers import compliance_events

app.include_router(
    compliance_events.router,
    prefix="/api/v1",
    tags=["合规事件监控"],
)
```

---

## 10. 后端自测

启动业务后端后，可用以下命令验证（无需启动前端）：

```bash
# 1. 概览（带任务 ID）
curl "http://127.0.0.1:8000/api/v1/compliance-events/overview?training_task_id=TR-7d9a4f21"

# 2. 概览（不传任务 ID，应返回全部汇总）
curl "http://127.0.0.1:8000/api/v1/compliance-events/overview"

# 3. 分页列表
curl "http://127.0.0.1:8000/api/v1/compliance-events?page=1&page_size=10"

# 4. 任务不存在时，应返回 404（前端会回落 mock）
curl -i "http://127.0.0.1:8000/api/v1/compliance-events/overview?training_task_id=NOT-EXIST"
```

验收要点：

1. 外层是 `{code, message, data, trace_id, timestamp}`，`code=0`；
2. 字段为 snake_case；`time` 是 ISO 字符串；
3. `level`/`status` 只传第 6 节的英文枚举值；
4. 无数据时 `recent_events`/`items` 为空数组，`summary` 为三个 0，`total_pages=0`；
5. 分页参数边界：`page<1`、`page_size>100` 应返回 422；
6. 前端联调：确认 `.env.local` 中 `VITE_USE_MOCK=false`，打开 `/model-train/training`，
   面板展示真实数据（浏览器 Network 中两个请求为 200）即对接成功。

---

## 11. 附：前端当前固定模拟数据（联调前的对照基准）

| 时间 | 事件类型 | 级别 | 状态 | 详情 |
|---|---|---|---|---|
| 最近 | 敏感样本触发 | high（高风险） | recorded（已记录） | 训练样本命中敏感词规则，已记录待人工确认 |
| 次近 | 训练数据越权访问尝试 | medium（中风险） | blocked（已拦截） | 训练进程尝试访问未授权数据分片，已被安全策略拦截 |
| 最早 | 模型输出异常告警 | low（低风险） | recorded（已记录） | 模型输出分布异常，已记录观察 |

统计卡：累计事件 **3**、高风险 **1**、已处置 **2**。
