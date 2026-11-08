<script setup lang="ts">
defineProps<{ label: string }>()
</script>
<template>
  <svg
    class="execution-glyph"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <g v-if="label.includes('网页')">
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18M5 6.5c4 2 10 2 14 0M5 17.5c4-2 10-2 14 0" />
    </g>
    <g v-else-if="label.includes('推理')">
      <path
        d="m12 2 8 6v8l-8 6-8-6V8l8-6Z M12 3v18M8 6v4l-2 2 3 3v3M16 6v4l2 2-3 3v3M9 9l3 3 3-3M9 15l3-3 3 3"
      />
    </g>
    <g v-else-if="label.includes('已拦截')">
      <circle cx="12" cy="12" r="9" />
      <path d="m6 6 12 12" />
    </g>
    <g v-else-if="label.includes('工具')">
      <path d="M20 3a6 6 0 0 0-8 7L3 19a2 2 0 0 0 3 3l9-10a6 6 0 0 0 7-8l-4 4-3-3 5-2Z" />
    </g>
    <g v-else-if="label.includes('返回')">
      <path d="M5 3h9l5 5v13H5V3Zm9 0v6h5M8 12h7M8 15h7M8 18h5" />
    </g>
    <g v-else-if="label.includes('输入')">
      <path d="M20 15a4 4 0 0 1-4 4H9l-5 3v-5a4 4 0 0 1-2-4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" />
    </g>
    <g v-else-if="label.includes('重复')">
      <path d="M20 8a8 8 0 0 0-14-3L3 8M3 3v5h5M4 16a8 8 0 0 0 14 3l3-3M21 21v-5h-5" />
    </g>
    <g v-else-if="label.includes('错误')">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v7m0 4h.01" />
    </g>
    <g v-else-if="label.includes('导出')"><path d="M12 16V2m-5 5 5-5 5 5M3 14v7h18v-7" /></g>
    <g v-else-if="label.includes('拒绝')">
      <path d="m12 2 9 4v6c0 5-5 8-9 10-4-2-9-5-9-10V6l9-4Zm-5 9 4 4 6-7" />
    </g>
    <g v-else-if="label.includes('安全')">
      <rect x="4" y="10" width="16" height="12" rx="2" />
      <path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v3" />
    </g>
    <g v-else-if="label.includes('答复')">
      <circle cx="12" cy="12" r="9" />
      <path d="m7 12 4 4 6-8" />
    </g>
    <g v-else>
      <circle cx="10" cy="10" r="7" />
      <path d="m15 15 6 6" />
    </g>
  </svg>
</template>
<style scoped>
.execution-glyph {
  display: block;
  width: 23px;
  height: 23px;
  flex: none;
  color: inherit;
}
</style>
