export interface ApiResponse<T> {
  code: number
  message: string
  data: T
  traceId: string
  timestamp: string
}
export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
export type TaskStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
// 任务条目定义
export interface Task {
  taskId: string  //任务ID
  name: string  //任务名称
  taskCategory: string  // 任务类别
  capabilityCode: string  //使用的能力编码
  status: TaskStatus  //任务状态
  createdAt: string  //创建时间
  finishedAt?: string  //完成时间
  traceId?: string  //链路追踪编号
  result?: Record<string, unknown>  //任务结果对象
  elapsedMs?: number  //执行耗时
}
export interface ExecuteTaskReq {
  capabilityCode: string
  name?: string
  taskCategory?: string
  input: Record<string, unknown>
  config?: Record<string, unknown>
  timeoutSeconds?: number
}
export interface ResourceRow {
  id: number
  name: string
  category: string
  version: string
  status: string
  description: string
}
// KPI 卡片的数据契约。后端返回数值，千分位和箭头由前端统一展示。
export interface Kpi {
  id: string
  label: string  //名称
  value: number  //数值
  unit: string  // 单位
  // 相比上一统计周期的变化率；正数上升、负数下降、0 表示持平。
  changeRate: number  //变化率
  icon: string  //图标
}
