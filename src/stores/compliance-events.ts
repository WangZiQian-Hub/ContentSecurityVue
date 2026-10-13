import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../api/compliance-events'
import type {
  ComplianceEvent,
  ComplianceEventOverview,
} from '../types/compliance-event'
import type { PageResult } from '../types'

/** 训练中合规事件监控的状态（GN18-19）。
 * 同时服务于页面监控面板（ComplianceEventMonitor）和页签栏右侧的两个入口按钮。
 */
export const useComplianceEventsStore = defineStore('compliance-events', () => {
  /** 面板概览（汇总 + 最近事件）。 */
  const overview = ref<ComplianceEventOverview | null>(null)
  const loading = ref(false)
  /** “查看全部记录”弹窗。 */
  const dialogOpen = ref(false)
  const page = ref<PageResult<ComplianceEvent> | null>(null)
  const pageLoading = ref(false)
  const currentPage = ref(1)
  /** 定位面板的请求计数（每次点“合规监控”自增，组件 watch 后滚动到面板）。 */
  const focusRequested = ref(0)
  /** 当前上下文的训练任务 ID，分页查询与概览共用。 */
  let contextTaskId: string | undefined

  async function loadOverview(trainingTaskId?: string) {
    contextTaskId = trainingTaskId
    loading.value = true
    try {
      overview.value = await api.getComplianceEventOverview(trainingTaskId)
    } finally {
      loading.value = false
    }
  }

  async function loadPage(pageNo = 1) {
    currentPage.value = pageNo
    pageLoading.value = true
    try {
      page.value = await api.listComplianceEvents(pageNo, 10, contextTaskId)
    } finally {
      pageLoading.value = false
    }
  }

  function openRecordDialog(trainingTaskId?: string) {
    if (trainingTaskId !== undefined && trainingTaskId !== contextTaskId) {
      contextTaskId = trainingTaskId
      void loadOverview(trainingTaskId)
    }
    dialogOpen.value = true
    void loadPage(1)
  }

  function closeRecordDialog() {
    dialogOpen.value = false
  }

  function requestFocus() {
    focusRequested.value += 1
  }

  return {
    overview,
    loading,
    dialogOpen,
    page,
    pageLoading,
    currentPage,
    focusRequested,
    loadOverview,
    loadPage,
    openRecordDialog,
    closeRecordDialog,
    requestFocus,
  }
})
