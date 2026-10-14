/** 训练中合规事件监控接口契约（GN18-19）。
 * 重点锁定 withFallback 的四条分支：Mock 直出、后端成功、404 静默回落、
 * 其他错误提示后抛出；同时防止样例数据的汇总口径与事件明细脱节。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const backend = vi.hoisted(() => ({ isMock: true, request: vi.fn(), error: vi.fn() }))
vi.mock('./request', () => backend)
vi.mock('element-plus', () => ({ ElMessage: { error: backend.error } }))
import { getComplianceEventOverview, listComplianceEvents } from './compliance-events'
import { createComplianceEvents } from '../mock/compliance-events'

/** 构造一个 axios 风格的失败响应，供 isAxiosError 识别。 */
function axiosError(status: number, message: string) {
  return Object.assign(new Error(message), {
    isAxiosError: true,
    response: { status, data: { message } },
  })
}

/** 后端已闭环的状态：拦截、人工处置、确认误报。 */
const closedStatuses = ['blocked', 'handled', 'ignored']

beforeEach(() => {
  backend.isMock = true
  backend.request.mockReset()
  backend.error.mockReset()
})

describe('合规事件监控：Mock 直出与样例自洽', () => {
  it('Mock 模式不发请求，概览按固定样例返回', async () => {
    const overview = await getComplianceEventOverview('task-1')
    expect(backend.request).not.toHaveBeenCalled()
    expect(overview.summary).toEqual({ total: 3, highRisk: 1, handled: 2 })
    expect(overview.recentEvents).toHaveLength(3)
  })

  it('Mock 汇总口径与事件明细同源，避免样例与字段脱节', async () => {
    const events = createComplianceEvents()
    const { summary, recentEvents } = await getComplianceEventOverview()
    expect(summary.total).toBe(events.length)
    expect(summary.highRisk).toBe(
      events.filter((e) => e.level === 'high' && e.status === 'recorded').length,
    )
    expect(summary.handled).toBe(
      events.filter(
        (e) => closedStatuses.includes(e.status) || (e.level === 'low' && e.status === 'recorded'),
      ).length,
    )
    expect(recentEvents.every((e) => events.some((x) => x.id === e.id))).toBe(true)
    expect(summary.highRisk).toBeLessThanOrEqual(summary.total)
    expect(summary.handled).toBeLessThanOrEqual(summary.total)
  })

  it('Mock 分页按窗口切片且总数守恒，越界页返回空而非报错', async () => {
    const ids = createComplianceEvents().map((e) => e.id)
    const first = await listComplianceEvents(1, 2)
    const second = await listComplianceEvents(2, 2)
    const overflow = await listComplianceEvents(3, 2)
    expect(first.items).toHaveLength(2)
    expect(second.items).toHaveLength(1)
    expect([...first.items, ...second.items].map((e) => e.id)).toEqual(ids)
    expect(first.total).toBe(ids.length)
    expect(first.totalPages).toBe(2)
    expect(overflow.items).toEqual([])
    expect(overflow.total).toBe(ids.length)
    expect(backend.request).not.toHaveBeenCalled()
  })
})

describe('合规事件监控：后端契约与降级策略', () => {
  it('概览按契约取数，trainingTaskId 只在实际存在时下发', async () => {
    backend.isMock = false
    const overview = { summary: { total: 7, highRisk: 2, handled: 4 }, recentEvents: [] }
    backend.request.mockResolvedValue(overview)
    expect(await getComplianceEventOverview('task/1')).toEqual(overview)
    expect(backend.request).toHaveBeenLastCalledWith({
      url: '/compliance-events/overview',
      params: { trainingTaskId: 'task/1' },
      silent: true,
    })
    await getComplianceEventOverview()
    expect(backend.request).toHaveBeenLastCalledWith({
      url: '/compliance-events/overview',
      params: {},
      silent: true,
    })
  })

  it('分页请求携带窗口参数并原样返回后端分页结构', async () => {
    backend.isMock = false
    const page = { items: [], total: 0, page: 3, pageSize: 10, totalPages: 0 }
    backend.request.mockResolvedValue(page)
    expect(await listComplianceEvents(3, 10, 'task-1')).toEqual(page)
    expect(backend.request).toHaveBeenLastCalledWith({
      url: '/compliance-events',
      params: { page: 3, pageSize: 10, trainingTaskId: 'task-1' },
      silent: true,
    })
    await listComplianceEvents(1, 10)
    expect(backend.request).toHaveBeenLastCalledWith({
      url: '/compliance-events',
      params: { page: 1, pageSize: 10 },
      silent: true,
    })
  })

  it('后端 404 时静默回落样例，不弹提示也不中断页面', async () => {
    backend.isMock = false
    backend.request.mockRejectedValueOnce(axiosError(404, 'Not Found'))
    expect((await getComplianceEventOverview('task-1')).summary.total).toBe(3)
    backend.request.mockRejectedValueOnce(axiosError(404, 'Not Found'))
    expect((await listComplianceEvents(1, 10)).total).toBe(3)
    expect(backend.error).not.toHaveBeenCalled()
  })

  it('500 与网络异常提示后继续抛出，不伪装成样例数据', async () => {
    backend.isMock = false
    backend.request.mockRejectedValueOnce(axiosError(500, '训练任务不可用'))
    await expect(getComplianceEventOverview('task-1')).rejects.toThrow('训练任务不可用')
    expect(backend.error).toHaveBeenCalledWith('训练任务不可用')
    backend.request.mockRejectedValueOnce('boom')
    await expect(listComplianceEvents(1, 10)).rejects.toBe('boom')
    expect(backend.error).toHaveBeenLastCalledWith('网络异常')
  })
})
