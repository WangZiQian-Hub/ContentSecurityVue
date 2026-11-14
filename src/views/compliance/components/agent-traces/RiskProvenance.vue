<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  ExecutionSelection,
  RiskProvenance,
  RiskProvenanceNode,
  RiskProvenanceEdge,
} from '../../../../types/agent-trace-execution'
const props = defineProps<{
  provenance?: RiskProvenance
  selection: ExecutionSelection | null
  busy: boolean
}>()
const emit = defineEmits<{ select: [eventId: string] }>()
const mode = ref('risk'),
  chainId = ref('')
const chains = computed(() => props.provenance?.chains || [])
const chain = computed(
  () => chains.value.find((c) => c.chainId === chainId.value) || chains.value[0],
)
watch(
  () => [props.selection?.eventId, props.provenance],
  () => {
    const id = props.selection?.eventId
    const next =
      chains.value.find((c) => c.riskEventId === id && c.callId) ||
      chains.value.find(
        (c) => c.chainId === chainId.value && c.nodes.some((n) => n.eventId === id),
      ) ||
      chains.value.find((c) => c.callId && c.nodes.some((n) => n.eventId === id)) ||
      chains.value.find((c) => c.riskEventId === id) ||
      chains.value.find((c) => c.nodes.some((n) => n.eventId === id)) ||
      chains.value.find((c) => c.chainId === chainId.value) ||
      chains.value.find((c) => c.callId && c.attributionStatus === 'pending_review') ||
      chains.value[0]
    chainId.value = next?.chainId || ''
    if (next?.riskEventId === id) mode.value = 'risk'
  },
  { immediate: true },
)
// Render each supported path separately, so independent sources are not drawn as causal neighbors.
const paths = computed(() => {
  const c = chain.value
  if (!c) return []
  const roots = c.nodes.filter((n) => !c.edges.some((e) => e.toId === n.id))
  const result: { node: RiskProvenanceNode; edge?: RiskProvenanceEdge }[][] = []
  function walk(
    node: RiskProvenanceNode,
    prefix: { node: RiskProvenanceNode; edge?: RiskProvenanceEdge }[],
  ) {
    if (prefix.some((p) => p.node.id === node.id) || result.length >= 6) return
    const outgoing = c!.edges.filter((e) => e.fromId === node.id)
    if (!outgoing.length) {
      result.push([...prefix, { node }])
      return
    }
    for (const edge of outgoing) {
      const next = c!.nodes.find((n) => n.id === edge.toId)
      if (next) walk(next, [...prefix, { node, edge }])
    }
  }
  roots.forEach((n) => walk(n, []))
  return result
})
function chooseNode(n: RiskProvenanceNode) {
  emit('select', n.eventId)
}
</script>
<template>
  <section class="ex-card ex-provenance">
    <div class="provenance-heading">
      <h3>风险来源追踪</h3>
      <el-radio-group v-model="mode" size="small" aria-label="溯源视图">
        <el-radio-button value="risk">风险溯源</el-radio-button>
        <el-radio-button value="source">记录出处</el-radio-button>
      </el-radio-group>
    </div>
    <template v-if="mode === 'risk'">
      <p class="provenance-notice">
        虚线：可能相关 · 实线：调用与返回
      </p>
      <el-tag v-if="provenance && provenance.dataOrigin !== 'actual'" type="warning" size="small"
        >演示数据</el-tag
      >
      <template v-if="chain">
        <div class="provenance-paths" aria-label="风险证据链">
          <div v-for="(path, pi) in paths" :key="pi" class="provenance-path">
            <template v-for="part in path" :key="part.node.id">
              <button
                type="button"
                class="provenance-node"
                :class="[part.node.kind, { selected: selection?.eventId === part.node.eventId }]"
                :disabled="busy"
                :aria-label="`定位 ${part.node.displayId} ${part.node.label}`"
                @click="chooseNode(part.node)"
              >
                <b>{{ part.node.displayId }}</b
                ><span>{{ part.node.label }}</span>
              </button>
              <el-tooltip
                v-if="part.edge"
                :content="part.edge.basis"
                placement="top"
              ><button
                type="button"
                class="provenance-edge"
                :class="part.edge.status"
                :title="part.edge.basis"
              >
                <small>{{ part.edge.status === 'candidate' ? '可能相关' : '对应返回' }}</small
                ><span aria-hidden="true">⟶</span>
              </button></el-tooltip>
            </template>
          </div>
        </div>
      </template>
      <p v-else class="provenance-empty">当前样本没有可查看的风险记录。</p>
      <p v-if="provenance && !provenance.complete" class="provenance-gap">
        共 {{ provenance.total }} 处风险，当前显示前 {{ chains.length }} 处。
      </p>
    </template>
    <template v-else>
      <p class="provenance-notice">这里显示当前步骤来自哪份原始记录。</p>
      <div class="provenance-sources">
        <template v-for="(n, i) in selection?.lineage.nodes" :key="n.id"
          ><span v-if="i" aria-hidden="true"> → </span
          ><button
            type="button"
            :disabled="!n.eventId || busy"
            @click="n.eventId && emit('select', n.eventId)"
          >
            <b>{{ n.label }}</b
            ><small :title="n.id">{{ n.id }}</small>
          </button></template
        >
        <p v-if="!selection?.lineage.nodes.length">没有找到这一步的原始来源</p>
      </div>
    </template>
  </section>
</template>
<style scoped>
.provenance-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.provenance-heading h3 {
  margin: 0 !important;
}
.provenance-notice,
.provenance-gap,
.provenance-empty {
  font-size: 12px;
  line-height: 1.7;
  color: #65778e;
  margin: 8px 0;
  white-space: normal;
}
.provenance-gap {
  color: #986115;
}
.provenance-paths {
  overflow-x: auto;
  padding: 8px 1px;
}
.provenance-path {
  display: flex;
  align-items: center;
  min-width: max-content;
  margin: 5px 0;
}
.provenance-node {
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: center;
  justify-content: center;
  width: 128px;
  min-height: 64px;
  padding: 8px;
  border: 1px solid #c9defa;
  border-radius: 7px;
  background: #f2f7ff;
  color: #25476f;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}
.provenance-node b {
  font-size: 13px;
}
.provenance-node.risk_request {
  border-color: #efafb8;
  background: #fff1f3;
  color: #b9374c;
}
.provenance-node.tool_result {
  border-color: #c8dfcf;
  background: #f1f9f3;
}
.provenance-node.external_content {
  border-color: #e8c98a;
  background: #fff9ec;
}
.provenance-node.selected {
  outline: 2px solid #4d7bfc;
  outline-offset: 1px;
}
.provenance-node:focus-visible,
.provenance-edge:focus-visible {
  outline: 2px solid #4d7bfc;
}
.provenance-node:disabled {
  cursor: wait;
  opacity: 0.6;
}
.provenance-edge {
  width: 62px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 0;
  background: transparent;
  color: #3f78b1;
  cursor: pointer;
  padding: 3px;
}
.provenance-edge small {
  font-size: 11px;
}
.provenance-edge > span {
  width: 100%;
  font-size: 25px;
  line-height: 20px;
  border-top: 2px solid #78a5d1;
}
.provenance-edge.candidate {
  color: #a9791f;
}
.provenance-edge.candidate > span {
  border-top: 2px dashed #cda34c;
}
.provenance-evidence {
  padding: 9px 11px;
  border: 1px solid #dce7f5;
  background: #f6f9ff;
  border-radius: 7px;
  font-size: 12px;
  line-height: 1.6;
}
.provenance-evidence p {
  margin: 5px 0;
}
.provenance-evidence small {
  color: #718197;
}
.provenance-evidence pre,
.provenance-rule-evidence pre {
  margin: 5px 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 145px;
  overflow: auto;
  font-family: inherit;
  font-size: 12px;
}
.provenance-rule-evidence {
  font-size: 12px;
  line-height: 1.7;
  margin-top: 9px;
}
.provenance-rule-evidence summary {
  cursor: pointer;
  color: #336aab;
}
.provenance-sources {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: auto;
  padding: 5px 0;
}
.provenance-sources button {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 140px;
  max-width: 290px;
  background: #f0f6ff;
  border: 1px solid #d5e3f7;
  border-radius: 6px;
  padding: 8px;
  color: #345375;
}
.provenance-sources small {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
}
.provenance-sources button:disabled {
  opacity: 1;
}
</style>
