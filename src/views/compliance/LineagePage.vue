<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useComplianceStore } from '../../stores/compliance'
import PanelCard from '../../components/PanelCard.vue'
import AppIcon from '../../components/AppIcon.vue'
import StateBadge from './components/StateBadge.vue'
import EvidenceLinks from './components/EvidenceLinks.vue'
import type { LineageQuery } from '../../types/compliance'
const store = useComplianceStore(),
  route = useRoute(),
  entityType = ref('model'),
  entityId = ref(''),
  version = ref(''),
  direction = ref<LineageQuery['direction']>('upstream'),
  selected = ref(''),
  zoom = ref(1)
const edge = computed(() => store.lineage?.edges.find((e) => e.id === selected.value))
// Layout every returned edge independently, including multiple parents and unknown endpoints.
const positions = computed(
  () =>
    new Map(
      store.lineage?.nodes.map((node, index) => [
        node.id,
        { x: 95 + (index % 5) * 190, y: 100 + Math.floor(index / 5) * 160 },
      ]) || [],
    ),
)
const graphHeight = computed(() =>
  Math.max(270, Math.ceil((store.lineage?.nodes.length || 0) / 5) * 160 + 80),
)
function load() {
  selected.value = ''
  if (entityId.value)
    store.loadLineage({
      entityType: entityType.value,
      entityId: entityId.value,
      versionId: version.value || undefined,
      direction: direction.value,
    })
}
function selectObject(value: string) {
  const candidate = store.candidates.find((c) => String(c.sourceId) === value)
  version.value = candidate?.modelVersion || ''
  store.invalidate()
  load()
}
function inbound() {
  if (
    typeof route.query.entityType === 'string' &&
    ['model', 'dataset', 'training_task'].includes(route.query.entityType)
  )
    entityType.value = route.query.entityType
  entityId.value = String(route.query.sourceId || '')
  version.value = String(route.query.versionId || '')
  load()
}
function typeChanged() {
  store.invalidate()
  entityId.value = ''
  version.value = ''
  store.loadCandidates(entityType.value)
}
onMounted(() => {
  inbound()
  store.loadCandidates(entityType.value)
})
watch(() => route.query, inbound)
function nodeLabel(id: string) {
  return store.lineage?.nodes.find((n) => n.id === id)?.displayId || '未知节点'
}
function rowClass({ row }: { row: { id: string } }) {
  return row.id === selected.value ? 'compliance-selected-row' : ''
}
function selectRow(row: { id: string }) {
  selected.value = row.id
}
</script>
<template>
  <div class="compliance-filter">
    <label
      >对象类型<el-select v-model="entityType" aria-label="对象类型" @change="typeChanged"
        ><el-option label="模型版本" value="model" /><el-option
          label="数据版本"
          value="dataset" /><el-option label="训练任务" value="training_task" /></el-select></label
    ><label
      >对象完整 ID<el-select
        v-model="entityId"
        filterable
        allow-create
        placeholder="选择对象或输入 ID"
        aria-label="对象完整 ID"
        @change="selectObject"
        ><el-option
          v-for="item in store.candidates"
          :key="String(item.sourceId)"
          :label="item.label"
          :value="String(item.sourceId)" /></el-select></label
    ><label>版本<el-input v-model="version" aria-label="版本" @input="store.invalidate()" /></label
    ><label
      >追溯方向<el-select v-model="direction" aria-label="追溯方向" @change="load"
        ><el-option label="上游来源" value="upstream" /><el-option
          label="下游引用"
          value="downstream" /><el-option label="双向关系" value="both" /></el-select></label
    ><el-button type="primary" :loading="store.loading" @click="load">查询谱系</el-button>
    <el-button
      :disabled="
        store.demo || !store.lineage || !['model', 'dataset'].includes(entityType) || store.busy
      "
      :loading="store.busy"
      @click="store.execute('lineage_audit', { entityType, entityId })"
      >重新审计</el-button
    >
  </div>
  <p v-if="store.task" class="compliance-note">
    审计执行 {{ store.task.taskId }}：{{ store.task.status }}；执行成功不等于关系核验通过。
  </p>
  <template v-if="store.lineage"
    ><div class="compliance-split">
      <PanelCard title="工程谱系关系" icon="Share"
        ><template #extra
          ><el-button aria-label="缩小关系图" @click="zoom = Math.max(0.6, zoom - 0.2)">−</el-button
          ><el-button aria-label="放大关系图" @click="zoom = Math.min(2, zoom + 0.2)">+</el-button
          ><el-button @click="zoom = 1">重置</el-button></template
        >
        <div class="compliance-graph-scroll">
          <svg
            :width="1000 * zoom"
            :height="graphHeight * zoom"
            :viewBox="`0 0 1000 ${graphHeight}`"
            role="img"
            aria-label="工程版本关系图"
          >
            <defs>
              <marker
                id="compliance-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#76a7ed" />
              </marker>
            </defs>
            <g v-for="relation in store.lineage.edges" :key="relation.id">
              <path
                v-if="positions.has(relation.fromId) && positions.has(relation.toId)"
                :d="`M ${positions.get(relation.fromId)!.x + 40} ${positions.get(relation.fromId)!.y} L ${positions.get(relation.toId)!.x - 45} ${positions.get(relation.toId)!.y}`"
                fill="none"
                :stroke="
                  relation.id === selected
                    ? '#155eef'
                    : relation.verificationState === 'verified'
                      ? '#77abef'
                      : '#eda43b'
                "
                :stroke-width="relation.id === selected ? 5 : 3"
                :stroke-dasharray="relation.verificationState === 'verified' ? undefined : '7 5'"
                marker-end="url(#compliance-arrow)"
                tabindex="0"
                role="button"
                :aria-label="`${relation.relation}：${nodeLabel(relation.fromId)}至${nodeLabel(relation.toId)}`"
                @click="selected = relation.id"
                @keydown.enter="selected = relation.id"
              />
            </g>
            <g
              v-for="node in store.lineage.nodes"
              :key="node.id"
              :transform="`translate(${positions.get(node.id)!.x},${positions.get(node.id)!.y})`"
            >
              <circle r="42" fill="#e7f0ff" />
              <circle
                r="34"
                :fill="
                  node.type === 'model'
                    ? '#8865ec'
                    : node.type === 'training_task'
                      ? '#7772e8'
                      : node.type === 'task'
                        ? '#15b8c9'
                        : '#248cff'
                "
              />
              <foreignObject x="-19" y="-19" width="38" height="38"
                ><AppIcon
                  :name="
                    node.type === 'model'
                      ? 'Box'
                      : node.type === 'training_task'
                        ? 'DataAnalysis'
                        : node.type === 'task'
                          ? 'Setting'
                          : 'Coin'
                  "
                  style="width: 38px; height: 38px; color: white"
              /></foreignObject>
              <text y="70" text-anchor="middle" fill="#183d73" font-size="16" font-weight="600">
                {{ node.label }}
              </text>
              <text y="96" text-anchor="middle" fill="#7187a7" font-size="13">
                {{ node.displayId }}
              </text>
            </g>
          </svg>
        </div>
        <p class="compliance-muted">
          实线：已核验；虚线：待核验 / 不可用。关系表示工程依赖，不表示因果。
        </p>
        <el-alert
          v-for="gap in store.lineage.gaps"
          :key="gap.reason"
          :title="gap.reason"
          type="warning"
          :closable="false"
      /></PanelCard>
      <PanelCard title="选中关系证据" icon="Tickets"
        ><template v-if="edge"
          ><h3>{{ nodeLabel(edge.fromId) }} → {{ nodeLabel(edge.toId) }}</h3>
          <dl class="compliance-details">
            <dt>关系</dt>
            <dd>{{ edge.relation }}</dd>
            <dt>核验状态</dt>
            <dd><StateBadge :state="edge.verificationState" /></dd>
            <dt>缺失原因</dt>
            <dd>{{ edge.missingReason || '未报告缺口' }}</dd>
          </dl>
          <EvidenceLinks :refs="edge.evidenceRefs" />
          <p v-if="edge.trainingTaskId">
            <router-link
              :to="{
                path: '/compliance/training-monitor',
                query: { trainingTaskId: edge.trainingTaskId },
              }"
              >训练监控 →</router-link
            >
          </p></template
        ><el-empty v-else description="选择图中的关系线或下方校验行" :image-size="70"
      /></PanelCard>
    </div>
    <PanelCard title="关联校验结果" icon="Shield"
      ><el-table
        :data="store.lineage.edges"
        stripe
        :row-class-name="rowClass"
        @row-click="selectRow"
        ><el-table-column label="关系" min-width="260"
          ><template #default="{ row }"
            ><el-button link type="primary" @click="selected = row.id"
              >{{ nodeLabel(row.fromId) }} → {{ nodeLabel(row.toId) }}</el-button
            ></template
          ></el-table-column
        ><el-table-column prop="relation" label="引用关系" /><el-table-column
          prop="missingReason"
          label="缺口说明"
          min-width="200" /><el-table-column label="结果"
          ><template #default="{ row }"
            ><StateBadge :state="row.verificationState" /></template></el-table-column
        ><el-table-column label="操作"
          ><template #default="{ row }"
            ><EvidenceLinks
              :refs="
                row.evidenceRefs
              " /></template></el-table-column></el-table></PanelCard></template
  ><el-empty
    v-else-if="!store.loading && !store.error"
    description="选择对象与版本，查询工程关系"
  />
</template>
