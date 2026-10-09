<script setup lang="ts">
import CitationList from './CitationList.vue'
import ResultCard from './ResultCard.vue'
import type { Claim } from '../../types/scenario'
/* 论断列表：issues / controversies / focal_points 等八处共用。
   文档第 135 行强调 evidence 至少一条，且是对象数组而不是字符串数组。 */
defineProps<{ items: Claim[] }>()
</script>
<template>
  <div v-if="items?.length" class="claim-list">
    <ResultCard v-for="(claim, index) in items" :key="index">
      <p class="text">{{ claim.text }}</p>
      <CitationList v-if="claim.evidence?.length" :items="claim.evidence" />
    </ResultCard>
  </div>
  <p v-else class="empty">无</p>
</template>
<style scoped>
.claim-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.text {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.65;
  color: #22314a;
}
.empty {
  margin: 0;
  font-size: 13px;
  color: #96a1b3;
}
</style>
