import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
const backend = vi.hoisted(() => ({ isMock: true, request: vi.fn() }))
vi.mock('../api/request', () => backend)
import { useModelWorkbench } from './model-workbench'
import { percent } from '../types/model-workbench'
import * as api from '../api/model-workbench'

describe('模型训推工作流与接口约束', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    backend.isMock = true
    backend.request.mockReset()
  })
  it('训练曲线和检查点一致，训练目标版本不覆盖已发布版本', async () => {
    const store = useModelWorkbench()
    await store.load()
    const task = store.data.training[0]!
    for (const c of task.checkpoints) expect(c.loss).toBe(task.validationLoss[c.epoch])
    expect(task.targetVersion).not.toBe(
      store.data.models.find((m) => m.id === task.modelId)?.version,
    )
    expect(store.data.training.filter((t) => t.status === 'succeeded')).toHaveLength(1)
  })
  it('模型注册、服务登记、连接检查和调用使用同一模型版本', async () => {
    const store = useModelWorkbench()
    await store.load()
    const model = await store.addModel({
      name: '联动验证模型',
      type: '生成式',
      source: 'self',
      version: 'v1.0.0',
      description: '测试',
    })
    const service = await store.addService({
      name: '验证服务',
      modelId: model.id,
      version: model.version,
      type: 'local',
      endpoint: 'http://localhost:8001',
    })
    const input = {
      modelId: model.id,
      serviceId: service.id,
      prompt: '请整理联系人信息',
      temp: 0.7,
      maxLen: 1024,
    }
    await expect(store.invoke(input)).rejects.toThrow('请选择运行中的关联服务')
    await store.checkService(service.id)
    const call = await store.invoke(input)
    expect(call.version).toBe(model.version)
    expect(call.riskLevel).toBe('high')
    expect(call.governedOutput).not.toBe(call.originalOutput)
    expect(store.data.calls[0]!.id).toBe(call.id)
    expect(call.traceId).toMatch(/^demo-/)
    await store.load()
    expect(store.data.models.some((m) => m.id === model.id)).toBe(true)
  })
  it('创建训练任务只登记待启动状态，不伪造训练曲线', async () => {
    const store = useModelWorkbench()
    await store.load()
    const task = await store.addTraining({
      name: '测试任务',
      modelId: 'mdl-1',
      baseVersion: 'v2.1.0',
      datasetId: 'ds-training',
      datasetVersion: 'v1.2.0',
      epochs: 10,
      batchSize: 8,
      learningRate: 0.0002,
      targetVersion: 'v2.3.0',
    })
    expect(task.status).toBe('pending')
    expect(task.loss).toEqual([])
    expect(task.progress).toBe(0)
  })
  it('评估拒绝不匹配的版本，零分母不计算百分比', async () => {
    const store = useModelWorkbench()
    await store.load()
    const original = store.data.assessment!.id
    await expect(
      store.assess({
        modelId: 'mdl-1',
        baseline: 'v2.0.0',
        edited: 'v2.1.0',
        datasetId: 'ds-evaluation',
        datasetVersion: 'v1.0.0',
      }),
    ).rejects.toThrow('尚无演示测试样本')
    expect(store.data.assessment!.id).toBe(original)
    expect(percent(0, 0)).toBe('不适用')
    expect(percent(80, 200)).toBe('40.0%')
    expect(percent(245, 250)).toBe('98.0%')
    await store.editKnowledge('mdl-2', '个人信息披露')
    expect(store.editTasks).toHaveLength(1)
    expect(store.data.assessment).toBeNull()
    expect(store.assessmentStale).toBe(false)
  })
  it('真实调用使用统一能力入口，失败不回退演示结果', async () => {
    const store = useModelWorkbench()
    await store.load()
    backend.isMock = false
    backend.request.mockResolvedValue({
      taskId: 'tsk-real',
      status: 'succeeded',
      createdAt: '2026-09-26T10:00:00+08:00',
      elapsedMs: 300,
      result: {
        originalOutput: '原回答',
        governedOutput: '治理回答',
        riskCheck: { level: 'high' },
      },
    })
    await store.invoke({
      modelId: 'mdl-2',
      serviceId: 'SVC-002',
      prompt: '测试输入',
      temp: 0.3,
      maxLen: 512,
    })
    expect(backend.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/tasks/execute',
        method: 'POST',
        data: expect.objectContaining({
          capabilityCode: 'model_risk_governance',
          input: { modelId: 'mdl-2', prompt: '测试输入', params: { temp: 0.3, maxLen: 512 } },
          config: { serviceId: 'SVC-002', modelVersion: 'v1.5.0' },
        }),
      }),
    )
    const count = store.data.calls.length
    backend.request.mockRejectedValue(new Error('服务不可用'))
    await expect(
      store.invoke({
        modelId: 'mdl-2',
        serviceId: 'SVC-002',
        prompt: '测试',
        temp: 0.7,
        maxLen: 1024,
      }),
    ).rejects.toThrow('服务不可用')
    expect(store.data.calls).toHaveLength(count)
    expect(store.busy).toBe(false)
  })
  it('模型注册遵循已有模型枚举，指标读取遵循统一指标库', async () => {
    backend.isMock = false
    backend.request.mockResolvedValueOnce({
      id: 12,
      name: '新模型',
      modelType: 'generative',
      source: 'open_source',
      version: 'v1.0.0',
      versions: [],
    })
    const model = await api.registerModel({
      name: '新模型',
      type: '生成式',
      source: 'open',
      version: 'v1.0.0',
      description: '',
    })
    expect(model.source).toBe('open')
    expect(model.id).toBe('12')
    expect(backend.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/models',
        data: expect.objectContaining({
          modelType: 'generative',
          source: 'open_source',
          serviceUrl: null,
          status: 'pending',
        }),
      }),
    )
    backend.request
      .mockResolvedValueOnce({
        items: [{ metricCode: 'configured_metric', status: 'enabled' }],
        totalPages: 1,
      })
      .mockResolvedValueOnce({ taskId: 'assessment-task', status: 'pending' })
    await api.executeComparison({
      modelId: '12',
      baseline: 'v1.0.0',
      edited: 'v1.1.0',
      datasetId: '3',
      datasetVersion: 'v1.0.0',
    })
    expect(backend.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        url: '/metrics',
        params: expect.objectContaining({ category: 'model_capability', status: 'enabled' }),
      }),
    )
    expect(backend.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/tasks/execute',
        data: expect.objectContaining({
          capabilityCode: 'evaluation',
          input: expect.objectContaining({ metricCodes: ['configured_metric'] }),
        }),
      }),
    )
  })
  it('真实读取失败显示重试状态，不注入示例模型', async () => {
    backend.isMock = false
    backend.request.mockRejectedValue(new Error('连接失败'))
    const store = useModelWorkbench()
    await store.load()
    expect(store.error).toContain('加载失败')
    expect(store.data.models).toEqual([])
    expect(store.loading).toBe(false)
  })
})
