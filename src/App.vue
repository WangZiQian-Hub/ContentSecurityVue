<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AppLayout from './layouts/AppLayout.vue'

const DESIGN_WIDTH = 1900

const viewportWidth = ref(DESIGN_WIDTH)
const viewportHeight = ref(1080)

const pageScale = computed(() => viewportWidth.value / DESIGN_WIDTH)

const canvasStyle = computed<Record<string, string | number>>(() => {
  const scale = pageScale.value

  return {
    width: `${DESIGN_WIDTH}px`,
    minHeight: `${viewportHeight.value / scale}px`,
    zoom: scale,
    '--app-design-width': `${DESIGN_WIDTH}px`,
    '--app-design-height': `${viewportHeight.value / scale}px`,
    '--app-canvas-left': '0px',
  }
})

function syncViewport() {
  viewportWidth.value = document.documentElement.clientWidth
  viewportHeight.value = document.documentElement.clientHeight
}

onMounted(() => {
  syncViewport()
  window.addEventListener('resize', syncViewport, { passive: true })
})

onUnmounted(() => window.removeEventListener('resize', syncViewport))
</script>

<template>
  <div class="design-viewport">
    <div class="design-canvas desktop-design-canvas" :style="canvasStyle">
      <AppLayout />
    </div>
  </div>
</template>
