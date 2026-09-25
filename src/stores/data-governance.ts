import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/data-governance'
import type { ProcessInput, ProcessOptions, ProcessTask } from '../types/data-governance'
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
    currentTask.value = task
    tasks.value = tasks.value.map((item) => (item.taskId === taskId ? task : item))
  }
  async function loadTasks(page = 1, pageSize = 3) {
    const result = await api.listProcessTasks(page, pageSize)
    tasks.value = result.items
    total.value = result.total
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
      currentTask.value = tasks.value[0]
    } catch {
      if (requestId === initialization) error.value = '数据处理工作台加载失败，请检查服务后重试。'
    } finally {
      if (requestId === initialization) loading.value = false
    }
  }
  async function selectTask(taskId: string) {
    const requestId = ++selection
    const task = await api.getProcessTask(taskId)
    if (requestId === selection) currentTask.value = task
    return task
  }
  async function createTask(input: ProcessInput) {
    const task = await api.createProcessTask(input)
    selection++
    currentTask.value = task
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
