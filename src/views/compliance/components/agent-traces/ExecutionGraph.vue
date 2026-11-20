<script setup lang="ts">
import { computed, ref, nextTick, watch } from 'vue'
import ExecutionGlyph from './ExecutionGlyph.vue'
import type { ExecutionGraph } from '../../../../types/agent-trace-execution'
const props = defineProps<{ graph: ExecutionGraph; selected?: string; highlighted?: string }>()
const container = ref<HTMLElement>()
const clickedEvent = ref('')
const activeEvent = computed(() => props.selected &&
  (props.selected === clickedEvent.value || props.selected === props.highlighted) ? props.selected : undefined)
watch(() => props.highlighted, id => { if (id) clickedEvent.value = '' })
watch(() => props.selected, id => { if (id !== clickedEvent.value) clickedEvent.value = '' })
defineExpose({
  async focusEvent(id: string) {
    await nextTick()
    const node = [...(container.value?.querySelectorAll<SVGElement>('[data-event-id]') || [])]
      .find(element => element.dataset.eventId === id)
    if (!node) return false
    node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    node.focus({ preventScroll: true })
    return true
  },
})
const emit = defineEmits<{ select: [id: string] }>()
function pickEvent(id: string) {
  clickedEvent.value = id
  emit('select', id)
}
const nodes = computed(() =>
  props.graph.nodes.map((n, i) => ({ ...n, x: 8 + (i % 6) * 142, y: 12 + Math.floor(i / 6) * 72 })),
)
const links = computed(() =>
  props.graph.edges.flatMap((e) => {
    const a = nodes.value.find((n) => n.eventId === e.fromEventId),
      b = nodes.value.find((n) => n.eventId === e.toEventId)
    if (!a || !b) return []
    const path =
      a.y === b.y
        ? 'M' + (a.x + 110) + ',' + (a.y + 24) + ' H' + (b.x - 4)
        : 'M' +
          (a.x + 55) +
          ',' +
          (a.y + 48) +
          ' V' +
          (a.y + 60) +
          ' H' +
          (b.x + 55) +
          ' V' +
          (b.y - 4)
    return [{ ...e, path }]
  }),
)
</script>
<template>
  <div ref="container" class="path-scroll">
    <svg
      :viewBox="'0 0 840 ' + Math.max(72, Math.ceil(nodes.length / 6) * 72)"
      role="group"
      aria-label="思维轨迹图"
    >
      <defs>
        <marker
          id="execution-arrow"
          markerWidth="7"
          markerHeight="7"
          refX="6"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6" fill="none" stroke="#87b6e4" stroke-width="1.6" />
        </marker>
      </defs>
      <path
        v-for="e in links"
        :key="e.edgeId"
        :d="e.path"
        fill="none"
        stroke="#99c4eb"
        stroke-width="2"
        :stroke-dasharray="e.relation === 'sequence' ? undefined : '4 3'"
        marker-end="url(#execution-arrow)"
      >
        <title>{{ e.relation }}</title>
      </path>
      <g
        v-for="n in nodes"
        :key="n.eventId"
        :data-event-id="n.eventId"
        :transform="'translate(' + n.x + ',' + n.y + ')'"
        :class="[n.riskLevel, { chosen: n.eventId === activeEvent }]"
        role="button"
        tabindex="0"
        :aria-label="n.ordinal + ' ' + n.label"
        :aria-pressed="n.eventId === selected"
        @click="pickEvent(n.eventId)"
        @keydown.enter="pickEvent(n.eventId)"
      >
        <g :transform="n.eventId === activeEvent ? 'translate(-11,-4.8) scale(1.2)' : undefined" class="node-content">
        <rect class="node-card" width="110" height="48" rx="7" />
        <foreignObject x="10" y="15" width="24" height="24"
          ><ExecutionGlyph :label="n.label"
        /></foreignObject>
        <text x="70" y="19" text-anchor="middle">{{ String(n.ordinal).padStart(2, '0') }}</text>
        <text x="70" y="36" text-anchor="middle">{{ n.label }}</text>
        </g>
      </g>
    </svg>
  </div>
</template>
<style scoped>
.path-scroll {
  overflow: auto;
  max-height: 246px;
  padding: 16px 26px;
}
.path-scroll > svg {
  width: 100%;
  min-width: 620px;
  display: block;
  overflow: visible;
}
g {
  cursor: pointer;
  color: #1677ff;
}
rect {
  fill: #f1f8ff;
  stroke: #c5dfff;
  stroke-width: 1.6;
}
text {
  fill: #193451;
  font-size: 13px;
  font-weight: 700;
}
.high {
  color: #ef3c43;
}
.high rect {
  fill: #fff0f1;
  stroke: #ffb9bd;
}
.high text {
  fill: #d72c36;
}
.medium {
  color: #f09925;
}
.medium rect {
  fill: #fff6e9;
  stroke: #ffdbab;
}
.medium text {
  fill: #c17924;
}
.chosen .node-card {
  stroke: #ef3340;
  stroke-width: 3;
}
g:focus {
  outline: none;
}
foreignObject :deep(.el-icon) {
  font-size: 23px;
  width: 23px;
  height: 23px;
}
</style>
