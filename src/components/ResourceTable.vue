<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { usePlatformStore } from '../stores/platform'
import type { ResourceRow } from '../types'
const props = defineProps<{ resource: string; searchable?: boolean }>()
const store = usePlatformStore()
const keyword = ref('')
const selected = ref<ResourceRow>()
const isOpen = ref(false)
function showResource(row: ResourceRow) {
  selected.value = row
  isOpen.value = true
}
const error = ref(false)
watch(
  () => props.resource,
  async (resource) => {
    error.value = false
    try {
      await store.fetchResources(resource)
    } catch {
      error.value = true
    }
  },
  { immediate: true },
)
const rows = computed(() =>
  (store.resources[props.resource] || []).filter((row) => row.name.includes(keyword.value)),
)
</script>
<template>
  <el-input
    v-if="searchable"
    v-model="keyword"
    class="table-search"
    placeholder="搜索名称…"
    clearable
  /><el-alert
    v-if="error"
    title="数据加载失败，请检查后端连接后重新进入页面"
    type="error"
    :closable="false"
  /><el-table v-else :data="rows" stripe size="small"
    ><el-table-column prop="name" label="名称" min-width="150" /><el-table-column
      prop="category"
      label="类别"
      width="100"
    /><el-table-column prop="version" label="版本" width="85" /><el-table-column
      label="状态"
      width="90"
      ><template #default="{ row }"
        ><span :class="`status-${row.status}`"
          >● {{ row.status === 'pending' ? '待处理' : '正常' }}</span
        ></template
      ></el-table-column
    ><el-table-column label="操作" width="65"
      ><template #default="{ row }"
        ><el-button link type="primary" @click="showResource(row)">查看</el-button></template
      ></el-table-column
    ></el-table
  ><el-dialog v-model="isOpen" title="记录详情" width="520px"
    ><el-descriptions v-if="selected" :column="1" border
      ><el-descriptions-item label="名称">{{ selected.name }}</el-descriptions-item
      ><el-descriptions-item label="版本">{{ selected.version }}</el-descriptions-item
      ><el-descriptions-item label="说明">{{
        selected.description
      }}</el-descriptions-item></el-descriptions
    ></el-dialog
  >
</template>
