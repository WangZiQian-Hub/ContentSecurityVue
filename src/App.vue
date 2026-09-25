<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AppLayout from './layouts/AppLayout.vue'

const DESIGN_WIDTH = 1900

const viewportWidth = ref(DESIGN_WIDTH)
const viewportHeight = ref(1080)
const userScale = ref(1)

// 自动适配与用户主动缩放分开，避免窗口适配抵消 Ctrl +/-。
const pageScale = computed(() => (viewportWidth.value / DESIGN_WIDTH) * userScale.value)
const stageStyle = computed(() => ({
  width: `${DESIGN_WIDTH * pageScale.value}px`,
  height: `${viewportHeight.value}px`,
}))

const canvasStyle = computed<Record<string, string | number>>(() => {
  const scale = pageScale.value

  return {
    width: `${DESIGN_WIDTH}px`,
    height: `${viewportHeight.value / scale}px`,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    '--app-design-width': `${DESIGN_WIDTH}px`,
    '--app-design-height': `${viewportHeight.value / scale}px`,
    '--app-canvas-left': '0px',
  }
})

function syncViewport() {
  viewportWidth.value = document.documentElement.clientWidth
  viewportHeight.value = document.documentElement.clientHeight
}

function changeScale(delta: number) {
  userScale.value = Math.max(0.5, Math.min(2, Math.round((userScale.value + delta) * 10) / 10))
}

function handleKeydown(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return
  if (!['+', '=', '-', '0'].includes(event.key)) return
  event.preventDefault()
  if (event.key === '0') userScale.value = 1
  else changeScale(event.key === '-' ? -0.1 : 0.1)
}

function handleWheel(event: WheelEvent) {
  if (!event.ctrlKey || event.deltaY === 0) return
  event.preventDefault()
  changeScale(event.deltaY < 0 ? 0.1 : -0.1)
}

onMounted(() => {
  syncViewport()
  window.addEventListener('resize', syncViewport, { passive: true })
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('wheel', handleWheel, { passive: false })
})

onUnmounted(() => {
  window.removeEventListener('resize', syncViewport)
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('wheel', handleWheel)
})
</script>

<template>
  <div class="design-viewport">
    <div class="design-stage" :style="stageStyle">
      <div class="design-canvas desktop-design-canvas" :style="canvasStyle">
        <AppLayout />
      </div>
    </div>
  </div>
</template>
