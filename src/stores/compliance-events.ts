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
  /** 最近一次加载失败的原因（如"接口尚未由后端提供"），面板据此内联提示。 */
  const error = ref<string | null>(null)
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
      error.value = null
    } catch (reason) {
      // 失败时不保留旧概览：过期数据继续显示会被误读为实时监控结果。
      overview.value = null
      error.value = reason instanceof Error ? reason.message : '合规事件加载失败'
    } finally {
      loading.value = false
    }
  }

  async function loadPage(pageNo = 1) {
    currentPage.value = pageNo
    pageLoading.value = true
    try {
      page.value = await api.listComplianceEvents(pageNo, 10, contextTaskId)
      error.value = null
    } catch (reason) {
      page.value = null
      error.value = reason instanceof Error ? reason.message : '合规事件加载失败'
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
    error,
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
