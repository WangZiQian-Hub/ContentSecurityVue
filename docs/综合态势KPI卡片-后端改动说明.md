# 综合态势（首页）KPI 卡片接真实数据 —— 后端改动说明

> 面向：后端同学
> 范围：① 首页顶部 6 张 KPI 卡片（正文）；② 首页「最近任务」的"任务类别"列（附录）
> 结论：KPI 部分**只改 `back/app/routers/kpis.py` 一个函数**；另加任务列表补一个字段。前端已按"后端优先、本地兜底"改好。

---

## 一、要改哪里

| 项目 | 内容 |
|---|---|
| 文件 | `back/app/routers/kpis.py` |
| 函数 | `get_kpis()` 里的 `if kind == "dashboard":` 分支（约 114-128 行） |
| 现在 | `DASHBOARD_KPIS` 常量表（约 62-111 行）写死了 6 条，只有第 1 条走了数据库 |
| 改成 | 6 条都按下面的口径从数据库算出来 |
| 返回方式 | 不改，继续用现成的 `success(data=[...], message="首页指标查询成功")`（外层 `code` / `message` / `data` / `trace_id` / `timestamp` 保持不变） |

前端请求的是 `GET /api/v1/kpis?kind=dashboard`（Vite 代理到 `http://127.0.0.1:8000`）。**前端已经全部接好，接口返什么就显示什么。**

---

## 二、6 张卡片分别从哪查

| # | 卡片 | 现在 | 改成查 | 说明 |
|---|---|---|---|---|
| 1 | 数据资源总量（GB） | ✅ 已是真实值 | `datasets` 表 `metadata_json.storage_gb` 求和 | 已有实现 `_resource_storage_gb()`，**保持不动** |
| 2 | 高价值语料数量（万条） | 常量 2318 | `tasks` 表：`capability_code in ('value_score','high_value_detect')` 且 `status='succeeded'` 的任务，把 `result.high_value_count`（缺失时用 `result.high_count`）相加，再 ÷ 10000 | 写法可直接抄同文件 `governance-value` 分支（约 155-174 行） |
| 3 | 风险数据数量（万条） | 常量 86.5 | `tasks` 表：`capability_code in ('data_risk_weight','semantic_risk')` 且成功的任务，把 `result.risk_count` 相加，再 ÷ 10000 | 风险结果里的字段名见 `routers/data_governance.py` 中的 `risk_count` / `high_count` / `valid_count` |
| 4 | 在管模型数量（个） | 常量 42 | `models` 表记数（"在管"的口径你们定，例如 `status='ready'`；如需排除停用/下线就加条件） | `select(func.count()).select_from(Model)` |
| 5 | 累计治理任务（个） | 常量 12680 | `tasks` 表记数（如需排除"数据接入"类，按 `capability_code` 过滤） | 口径要与"累计"一致：算全部历史任务，不限状态 |
| 6 | 测试完成率（%） | 常量 92.3 | `evaluation_tasks`（或 `evaluation_runs`）中成功条数 ÷ 总条数 × 100，保留 1 位小数 | 状态取值与任务一致：`pending` / `running` / `succeeded` / `failed`；分母建议只算已结束的（`succeeded` + `failed`） |

> 暂时算不出来的项（比如 2、3、6 的数据还不够），**先保留原常量即可**；但不要返回空数组，原因见第四节第 1 条。

---

## 三、每条数据必须带的字段

前端的数据契约（`src/types/index.ts` 的 `Kpi`）：

```json
{
  "id": "dashboard-1",
  "label": "数据资源总量",
  "value": 5100.0,
  "unit": "GB",
  "change_rate": 12,
  "icon": "Coin"
}
```

| 字段 | 必填 | 要求 |
|---|---|---|
| `id` | 是 | 唯一且稳定（现在用 `dashboard-1` ~ `dashboard-6`），前端拿它当 key，不要每次请求都变 |
| `label` | 是 | 卡片名字 |
| `value` | 是 | **数字类型**，不要给字符串。千分位由前端处理（5100 显示为 5,100） |
| `unit` | 是 | 单位文字，如 `GB`、`万条`、`个`、`%` |
| `change_rate` | 是 | **必须是数字，不能漏、不能是 null**。正数=涨（红），负数=跌（绿），0=持平（"— 0%"）。这是前端现有规则，后端只要给数 |
| `icon` | 是 | Element Plus 图标名，建议沿用现在的：`Coin`、`Document`、`WarningFilled`、`Box`、`CircleCheckFilled`、`PieChart` |
| `display_value` | 否 | 想直接给显示文本（如 "5.1 TB"）时才传，传了它会盖掉 `value` + `unit` 的显示 |

### 关于 `change_rate`（环比）

- **第一步建议先给 0**（卡片显示"— 0%"），比随便写一个百分比诚实。
- 要真环比就得有"上一期"的数：目前库里没有按天保存的快照表。可选方案：
  1. 新增一张每日快照表，每天定时写一条（数据资源页就是这么设计的：北京时间每天 18:00 存一份）；
  2. 或者查询时按 `created_at` 时间窗口现算本期 / 上期。
  这件事建议单独排期，不阻塞本次"数值变真"。

---

## 四、三个容易踩的坑

1. **不要返回 `data: []`。** 首页在"接口没数据"时会显示占位「暂无指标数据」，KPI 区就空了。某张卡暂时算不出来时，宁可继续用常量或给 `0`。
2. **`value` / `change_rate` 不要给字符串。** 给 `"5100"` 会导致前端显示/比较异常；漏给 `change_rate` 会让那张卡显示「暂无对比数据」（已做保护，但那就失去对比信息了）。
3. **单位换算放在后端。** 卡片写"万条"，接口就给 `value: 2318, unit: "万条"`，不要给 `23180000`。

---

## 五、自测清单

1. 直接请求接口，确认结构正确、values 与库里对得上：
   ```bash
   curl "http://127.0.0.1:8000/api/v1/kpis?kind=dashboard"
   ```
   期望：`code = 0`，`data` 是 6 条数组，每条含上表字段。
2. 前端刷新首页（`Ctrl+Shift+R`），6 张卡片的数字应与库里一致。
3. 把某张卡的 `change_rate` 临时去掉 → 那张卡应显示「暂无对比数据」，**不应出现 NaN**。
4. 把接口临时改成返回 `[]` → 首页应显示「暂无指标数据」占位（而不是整排消失）。

---

## 六、前端已经做好的部分（后端不用管）

千分位格式化、单位拼接、涨跌颜色（涨红跌绿）、缺数据占位文案、缺对比数字时的说明文案，全部由前端处理。后端只要保证**字段齐全、类型正确、口径与库一致**。

---

## 附录：首页「最近任务」的"任务类别"列

### 现象
首页「最近任务」表格的"任务类别"列是空的（任务名称、状态、创建时间都正常）。

### 原因
`GET /api/v1/tasks` 的响应里没有 `task_category` 字段。中文名目前只有前端一份本地兜底字典，而且和 `back/app/domain/capabilities.py` 里的口径不一致。

### 要改哪里
同一个文件 `back/app/routers/tasks.py` 的任务列表接口 `get_tasks()`（约 273-302 行）；建议直接改仓储层，让列表和详情都带上这个字段：`back/app/repositories/task_repository.py` 的 `task_to_dict()`（约 75-131 行）。

```python
from app.domain.capabilities import CAPABILITIES

def _capability_names(capability_code: str) -> dict:
    """能力编码 → 中文名；未登记的能力回落到“其他”。"""
    item = CAPABILITIES.get(capability_code, {})
    return {
        "capability_label": item.get("label", capability_code),
        "task_category": item.get("category", "其他"),
    }
```

然后在返回的字典里合并这两个字段（在 `**process_fields` 旁边加一行 `**_capability_names(task.capability_code)` 即可）。

### 字段约定
| 字段 | 取值 | 说明 |
|---|---|---|
| `task_category` | `CAPABILITIES[capability_code]["category"]` | 首页"任务类别"列直接用它 |
| `capability_label` | `CAPABILITIES[capability_code]["label"]` | 顺带返回，任务详情、导出会用到 |

字典已经在 `back/app/domain/capabilities.py` 里（`label` 是能力中文名，`category` 是类别中文名），不用新建。

### 两个必须注意的点
1. **`data_process` 没登记。** 库里实际出现过的能力编码有 8 个：`value_score`(15 条)、`data_process`(7)、`data_ingest`(6)、`scenario_governance`(4)、`model_risk_governance`(2)、`reasoning_audit`(1)、`evaluation`(1)、`anomaly_detect`(1)。其中 **`data_process` 不在 `capabilities.py` 里**，不补登记的话这 7 条任务会显示"其他"，建议一并补上（参考前端的叫法是"数据处理"）。未登记的能力用 `.get(..., "其他")` 兜底，不要抛异常。
2. **两套中文名现在不一致，以后端 `capabilities.py` 为准。** 前端已改成"后端给了就用后端、没给才用本地兜底"，所以后端补上字段后，页面显示的就是 `capabilities.py` 的口径：

| capability_code | 后端 category | 前端本地兜底 TASK_CATEGORY |
|---|---|---|
| `semantic_risk` | 风险识别 | 风险治理 |
| `data_risk_weight` | 异常数据治理 | 风险治理 |
| `training_monitor` | 全链路合规 | 模型治理 |
| `lineage_audit` | 全链路合规 | 合规审计 |
| `evaluation` | 测试评估 | 模型评估 |

### 自测
```bash
curl "http://127.0.0.1:8000/api/v1/tasks?page=1&page_size=5"
```
期望：每条任务都带 `task_category`（和 `capability_label`）。刷新首页，「最近任务」的"任务类别"列应显示"场景应用""数据处理"等中文。