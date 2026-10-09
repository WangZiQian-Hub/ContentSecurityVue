<script setup lang="ts">
import { riskLabels, type RiskLevel } from '../../types/scenario'
// 场景风险等级为小写四档；与风险治理的大写等级不是同一套，这里不共用映射。
defineProps<{ level: RiskLevel }>()
</script>
<template>
  <span class="risk-badge" :class="level">
    <small>风险等级</small>
    <b>{{ riskLabels[level] || '未知' }}</b>
  </span>
</template>
<style scoped>
.risk-badge {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 88px;
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid #dde2ea;
  background: #f2f4f8;
  color: #98a2b3;
}
.risk-badge small {
  font-size: 11px;
  font-weight: 400;
  opacity: 0.85;
}
.risk-badge b {
  font-size: 15px;
}
.risk-badge.low {
  background: #e8f8f1;
  border-color: #b7e6d3;
  color: #00a870;
}
.risk-badge.medium {
  background: #fef3e8;
  border-color: #f8d9bb;
  color: #ed7b2f;
}
.risk-badge.high {
  background: #fdecee;
  border-color: #f8c9ce;
  color: #e34d59;
}
</style>
