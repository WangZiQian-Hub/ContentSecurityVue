import { defineStore } from 'pinia'
import { ref } from 'vue'
import { listTasks, executeTask } from '../api/task'
import { listResources } from '../api/resource'
import { listDatasets } from '../api/dataset'
import { listModels } from '../api/model'
import { listMetrics } from '../api/metric'
import type { ExecuteTaskReq, ResourceRow, Task } from '../types'
export const usePlatformStore = defineStore('platform', () => {
  const tasks = ref<Task[]>([])
  const resources = ref<Record<string, ResourceRow[]>>({})
  const isBusy = ref(false)
  async function fetchTasks() {
    tasks.value = (await listTasks()).items
  }
  async function fetchResources(resource: string) {
    const loaders: Record<string, typeof listDatasets> = {
      datasets: listDatasets,
      models: listModels,
      metrics: listMetrics,
    }
    const loader = loaders[resource]
    resources.value[resource] = (await (loader ? loader() : listResources(resource))).items
  }
  async function runTask(input: ExecuteTaskReq) {
    isBusy.value = true
    try {
      const result = await executeTask(input)
      await fetchTasks()
      return result
    } finally {
      isBusy.value = false
    }
  }
  return { tasks, resources, isBusy, fetchTasks, fetchResources, runTask }
})
