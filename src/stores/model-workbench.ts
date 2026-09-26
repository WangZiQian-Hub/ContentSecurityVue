import { defineStore } from 'pinia'
import { ref } from 'vue'
import { isMock } from '../api/request'
import * as api from '../api/model-workbench'
import { createModelDemo } from '../mock/model-workbench'
import type {
  ModelWorkbench,
  ModelAsset,
  TrainingTask,
  ModelService,
  ModelCall,
} from '../types/model-workbench'
const empty = (): ModelWorkbench => ({
  models: [],
  training: [],
  services: [],
  calls: [],
  assessment: null,
  datasets: [],
  changes: [],
})
export const useModelWorkbench = defineStore('model-workbench', () => {
  const data = ref<ModelWorkbench>(empty())
  const loading = ref(false)
  const busy = ref(false)
  const error = ref('')
  const loaded = ref(false)
  const editTasks = ref<{ id: string; modelId: string; knowledge: string; status: string }[]>([])
  async function load() {
    loading.value = true
    error.value = ''
    try {
      data.value = isMock
        ? loaded.value
          ? data.value
          : createModelDemo()
        : await api.getModelWorkbench()
      loaded.value = true
    } catch {
      error.value = '模型数据加载失败，请检查服务连接后重试。'
    } finally {
      loading.value = false
    }
  }
  async function run<T>(action: () => Promise<T>): Promise<T> {
    if (busy.value) throw new Error('请等待当前操作完成')
    busy.value = true
    try {
      return await action()
    } finally {
      busy.value = false
    }
  }
  async function addModel(
    input: Pick<ModelAsset, 'name' | 'type' | 'source' | 'version' | 'description'>,
  ) {
    return run(async () => {
      const now = new Date().toISOString()
      const model: ModelAsset = isMock
        ? {
            ...input,
            id: `mdl-${crypto.randomUUID()}`,
            creator: '当前用户（演示）',
            updatedAt: now,
            dataset: null,
            versions: [
              { version: input.version, createdAt: now, description: '注册模型', taskId: null },
            ],
          }
        : await api.registerModel(input)
      data.value.models.unshift(model)
      return model
    })
  }
  async function addTraining(
    input: Pick<
      TrainingTask,
      | 'name'
      | 'modelId'
      | 'baseVersion'
      | 'datasetId'
      | 'datasetVersion'
      | 'epochs'
      | 'learningRate'
      | 'batchSize'
      | 'targetVersion'
    >,
  ) {
    return run(async () => {
      const task: TrainingTask = isMock
        ? {
            ...input,
            id: `TR-${crypto.randomUUID().slice(0, 8)}`,
            description: '新建训练任务',
            status: 'pending',
            progress: 0,
            epoch: 0,
            elapsed: '尚未开始',
            updatedAt: new Date().toISOString(),
            loss: [],
            validationLoss: [],
            checkpoints: [],
          }
        : await api.createTraining(input)
      data.value.training.unshift(task)
      return task
    })
  }
  async function addService(
    input: Pick<ModelService, 'name' | 'modelId' | 'version' | 'type' | 'endpoint'>,
  ) {
    return run(async () => {
      const service: ModelService = isMock
        ? {
            ...input,
            id: `SVC-${crypto.randomUUID().slice(0, 8)}`,
            status: 'deployed',
            checkedAt: null,
            latencyMs: null,
            healthy: null,
          }
        : await api.registerModelService(input)
      data.value.services.unshift(service)
      data.value.changes.unshift({
        id: crypto.randomUUID(),
        serviceName: service.name,
        description: `登记服务，绑定 ${service.version}`,
        createdAt: new Date().toISOString(),
      })
      return service
    })
  }
  async function checkService(id: string) {
    return run(async () => {
      const service = data.value.services.find((s) => s.id === id)!
      const checked = isMock
        ? {
            ...service,
            checkedAt: new Date().toISOString(),
            healthy: true,
            latencyMs: 320,
            status: 'running' as const,
          }
        : await api.checkModelService(id)
      Object.assign(service, checked)
    })
  }
  async function invoke(input: {
    modelId: string
    serviceId: string
    prompt: string
    temp: number
    maxLen: number
  }) {
    return run(async () => {
      const service = data.value.services.find(
        (s) => s.id === input.serviceId && s.modelId === input.modelId && s.status === 'running',
      )
      if (!service) throw new Error('请选择运行中的关联服务')
      let call: ModelCall
      if (isMock) {
        const sensitive = /联系|手机|姓名|住址|隐私/.test(input.prompt)
        call = {
          id: `CALL-${crypto.randomUUID().slice(0, 8)}`,
          modelId: input.modelId,
          serviceId: service.id,
          version: service.version,
          prompt: input.prompt,
          originalOutput: sensitive
            ? '联系人信息：[姓名已遮蔽]，电话：[号码已遮蔽]。'
            : '已收到内容，演示回答不代表真实模型生成结果。',
          governedOutput: sensitive
            ? '公开版本已移除个人身份与联系方式，仅保留非敏感事项。发布前请确认授权范围。'
            : '当前演示样本无需干预。',
          reason: sensitive
            ? '检测到个人信息相关内容，公开前需要脱敏。'
            : '当前演示规则未发现个人信息风险。',
          riskLevel: sensitive ? 'high' : 'low',
          reconstruction: sensitive ? '移除个人身份与联系方式后整理公开记录。' : null,
          elapsedMs: 1200,
          createdAt: new Date().toISOString(),
          status: 'succeeded',
          traceId: `demo-${crypto.randomUUID()}`,
        }
      } else {
        const task = await api.executeModelTask({
          capabilityCode: 'model_risk_governance',
          name: '模型安全治理调用',
          input: {
            modelId: input.modelId,
            prompt: input.prompt,
            params: { temp: input.temp, maxLen: input.maxLen },
          },
          config: { serviceId: service.id, modelVersion: service.version },
        })
        if (task.status !== 'succeeded') throw new Error('调用尚未成功，请在任务中心查看状态')
        const result = task.result || {}
        if (typeof result.originalOutput !== 'string' || typeof result.governedOutput !== 'string')
          throw new Error('调用结果缺少治理前后输出')
        const risk = result.riskCheck as { level?: string; reason?: string } | undefined
        call = {
          id: task.taskId,
          modelId: input.modelId,
          serviceId: service.id,
          version: service.version,
          prompt: input.prompt,
          originalOutput: result.originalOutput,
          governedOutput: result.governedOutput,
          riskLevel: risk?.level || 'unknown',
          reason: risk?.reason || '服务未返回判定依据',
          reconstruction: typeof result.reconstruction === 'string' ? result.reconstruction : null,
          elapsedMs: task.elapsedMs || 0,
          createdAt: task.createdAt,
          status: task.status,
          traceId: task.traceId || null,
        }
      }
      data.value.calls.unshift(call)
      return call
    })
  }
  async function editKnowledge(modelId: string, targetKnowledge: string, modelVersion?: string) {
    return run(async () => {
      if (isMock) {
        const id = `KE-${crypto.randomUUID().slice(0, 8)}`
        editTasks.value.unshift({
          id,
          modelId,
          knowledge: targetKnowledge,
          status: '待执行（演示）',
        })
        return `编辑任务已登记：${id}`
      }
      const task = await api.executeModelTask({
        capabilityCode: 'knowledge_edit',
        name: '风险知识编辑',
        input: { modelId, targetKnowledge, editType: 'suppress' },
        config: {
          modelVersion: modelVersion || data.value.models.find((m) => m.id === modelId)?.version,
        },
      })
      editTasks.value.unshift({
        id: task.taskId,
        modelId,
        knowledge: targetKnowledge,
        status:
          task.status === 'succeeded' ? '已完成' : task.status === 'failed' ? '失败' : '执行中',
      })
      return `编辑任务已提交：${task.taskId}`
    })
  }
  async function assess(input: {
    modelId: string
    baseline: string
    edited: string
    datasetId: string
    datasetVersion: string
  }) {
    return run(async () => {
      if (isMock) {
        const example = createModelDemo().assessment!
        if (
          input.modelId !== example.modelId ||
          input.baseline !== example.baseline ||
          input.edited !== example.edited ||
          input.datasetId !== example.datasetId ||
          input.datasetVersion !== example.datasetVersion
        )
          throw new Error(
            '此组合尚无演示测试样本，请选择安全对话模型 v1.5.0 与 v1.5.1，或接入真实评估服务',
          )
        data.value.assessment = { ...example, id: `T-${crypto.randomUUID().slice(0, 8)}` }
        return '示例评估已完成'
      }
      // 指标编码由公共指标库返回，避免前端自行定义正式指标。
      const task = await api.executeComparison(input)
      if (task.status === 'succeeded') await load()
      return `评估任务已提交：${task.taskId}`
    })
  }
  return {
    data,
    loading,
    busy,
    error,
    loaded,
    editTasks,
    load,
    addModel,
    addTraining,
    addService,
    checkService,
    invoke,
    editKnowledge,
    assess,
  }
})
