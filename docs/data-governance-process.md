# 数据治理 · 数据处理

## 页面与路由

`/data-governance` 默认显示数据处理，`/data-governance/process` 为同一子页面别名。其他四个页签保留但禁用；直接访问其路径返回主页面，全局搜索也不提供未开放子页入口。

页面沿用资源模块的 API → Pinia → 页面结构，KPI 使用 `kind=governance-process`。页面样式仅覆盖 `.governance-workspace` 和 `process-*`。

## 统计口径

- 处理任务总数：当前授权统计范围内创建的处理任务数，按任务 ID 去重。
- 正在运行：`status=running`，不含排队中的 pending。
- 今日处理量：按业务时区 Asia/Shanghai 的当日处理事件累计条次，重复处理重复计数，跨日任务不能用最终总量重复归入每天。
- 任务成功率：成功数 /（成功数 + 失败数）；无已结束任务时显示 0，不包含排队、运行、取消任务。成功只表示程序执行完成，不代表质量验收。
- 卡片变化率由后端按同口径可比前一周期返回，前端不计算业务统计。

## 预留接口（需要后端实现）

以下全部以 `/api/v1` 为前缀，并使用 `{code,message,data,trace_id,timestamp}` 统一响应；前端 `request` 负责 snake_case/camelCase 转换、鉴权和链路头。新增清洗流程契约是本次前端对接提案，原规范的 20 个 capability 没有独立基础清洗能力；`kind` 是页面/任务类别，不伪装成 `anomaly_detect`。后端需为 `POST /tasks` 注册此平台处理流程，或联调时在 API 文件中适配已确定的编排协议。

| 方法 | 路径                                                | 用途                                                                   |
| ---- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| GET  | `/kpis?kind=governance-process`                     | 四张指标卡，沿用 Kpi[]                                                 |
| GET  | `/data-governance/options?kind=governance-process`  | 已接入且可处理的数据集及可选版本、规则、模板                           |
| POST | `/data-governance/preview`                          | 最多 20 条样本试运行，不修改正式数据、不生成新版本                     |
| POST | `/tasks`                                            | 固定输入版本，创建异步处理任务，返回完整 ProcessTask，初始状态 pending |
| GET  | `/tasks?kind=governance-process&page=1&page_size=3` | 最近任务，按创建时间倒序，标准分页对象                                 |
| GET  | `/tasks/{task_id}?kind=governance-process`          | 当前进度与结果、对比样本、详情留痕                                     |

创建请求示例（预览请求去掉 name，其他字段相同）：

```json
{
  "kind": "governance-process",
  "name": "数据清洗任务",
  "input": {
    "dataset_id": 3,
    "dataset_version_id": "dsv_000003",
    "scope": "all",
    "template_id": "standard",
    "rules": ["normalize_text", "deduplicate", "normalize_encoding", "complete_fields"]
  }
}
```

范围：`all` 全量；`batch` 必须带 `batch_id`；`filtered` 必须带 `filter: {keyword}`（在固定输入版本内按内容关键词筛选）。后端须校验批次/版本/数据集归属与权限。预览另由后端限制样本量，不等同于正式处理范围。

模板提供默认规则及顺序；允许取消规则，执行以提交的 `rules` 有序数组为准。模板之外勾选的规则按 options.rules 顺序追加。后端保存实际规则、算法版本与模板快照，避免模板后续变化影响历史追溯。

## 响应结构

完整前端类型见 `src/types/data-governance.ts`：

- ProcessOptions：`datasets[{id,name,versions[{versionId,label}]}]`、`rules[{code,label,description}]`、`templates[{id,name,rules[]}]`。版本标签可用 v2.3，选择值始终为后端不可变版本 ID。演示数据复用数据资源的 ID，不制造真实历史版本。
- ProcessTask：任务 ID、数据集名称、input 配置快照、规则/模板展示名、输出版本（未生成时 null）、状态、进度、已处理/总条次、估算剩余秒数、步骤状态、对比样本、创建/完成时间和 traceId；失败时含 errorMessage。
- ProcessPreview：`{sampleCount, items: ProcessComparison[]}`。
- ProcessComparison：`{id,original,processed,actions[],fields:[{name,before,after}]}`，id 为原始样本 ID。字段视图只保留 before != after 的字段。字符串空值在此表示原文空内容，不表示资源缺失；原文与结果必须属于同一输入样本。

任务步骤由后端提供，可跳过未选择规则；进度与剩余时间不能由前端伪造。真实 pending/running 任务每 5 秒查询一次，离开页面停止轮询，终态停止查询。仅成功生成输出时填入输出版本 ID；输入版本保持不变。

字段补全只能来自可信元数据、映射表或明确规则，无法确定时保留缺失并记录原因。编码解码失败应提供错误记录，不能静默丢弃。格式处理不承担异常内容修复。

任务、版本及日志由后端真实生成和持久化；一次调用保留输入、时间、接口、版本、输出五要素，任务详情支持定位输入版本 → 规则配置 → 输出版本和 traceId。完整谱系关系由后续谱系页面提供。

## 演示与真实模式

默认模式只读取标有 demo_ 的固定任务快照，不自动增长进度或制造新版本。预览和创建始终请求后端，失败时明确提示，不返回模拟成功。使用 `.env.local` 设置 `VITE_USE_MOCK=false` 并配置 API 地址后，所有读取也走后端。前端本次没有实现数据库、清洗算法或服务端持久化。
