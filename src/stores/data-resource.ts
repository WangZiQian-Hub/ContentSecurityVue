import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/data-resource'
import type {
  DatasetQuery,
  IngestTask,
  ResourceDataset,
  ResourceSummary,
  ResourceView,
  StatisticsQuery,
} from '../types/data-resource'
import type { ExecuteTaskReq } from '../types'
export const useDataResourceStore = defineStore('data-resource', () => {
  const summary = ref<ResourceSummary>()
  const datasets = ref<ResourceDataset[]>([])
  const datasetTotal = ref(0)
  const tasks = ref<IngestTask[]>([])
  const taskTotal = ref(0)
  const loading = ref(false)
  const error = ref('')
  let summaryRequest = 0
  let datasetRequest = 0
  let taskRequest = 0
  async function loadSummary(view: ResourceView, filters: StatisticsQuery = {}) {
    const current = ++summaryRequest
    loading.value = true
    error.value = ''
    summary.value = undefined
    try {
      const data = await api.getSummary(view, filters)
      if (current === summaryRequest) summary.value = data
    } catch {
      if (current === summaryRequest) error.value = '资源统计加载失败，请检查服务后重试。'
    } finally {
      if (current === summaryRequest) loading.value = false
    }
  }
  async function loadDatasets(query: DatasetQuery) {
    const current = ++datasetRequest
    const data = await api.listDatasets(query)
    if (current === datasetRequest) {
      datasets.value = data.items
      datasetTotal.value = data.total
    }
  }
  async function loadTasks(query = { page: 1, pageSize: 10, keyword: '', status: '' }) {
    const current = ++taskRequest
    const data = await api.listIngestTasks(query)
    if (current === taskRequest) {
      tasks.value = data.items
      taskTotal.value = data.total
    }
  }
  const saveDataset = (data: Partial<ResourceDataset>) => api.saveDataset(data)
  const deleteDataset = (id: number) => api.deleteDataset(id)
  const uploadFile = (file: File) => api.uploadResourceFile(file)
  const startIngest = (data: ExecuteTaskReq) => api.startIngest(data)
  return {
    summary,
    datasets,
    datasetTotal,
    tasks,
    taskTotal,
    loading,
    error,
    loadSummary,
    loadDatasets,
    loadTasks,
    saveDataset,
    deleteDataset,
    uploadFile,
    startIngest,
  }
})
