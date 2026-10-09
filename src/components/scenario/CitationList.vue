<script setup lang="ts">
import type { Citation } from '../../types/scenario'
// sourceId 为 input 表示请求正文，其余对应 materials 的 id。
defineProps<{ items: Citation[] }>()
</script>
<template>
  <ul class="citation-list">
    <li v-for="(citation, index) in items" :key="index">
      <span class="source">{{ citation.sourceId }}</span>
      <span class="quote">{{ citation.quote }}</span>
    </li>
  </ul>
</template>
<style scoped>
.citation-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 8px 0 0;
  border-top: 1px dashed #e6eaf2;
}
.citation-list li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 2px 0;
}
.source {
  flex: none;
  margin-top: 2px;
  padding: 1px 6px;
  border-radius: 4px;
  background: #eef2f9;
  color: #5b7295;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
}
.quote {
  color: #5b6779;
  font-size: 12.5px;
  font-style: italic;
  line-height: 1.65;
}
.quote::before {
  content: '“';
}
.quote::after {
  content: '”';
}
</style>
