<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useComplianceStore } from '../../../stores/compliance'
import type { AuditReview } from '../../../types/compliance'
const props = defineProps<{ modelValue: boolean }>(),
  emit = defineEmits<{ 'update:modelValue': [value: boolean] }>(),
  store = useComplianceStore()
const conclusion = ref<AuditReview['conclusion']>('needs_evidence'),
  reason = ref(''),
  evidenceRefs = ref<string[]>([]),
  requestId = ref('')
watch(
  () => props.modelValue,
  () => {
    reason.value = ''
    evidenceRefs.value = []
    requestId.value = crypto.randomUUID()
  },
)
const blocked = computed(() =>
  !store.audit?.allowedActions.includes('review')
    ? '当前无复核权限（示例结果只读）'
    : !reason.value.trim()
      ? '请填写复核依据'
      : conclusion.value === 'confirmed' && !evidenceRefs.value.length
        ? '确认结论必须关联证据'
        : '',
)
watch(
  [conclusion, reason, evidenceRefs, () => store.audit?.version],
  () => {
    requestId.value = crypto.randomUUID()
  },
  { deep: true },
)
async function submit() {
  if (blocked.value || !store.audit) return
  if (
    await store.review(
      {
        conclusion: conclusion.value,
        reason: reason.value.trim(),
        evidenceRefs: evidenceRefs.value,
        expectedVersion: store.audit.version,
      },
      requestId.value,
    )
  )
    emit('update:modelValue', false)
}
</script>
<template>
  <el-dialog
    :model-value="modelValue"
    title="审计人工复核"
    width="min(650px,95vw)"
    @update:model-value="emit('update:modelValue', $event)"
    ><el-form label-position="top"
      ><el-form-item label="复核结论" required
        ><el-select v-model="conclusion"
          ><el-option label="需补证" value="needs_evidence" /><el-option
            label="确认"
            value="confirmed" /><el-option
            label="驳回"
            value="rejected" /></el-select></el-form-item
      ><el-form-item label="证据引用"
        ><el-select v-model="evidenceRefs" multiple filterable allow-create
          ><el-option
            v-for="id in store.audit?.evidenceRefs || []"
            :key="id"
            :value="id"
            :label="id" /></el-select></el-form-item
      ><el-form-item label="复核依据" required
        ><el-input v-model="reason" type="textarea" :rows="4" /></el-form-item
    ></el-form>
    <p>复核将追加人工意见，不覆盖原算法结果或任务执行状态。</p>
    <el-alert
      v-if="blocked || store.actionError"
      :title="store.actionError || blocked"
      type="warning"
      :closable="false"
    /><template #footer
      ><el-button @click="emit('update:modelValue', false)">取消</el-button
      ><el-button type="primary" :disabled="!!blocked" :loading="store.busy" @click="submit"
        >提交复核</el-button
      ></template
    ></el-dialog
  >
</template>
