<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
const statusElement = ref<HTMLElement>()
import type { Artifact, TraceTask } from '../../../../types/agent-traces'
const props = defineProps<{
  task: TraceTask | null | undefined
  error?: string
  download: (artifact: Artifact) => Promise<unknown>
}>()
const saving = ref(false),
  completed = ref(false),
  localError = ref('')
const displayedProgress = ref(0),
  localProgress = ref(72)
const targetProgress = computed(() =>
  completed.value
    ? 100
    : saving.value
      ? localProgress.value
      : Math.min(70, Math.max(0, (props.task?.progress || 0) * 0.7)),
)
let frame = 0
watch(
  targetProgress,
  (target) => {
    cancelAnimationFrame(frame)
    const start = displayedProgress.value,
      started = performance.now()
    if (target < start) {
      displayedProgress.value = Math.round(target)
      return
    }
    const tick = (now: number) => {
      const fraction = Math.min(1, (now - started) / 240)
      displayedProgress.value = Math.round(start + (target - start) * fraction)
      if (fraction < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
  },
  { immediate: true },
)
onUnmounted(() => {
  cancelAnimationFrame(frame)
  generation++
})
let generation = 0
watch(
  () => `${props.task?.taskId || ''}:${props.task?.status || ''}`,
  async (_, __, cleanup) => {
    const version = ++generation
    cleanup(() => {
      generation++
    })
    completed.value = false
    localError.value = ''
    saving.value = false
    if (props.task?.status !== 'succeeded') return
    const artifacts = props.task.result?.artifacts || []
    if (!artifacts.length) {
      localError.value = '导出未返回文件，请重新导出'
      return
    }
    localProgress.value = 72
    saving.value = true
    try {
      // Download the server artifact frozen at submission; never recapture live DOM.
      await props.download(artifacts[0]!)
      if (version === generation) completed.value = true
    } catch (error) {
      if (version === generation)
        localError.value = error instanceof Error ? error.message : String(error)
    } finally {
      if (version === generation) saving.value = false
    }
  },
  { immediate: true, flush: 'post' },
)
</script>
<template>
  <div ref="statusElement" class="view-export-status" role="status" aria-live="polite">
    <span>{{
      error || localError
        ? '导出失败：' + (error || localError)
        : saving
          ? '正在下载固定快照图片…'
          : completed
            ? '导出成功，已自动发起下载'
            : task?.status === 'failed' || task?.status === 'cancelled'
              ? '导出失败，请重新导出'
              : '正在导出当前视图…'
    }}</span>
    <el-progress
      :percentage="displayedProgress"
      :status="
        error || localError || task?.status === 'failed'
          ? 'exception'
          : completed && displayedProgress === 100
            ? 'success'
            : undefined
      "
    />
  </div>
</template>
<style scoped>
.view-export-status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  padding: 14px;
  margin: 12px 0;
  background: #edf6ff;
  border-radius: 8px;
  color: #526d98;
  font-size: 14px;
}
.view-export-status .el-progress {
  width: 280px;
  max-width: 100%;
}
</style>

<style scoped>
.view-export-status :deep(.el-progress-bar__inner) {
  transition: none;
}
.view-export-status :deep(.el-progress__text) {
  min-width: 48px;
  font-variant-numeric: tabular-nums;
}
</style>
