<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useComplianceStore } from '../../../stores/compliance'
const props = defineProps<{ modelValue: boolean; action: 'claim' | 'evidence' | 'resolve' }>(),
  emit = defineEmits<{ 'update:modelValue': [value: boolean] }>(),
  store = useComplianceStore()
const evidenceRefs = ref<string[]>([]),
  reason = ref(''),
  requestId = ref('')
watch(
  () => props.modelValue,
  () => {
    evidenceRefs.value = []
    reason.value = ''
    requestId.value = crypto.randomUUID()
  },
)
const title = computed(
  () => ({ claim: '认领事件', evidence: '追加补证', resolve: '提交复核' })[props.action],
)
watch(
  [evidenceRefs, reason, () => store.alert?.version],
  () => {
    requestId.value = crypto.randomUUID()
  },
  { deep: true },
)
const blocker = computed(() => {
  const alert = store.alert
  if (!alert) return '请先选择事件'
  if (!alert.allowedActions.includes(props.action)) return '权限不足或当前状态不允许该操作'
  if (props.action === 'claim') return ''
  if (!evidenceRefs.value.length) return '缺少有效的补证引用'
  if (!reason.value.trim()) return '请填写处理依据与复核结论'
  if (props.action === 'resolve' && alert.resolveBlockers.length)
    return alert.resolveBlockers.join('；')
  return ''
})
async function submit() {
  if (blocker.value) return
  const data =
    props.action === 'claim'
      ? {}
      : props.action === 'evidence'
        ? { evidenceRefs: evidenceRefs.value, reason: reason.value.trim() }
        : { evidenceRefs: evidenceRefs.value, reviewConclusion: reason.value.trim() }
  if (await store.act(props.action, data, requestId.value)) emit('update:modelValue', false)
}
</script>
<template>
  <el-dialog
    :model-value="modelValue"
    :title="`${title} · ${store.alert?.displayId || ''}`"
    width="min(780px,95vw)"
    :close-on-click-modal="!store.busy"
    @update:model-value="emit('update:modelValue', $event)"
    ><template v-if="action === 'claim'"
      ><p>认领 {{ store.alert?.displayId }}：{{ store.alert?.description }}</p>
      <p>预期版本 {{ store.alert?.version }}，身份与操作时间由后端记录。</p></template
    ><template v-else
      ><el-alert
        v-if="blocker"
        :title="blocker"
        description="关闭前需要关联补证记录，并通过规则核验；输入引用本身不代表已通过核验。"
        type="warning"
        :closable="false" /><el-form label-position="top"
        ><el-form-item label="补证记录" required
          ><el-select
            v-model="evidenceRefs"
            multiple
            filterable
            :allow-create="action === 'evidence'"
            aria-label="补证记录"
            placeholder="选择已追加证据；追加补证时可输入完整证据 ID"
            ><el-option
              v-for="id in store.alert?.supplementaryEvidenceRefs || []"
              :key="id"
              :label="id"
              :value="id" /></el-select></el-form-item
        ><el-form-item :label="action === 'resolve' ? '复核结论' : '补证原因'" required
          ><el-input
            v-model="reason"
            type="textarea"
            :rows="5"
            aria-label="处理依据与复核结论"
            placeholder="说明核对了哪些证据、处理结果与结论依据…" /></el-form-item></el-form
    ></template>
    <p>提交后保留原始事件与全部处置历史；不会覆盖原始日志。</p>
    <el-alert
      v-if="store.actionError"
      :title="store.actionError"
      type="error"
      :closable="false"
    /><template #footer
      ><el-button :disabled="store.busy" @click="emit('update:modelValue', false)">取消</el-button
      ><el-button type="primary" :loading="store.busy" :disabled="!!blocker" @click="submit">{{
        action === 'resolve' ? '提交复核并关闭' : title
      }}</el-button></template
    ></el-dialog
  >
</template>
<style scoped>
.el-form {
  margin-top: 28px;
}
p {
  line-height: 1.8;
  color: #6c82a4;
}
</style>
