<script setup lang="ts">
import { ref } from 'vue'
import type { ProcessComparison } from '../../../types/data-governance'
defineProps<{ items: ProcessComparison[]; title?: string }>()
const changedOnly = ref(false)
function changedFields(row: ProcessComparison) {
  return row.fields.filter((field) => field.before !== field.after)
}
</script>
<template>
  <div class="process-comparison-header" :class="{ 'has-title': title }">
    <h3 v-if="title" class="process-comparison-title">{{ title }}</h3>
    <div class="process-comparison-filter">
      <el-checkbox v-model="changedOnly">只看发生变化的字段</el-checkbox>
    </div>
  </div>
  <el-table :data="items" class="process-comparison shared-data-table" empty-text="暂无处理对比样本">
    <el-table-column prop="id" label="样本ID" width="90" show-overflow-tooltip />
    <el-table-column label="原始内容" min-width="220"
      ><template #default="{ row }: { row: ProcessComparison }">
        <div v-if="changedOnly" class="process-sample">
          <div v-for="field in changedFields(row)" :key="field.name">
            <b>{{ field.name }}：</b>{{ field.before || '（缺失）' }}
          </div>
          <span v-if="!changedFields(row).length">无字段变化</span>
        </div>
        <div v-else class="process-sample">{{ row.original }}</div>
      </template></el-table-column
    >
    <el-table-column label="处理结果" min-width="240"
      ><template #default="{ row }: { row: ProcessComparison }">
        <div v-if="changedOnly" class="process-sample">
          <div v-for="field in changedFields(row)" :key="field.name">
            <b>{{ field.name }}：</b>{{ field.after || '（缺失）' }}
          </div>
          <span v-if="!changedFields(row).length">无字段变化</span>
        </div>
        <div v-else class="process-sample">{{ row.processed }}</div>
      </template></el-table-column
    >
    <el-table-column label="处理动作" min-width="120"
      ><template #default="{ row }"
        ><div v-for="action in row.actions" :key="action">{{ action }}</div></template
      ></el-table-column
    >
  </el-table>
</template>
