<script setup lang="ts">
import { ref, watch } from 'vue'
import { request } from '../../../api/request'
import type { SourceContext, Sample } from '../../../types/evaluation'

const props = withDefaults(
  defineProps<{
    kind: 'lineage' | 'task' | 'checkpoints'
    entityType: 'model' | 'dataset' | 'task' | 'training_task'
    entityId: string
    versionId?: string
    direction?: 'upstream' | 'downstream' | 'both'
    demo?: boolean
    ready?: boolean
  }>(),
  { versionId: '', direction: 'both', demo: false, ready: true },
)
const busy = ref(false)
const saved = ref<SourceContext | null>(null)
const rows = ref<Sample[]>([])
const error = ref('')
let generation = 0
watch(
  () => [
    props.kind,
    props.entityType,
    props.entityId,
    props.versionId,
    props.direction,
    props.demo,
  ],
  () => {
    generation++
    saved.value = null
    rows.value = []
    error.value = ''
  },
)
async function save() {
  if (
    busy.value ||
    props.demo ||
    !props.entityId ||
    !props.ready ||
    (props.kind === 'lineage' && !props.versionId)
  )
    return
  const current = ++generation
  busy.value = true
  saved.value = null
  rows.value = []
  error.value = ''
  try {
    const source = await request<SourceContext>({
      url: '/evaluation/audit-snapshots',
      method: 'POST',
      timeout: 180000,
      data: {
        kind: props.kind,
        entityType: props.entityType,
        entityId: props.entityId,
        versionId: props.versionId,
        direction: props.direction,
      },
    })
    if (current !== generation) return
    saved.value = source
    const detail = await request<{ snapshot: { samples: Sample[] } }>({
      url: `/evaluation/audit-snapshots/${encodeURIComponent(source.entityId)}`,
      params: { versionId: source.versionId },
    })
    if (current === generation) rows.value = detail.snapshot.samples
  } catch (cause) {
    if (current === generation)
      error.value = cause instanceof Error ? cause.message : '快照保存失败'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="audit-snapshot-panel">
    <p>
      保存当前对象的固定审计快照，供测试评估引用。缺失与无法核验项会保留，后续业务变化不会改写已保存材料。
    </p>
    <p v-if="kind === 'lineage'">
      按数据、训练、模型产物三阶段及关联证据检查留痕；不评价标准链路还原准确率。
    </p>
    <p v-if="kind === 'checkpoints'">
      按训练总轮数的三分之一间隔及最后一轮检查存档。需核对实际权重文件，无法读取时不会算核验通过。
    </p>
    <el-button
      :loading="busy"
      :disabled="busy || demo || !entityId || !ready || (kind === 'lineage' && !versionId)"
      @click="save"
      >保存评估快照</el-button
    >
    <span v-if="demo"> 示例演示不能保存为真实评估来源。</span>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <template v-if="saved">
      <p>{{ saved.name }}</p>
      <router-link
        :to="{
          path: '/evaluation/tasks',
          query: {
            view: 'new',
            sourceKind: 'audit_record',
            sourceId: saved.entityId,
            versionId: saved.versionId,
          },
        }"
        >使用此快照新建测试任务 ↗</router-link
      >
      <el-table v-if="rows.length" :data="rows">
        <el-table-column prop="expectedDisplay" label="检查项" min-width="180" />
        <el-table-column prop="predictedDisplay" label="核验状态" width="115" />
        <el-table-column prop="reason" label="依据与限制" min-width="240" />
      </el-table>
    </template>
  </section>
</template>
<style scoped>
.audit-snapshot-panel {
  padding: 14px 18px;
  margin: 12px 0;
  border: 1px solid #dce7f8;
  border-radius: 8px;
  background: #f8fbff;
}
.audit-snapshot-panel p {
  margin: 6px 0 10px;
  color: #53637c;
}
</style>
