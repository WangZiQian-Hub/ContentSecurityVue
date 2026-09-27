<script setup lang="ts">
import { inject } from 'vue'
defineProps<{ refs: string[] }>()
const open = inject<(id: string) => void>('complianceEvidence')!
</script>
<template>
  <span v-if="!refs.length" class="compliance-muted">无证据引用</span
  ><el-button
    v-for="(id, index) in refs"
    :key="id"
    type="primary"
    link
    :title="id"
    @click="open(id)"
    >查看{{ refs.length > 1 ? `证据 ${index + 1}` : '源证据' }}</el-button
  >
</template>
