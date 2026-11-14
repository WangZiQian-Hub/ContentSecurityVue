<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { tracePagePng } from '../../../../utils/agent-trace-export'

const busy = ref(false),
  progress = ref(0),
  message = ref(''),
  failed = ref(false)
let alive = true
onUnmounted(() => {
  alive = false
})

async function exportView(root: HTMLElement, label: string) {
  if (busy.value) return
  busy.value = true
  failed.value = false
  progress.value = 0
  message.value = '正在生成页面快照…'
  const filename = `${label}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
  try {
    // tracePagePng freezes the DOM before its first await. Subsequent changes
    // to the selected sample/tab cannot change the exported picture.
    const blob = await tracePagePng(root, (value) => {
      if (alive) progress.value = value
    })
    if (!alive) return
    const url = URL.createObjectURL(blob)
    try {
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    progress.value = 100
    message.value = '页面快照已生成，已自动发起下载'
  } catch (error) {
    if (alive) {
      failed.value = true
      message.value = `页面快照导出失败：${error instanceof Error ? error.message : String(error)}`
    }
  } finally {
    if (alive) busy.value = false
  }
}
defineExpose({ busy, exportView })
</script>

<template>
  <div v-if="message" class="page-snapshot-status" role="status" aria-live="polite">
    <span>{{ message }}</span>
    <el-progress
      :percentage="progress"
      :status="failed ? 'exception' : busy ? undefined : 'success'"
    />
  </div>
</template>

<style scoped>
.page-snapshot-status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  padding: 14px;
  margin: 12px 0;
  background: #edf6ff;
  border-radius: 8px;
  color: #526d98;
}
.el-progress {
  width: 280px;
  max-width: 100%;
}
</style>
