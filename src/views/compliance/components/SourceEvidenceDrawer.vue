<script setup lang="ts">
import { computed, ref } from 'vue'
import { useComplianceStore } from '../../../stores/compliance'
import StateBadge from './StateBadge.vue'
import { formatTime } from '../presentation'
const props = defineProps<{ modelValue: boolean; evidenceId: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const store = useComplianceStore(),
  copied = ref('')
function closed() {
  store.closeEvidence()
  copied.value = ''
}
const sources: Record<string, string> = {
  'model-training': '/model-train/training',
  'model-invoke': '/model-train/invoke',
  'model-management': '/model-train/management',
  'data-resource': '/data-resource/datasets',
  'data-governance': '/data-governance/process',
  scenario: '/scenario',
  evaluation: '/evaluation',
}
const target = computed(() => {
  const evidence = store.evidence
  if (!evidence) return null
  const path = sources[evidence.sourceModule]
  return path
    ? {
        path,
        query:
          evidence.sourceModule === 'model-management'
            ? { modelId: String(evidence.subjectRef.entityId) }
            : {},
      }
    : null
})
async function copy() {
  try {
    await navigator.clipboard.writeText(String(store.evidence?.subjectRef.entityId))
    copied.value = '已复制完整 ID'
  } catch {
    copied.value = '复制失败，请选中下方完整 ID 手动复制'
  }
}
</script>
<template>
  <el-drawer
    :model-value="modelValue"
    title="源证据详情"
    size="min(620px, 95vw)"
    @update:model-value="emit('update:modelValue', $event)"
    @closed="closed"
  >
    <div v-loading="store.evidenceLoading" class="compliance-evidence">
      <el-alert
        v-if="store.evidenceError"
        :title="store.evidenceError"
        type="error"
        :closable="false"
      /><el-button v-if="store.evidenceError" @click="store.openEvidence(props.evidenceId)"
        >重试</el-button
      >
      <template v-if="store.evidence"
        ><el-tag>只读来源证据</el-tag>
        <h2>
          {{ store.evidence.subjectRef.displayId }} /
          {{ store.evidence.subjectRef.versionId || '未记录版本' }}
        </h2>
        <dl>
          <dt>完整对象 ID</dt>
          <dd>{{ store.evidence.subjectRef.entityId }}</dd>
          <dt>证据编号</dt>
          <dd>{{ store.evidence.id }}</dd>
          <dt>记录时间</dt>
          <dd>{{ formatTime(store.evidence.occurredAt) }}</dd>
          <dt>原始 Trace</dt>
          <dd>{{ store.evidence.sourceTraceId || '未记录' }}</dd>
          <dt>版本引用</dt>
          <dd>{{ store.evidence.versionRef || '缺失' }}</dd>
          <dt>完整性</dt>
          <dd><StateBadge :state="store.evidence.integrityState" /></dd>
        </dl>
        <el-alert
          v-if="store.evidence.integrityState !== 'verified'"
          title="原始证据尚未完整，后续补证应追加记录。"
          type="warning"
          :closable="false"
        />
        <h3>字段核验 · 仅展示已授权字段</h3>
        <el-table :data="store.evidence.redactedFields"
          ><el-table-column prop="label" label="字段" /><el-table-column label="记录值"
            ><template #default="{ row }">{{ row.value ?? '缺失' }}</template></el-table-column
          ><el-table-column label="核验"
            ><template #default="{ row }"
              ><StateBadge :state="row.state" /></template></el-table-column
        ></el-table>
        <p>原页面未提供按 ID 定位时，请在此查看精确记录；打开来源模块不会自动定位该记录。</p>
        <div class="compliance-actions">
          <el-button :disabled="!store.evidence.allowedActions.includes('copy')" @click="copy"
            >复制完整 ID</el-button
          ><router-link
            v-if="target && store.evidence.allowedActions.includes('open_source')"
            :to="target"
            @click="emit('update:modelValue', false)"
            >打开来源模块</router-link
          >
        </div>
        <p aria-live="polite">{{ copied }}</p>
      </template>
    </div></el-drawer
  >
</template>
<style scoped>
.compliance-evidence {
  min-height: 180px;
  color: #345477;
}
.compliance-evidence h2 {
  margin: 24px 0;
  color: #15396c;
}
.compliance-evidence dl {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 20px;
  border-block: 1px solid #e3edf9;
  padding: 24px 0;
}
.compliance-evidence dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.compliance-evidence p {
  line-height: 1.8;
  color: #7085a4;
}
.compliance-actions {
  display: flex;
  gap: 20px;
  align-items: center;
}
</style>
