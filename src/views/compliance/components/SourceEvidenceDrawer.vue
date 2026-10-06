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
    class="evidence-detail-drawer"
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
        type="warning"
        :closable="false"
        show-icon
      /><el-button v-if="store.evidenceError" @click="store.openEvidence(props.evidenceId)"
        >重试</el-button
      >
      <template v-if="store.evidence"
        ><el-tag>只读来源证据</el-tag>
        <h2>
          {{
            store.evidence.subjectRef.displayId === store.evidence.subjectRef.versionId
              ? store.evidence.subjectRef.displayId
              : `${store.evidence.subjectRef.displayId} / ${store.evidence.subjectRef.versionId || '未记录版本'}`
          }}
        </h2>
        <dl>
          <dt>对象内部编号</dt>
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
        <h3>证据字段</h3>
        <p>
          以下为该条证据记录里保存的原始字段值。五要素是否齐备属于整条链的结论，请在「全链路追踪」查看。
        </p>
        <el-table :data="store.evidence.redactedFields"
          ><el-table-column prop="label" label="字段" width="100"/>
          <el-table-column label="记录值" width="340"
            ><template #default="{ row }">{{ row.value ?? '缺失' }}</template></el-table-column
          ><el-table-column label="字段状态" width="130" 
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
/* ① 整个抽屉的基础字号（dt 和 dd 都跟它） */
.compliance-evidence {
  font-size: 18px;
}

/* ② 标题「tsk_process_demo_01 / 未记录版本」 */
.compliance-evidence h2 {
  font-size: 20px ;
}

/* ③ 标签（对象内部编号 等）单独调小一点、调淡一点 */
.compliance-evidence dt {
  font-size: 16px;
  font-weight: 600;
  color: #7a8eaf;
}

/* ④ 每行的间距（原 20px） */
.compliance-evidence dl {
  gap: 16px;
}

/* ⑤ 「只读来源证据」那个小标签 */
.compliance-evidence :deep(.el-tag) {
  --el-tag-font-size: 14px;
  height: 26px;
}
/* ⑥ 值（对象内部编号右边的那些）单独调字号 */
.compliance-evidence dd {
  font-size: 16px;
}

/* ⑦ 抽屉标题「源证据详情」。
   抽屉内容被传送到 <body>，:deep() 需要一个带 scoped 标记的祖先、匹配不到，
   因此改用 :global() + 抽屉专属 class —— 与 DataValuePage.vue 第 873 行的写法一致。 */
:global(.evidence-detail-drawer .el-drawer__title) {
  font-size: 20px;
  font-weight: 600;
}
/* ⑪ 标题栏下方的间距（Element Plus 默认 margin-bottom: 32px） */
:global(.evidence-detail-drawer .el-drawer__header) {
  margin-bottom: 12px;
}

/* ⑫ 内容区的上内边距（Element Plus 默认 padding: 20px） */
:global(.evidence-detail-drawer .el-drawer__body) {
  padding-top: 12px;
}
</style>
