import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/data-governance'
import type { ProcessCreateInput, ProcessOptions, ProcessTask } from '../types/data-governance'
export const useDataGovernanceStore = defineStore('data-governance', () => {
  const options = ref<ProcessOptions>()
  const tasks = ref<ProcessTask[]>([])
  const history = ref<ProcessTask[]>([])
  const currentTask = ref<ProcessTask>()
  const total = ref(0)
  const loading = ref(false)
  const error = ref('')
  let selection = 0
  let historyRequest = 0
  let initialization = 0
  async function loadHistory(page = 1) {
    const requestId = ++historyRequest
    const result = await api.listProcessTasks(page, 10)
    if (requestId !== historyRequest) return
    history.value = result.items
    total.value = result.total
  }
  async function refreshCurrentTask() {
    const taskId = currentTask.value?.taskId
    const requestId = selection
    if (!taskId) return
    const task = await api.getProcessTask(taskId)
    if (requestId !== selection || currentTask.value?.taskId !== taskId) return
    const completedNow =
      task.status === 'succeeded' &&
      currentTask.value.status !== 'succeeded' &&
      !!task.outputVersion
    currentTask.value = task
    tasks.value = tasks.value.map((item) => (item.taskId === taskId ? task : item))
    if (completedNow) {
      const updated = await api.getProcessOptions()
      if (requestId === selection) options.value = updated
    }
  }
  async function loadTasks(page = 1, pageSize = 3) {
    const result = await api.listProcessTasks(page, pageSize)
    tasks.value = result.items
    total.value = result.total
  }
  /** 列表接口返回的是摘要（不含 steps / comparisons / errorMessage），
   *  而「当前处理任务」面板需要完整字段，因此按 id 再取一次详情；
   *  详情请求失败、或返回空值时都退回摘要项，避免因为一次详情请求
   *  把整个工作台判为加载失败或让面板变空。 */
  async function loadPanelTask(summary?: ProcessTask) {
    if (!summary) return undefined
    try {
      return (await api.getProcessTask(summary.taskId)) || summary
    } catch {
      return summary
    }
  }
  async function initialize() {
    const requestId = ++initialization
    loading.value = true
    error.value = ''
    options.value = undefined
    tasks.value = []
    currentTask.value = undefined
    selection++
    try {
      const [config, result] = await Promise.all([api.getProcessOptions(), api.listProcessTasks()])
      if (requestId !== initialization) return
      options.value = config
      tasks.value = result.items
      total.value = result.total
      currentTask.value = await loadPanelTask(tasks.value[0])
    } catch {
      if (requestId === initialization) error.value = '数据处理工作台加载失败，请检查服务后重试。'
    } finally {
      if (requestId === initialization) loading.value = false
    }
  }
  async function selectTask(taskId: string) {
    const requestId = ++selection
    currentTask.value = undefined
    const task = await api.getProcessTask(taskId)
    if (requestId === selection) currentTask.value = task
    return task
  }
  async function createTask(input: ProcessCreateInput) {
    const task = await api.createProcessTask(input)
    selection++
    currentTask.value = task
    if (!tasks.value.some((item) => item.taskId === task.taskId)) total.value++
    tasks.value = [task, ...tasks.value.filter((item) => item.taskId !== task.taskId)].slice(0, 3)
    return task
  }
  return {
    options,
    tasks,
    history,
    loadHistory,
    refreshCurrentTask,
    currentTask,
    total,
    loading,
    error,
    initialize,
    loadTasks,
    selectTask,
    preview: api.previewProcess,
    createTask,
  }
})
