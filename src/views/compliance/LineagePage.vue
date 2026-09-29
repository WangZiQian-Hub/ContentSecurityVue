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
const layout = computed(() => {
  const nodes = store.lineage?.nodes || []
  const edges = store.lineage?.edges || []
  const root = nodes.find(
    (node) =>
      node.entityType === entityType.value &&
      String(node.entityId) === entityId.value &&
      (!version.value || node.versionId === version.value || node.entityType === 'training_task'),
  )
  const distances = new Map<string, number>()
  if (root) {
    distances.set(root.id, 0)
    const forward = [root.id]
    for (let index = 0; index < forward.length; index += 1) {
      const current = forward[index]!
      const distance = distances.get(current)!
      for (const relation of edges.filter((item) => item.fromId === current)) {
        if (!distances.has(relation.toId) || distances.get(relation.toId)! > distance + 1) {
          distances.set(relation.toId, distance + 1)
          forward.push(relation.toId)
        }
      }
    }
    const backward = [root.id]
    const upstreamDistances = new Map<string, number>([[root.id, 0]])
    for (let index = 0; index < backward.length; index += 1) {
      const current = backward[index]!
      const distance = upstreamDistances.get(current)!
      for (const relation of edges.filter((item) => item.toId === current)) {
        if (!upstreamDistances.has(relation.fromId)) {
          upstreamDistances.set(relation.fromId, distance - 1)
          backward.push(relation.fromId)
        }
      }
    }
    for (const [id, distance] of upstreamDistances) distances.set(id, distance)
  }
  const fallback = new Map(
    nodes.map((node, index) => [
      node.id,
      { x: 110 + index * 260, y: 120 },
    ]),
  )
  if (!root) return { positions: fallback, width: Math.max(520, 110 + nodes.length * 260), height: 280 }
  const connected = nodes.filter((node) => distances.has(node.id))
  const isolated = nodes.filter((node) => !distances.has(node.id))
  const columns = [...new Set(connected.map((node) => distances.get(node.id)!))].sort(
    (a, b) => a - b,
  )
  const columnIndex = new Map(columns.map((distance, index) => [distance, index]))
  const byColumn = new Map<number, typeof nodes>()
  for (const node of connected) {
    const index = columnIndex.get(distances.get(node.id)!)!
    if (!byColumn.has(index)) byColumn.set(index, [])
    byColumn.get(index)!.push(node)
  }
  if (isolated.length) {
    const index = columns.length
    byColumn.set(index, isolated)
  }
  const positions = new Map<string, { x: number; y: number }>()
  let maxRows = 1
  for (const [column, columnNodes] of byColumn) {
    maxRows = Math.max(maxRows, columnNodes.length)
    columnNodes.forEach((node, row) => {
      positions.set(node.id, { x: 110 + column * 260, y: 120 + row * 220 })
    })
  }
  const columnCount = Math.max(1, byColumn.size)
  return {
    positions,
    width: 110 + (columnCount - 1) * 260 + 160,
    height: Math.max(280, 120 + (maxRows - 1) * 220 + 160),
  }
})
const positions = computed(() => layout.value.positions)
const graphWidth = computed(() => layout.value.width)
const graphHeight = computed(() => layout.value.height)
function edgePath(relation: { fromId: string; toId: string }) {
  const from = positions.value.get(relation.fromId)
  const to = positions.value.get(relation.toId)
  if (!from || !to) return ''
  const leftToRight = from.x <= to.x
  const startX = from.x + (leftToRight ? 45 : -45)
  const endX = to.x + (leftToRight ? -48 : 48)
  const controlX = (startX + endX) / 2
  return `M ${startX} ${from.y} C ${controlX} ${from.y}, ${controlX} ${to.y}, ${endX} ${to.y}`
}
function shortNodeLabel(label: string) {
  return label.length > 12 ? `${label.slice(0, 12)}…` : label
}
const objectCandidates = computed(() => {
  const seen = new Set<string>()
  return store.candidates.filter((candidate) => {
    const key = String(candidate.sourceId)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
})
const versionCandidates = computed(() =>
  store.candidates.filter(
    (candidate) =>
      String(candidate.sourceId) === entityId.value && Boolean(candidate.modelVersion),
  ),
)
function selectedCandidate(versionId = version.value) {
  return store.candidates.find(
    (candidate) =>
      String(candidate.sourceId) === entityId.value && candidate.modelVersion === versionId,
  )
}
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
  entityId.value = value
  version.value = ''
  store.invalidate()
}
function selectVersion(value: string) {
  if (!selectedCandidate(value)) version.value = ''
  store.invalidate()
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
      >对象名称<el-select
        v-model="entityId"
        filterable
        allow-create
        placeholder="选择对象或输入 ID"
        aria-label="对象名称"
        @change="selectObject"
        ><el-option
          v-for="item in objectCandidates"
          :key="String(item.sourceId)"
          :label="item.subjectRef.label"
          :value="String(item.sourceId)" /></el-select></label
    ><label
      >版本<el-select
        v-model="version"
        :disabled="!entityId || !versionCandidates.length"
        aria-label="版本"
        @change="selectVersion"
        ><el-option
          v-for="item in versionCandidates"
          :key="`${String(item.sourceId)}:${item.modelVersion}`"
          :label="item.modelVersion || ''"
          :value="item.modelVersion || ''" /></el-select></label
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
            :width="graphWidth * zoom"
            :height="graphHeight * zoom"
            :viewBox="`0 0 ${graphWidth} ${graphHeight}`"
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
                :d="edgePath(relation)"
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
                <title>{{ node.label }}</title>
                {{ shortNodeLabel(node.label) }}
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
