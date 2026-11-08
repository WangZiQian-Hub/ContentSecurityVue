<script setup lang="ts">
defineProps<{name:string}>()
</script>
<template><svg class="tool-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<g v-if="name==='phone'"><path d="M7 3 4 5c-3 6 9 18 15 15l2-3-5-4-3 3a15 15 0 0 1-5-5l3-3Z"/></g>
<g v-else-if="name==='layers'"><path d="m12 2 10 5-10 5L2 7Zm-10 10 10 5 10-5M2 17l10 5 10-5"/></g>
<g v-else-if="name==='shield'"><path d="m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5Z"/><path d="M12 7v7m0 3h.01"/></g>
<g v-else-if="name==='check'"><circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/></g>
<g v-else-if="name==='error'"><circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="m8 8 8 8m0-8-8 8" stroke="white"/></g>
<g v-else-if="name==='clock'"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l5 2"/></g>
<g v-else-if="name==='agent'"><rect x="4" y="6" width="16" height="13" rx="3"/><path d="M12 2v4M1 10v5m22-5v5M8 22v-3m8 3v-3M8 11h.01m8 0h.01M8 15h8"/></g>
<g v-else-if="name==='web'"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 9h20M6 6h.01m3 0h.01"/></g>
<g v-else-if="name==='data'"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/></g>
<g v-else-if="name==='locate'"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/></g>
<g v-else-if="name==='document'"><path d="M5 2h9l5 5v15H5Zm9 0v6h5M8 12h8M8 16h8"/></g>
<g v-else><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></g>
</svg></template>
<style scoped>.tool-glyph{width:22px;height:22px;flex:none;vertical-align:middle;display:inline-block}</style>
