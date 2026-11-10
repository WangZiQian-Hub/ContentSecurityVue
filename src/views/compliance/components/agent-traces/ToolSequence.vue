<script setup lang="ts">
import { computed } from 'vue'
import type { ToolCall } from '../../../../types/agent-trace-tools'
import ToolGlyph from './ToolGlyph.vue'
const props = defineProps<{
  items: ToolCall[]
  participants: { participantId: string; label: string }[]
  totalDurationMs: number | null
}>()
defineEmits<{ select: [id: string] }>()
const height = computed(() => props.items.length * 43 + 78)
const x = (i: number) => 160 + i * (770 / Math.max(props.participants.length - 1, 1))
const target = (c: ToolCall) =>
  x(
    Math.max(
      1,
      props.participants.findIndex((p) => p.participantId === c.toParticipantId),
    ),
  )
const tone = (c: ToolCall) =>
  c.permissionDecision === 'denied' || c.executionStatus === 'failed'
    ? '#ff253d'
    : c.behaviorTags.some((t) => t.code === 'inefficient')
      ? '#f4a300'
      : '#246bff'
const returned = (c: ToolCall) =>
  c.permissionDecision === 'denied'
    ? '权限未通过（No actual data export）'
    : c.executionStatus === 'failed'
      ? '接口错误'
      : c.behaviorTags.some((t) => t.code === 'inefficient')
        ? '重复低效'
        : c.executionStatus === 'succeeded'
          ? '成功'
          : '未知'
const action = (c: ToolCall) => c.toolName.split('.').at(-1)
const glyph = (id: string) =>
  ({ agent: 'agent', search: 'search', web: 'web', data: 'data', policy: 'shield' })[id] || 'web'
</script>
<template>
  <svg
    class="tool-sequence-svg"
    :viewBox="`0 0 1000 ${height}`"
    role="img"
    aria-label="工具交互时序图"
  >
    <defs>
      <marker
        v-for="(fill, i) in ['#246bff', '#ff253d', '#f4a300', '#637184']"
        :id="`tools-head-${i}`"
        :key="fill"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M0 0L10 5L0 10Z" :fill="fill" />
      </marker>
    </defs>
    <text x="20" y="67" fill="#243653" font-weight="700">时间 ↓</text>
    <line x1="72" x2="72" y1="88" :y2="height - 15" stroke="#8793a5" stroke-width="2" />
    <g v-for="(p, i) in participants" :key="p.participantId">
      <rect :x="x(i) - 53" y="3" width="112" height="30" rx="5" fill="#e0ecff" />
      <foreignObject :x="x(i) - 38" y="7" width="23" height="23"
        ><ToolGlyph
          :name="glyph(p.participantId)"
          style="color: #246bff; width: 21px; height: 21px"
      /></foreignObject>
      <text :x="x(i) + 18" y="24" text-anchor="middle" fill="#162e54" font-weight="700">
        {{ p.label }}
      </text>
      <line
        :x1="x(i)"
        :x2="x(i)"
        y1="35"
        :y2="height - 8"
        stroke="#8b96a5"
        stroke-dasharray="3 3"
      />
    </g>
    <g
      v-for="(c, i) in items"
      :key="c.callId"
      role="button"
      tabindex="0"
      :aria-label="c.displayId"
      @click="$emit('select', c.callId)"
      @keydown.enter="$emit('select', c.callId)"
      @keydown.space.prevent="$emit('select', c.callId)"
    >
      <circle cx="72" :cy="76 + i * 43" r="4" stroke="#778398" fill="white" stroke-width="1.8" />
      <text x="7" :y="81 + i * 43" fill="#293e5d">
        {{ c.relativeStartMs == null ? '未知' : (c.relativeStartMs / 1000).toFixed(2) + ' s' }}
      </text>
      <text
        :x="(160 + target(c)) / 2"
        :y="78 + i * 43"
        :fill="tone(c)"
        text-anchor="middle"
        font-weight="700"
      >
        {{ c.displayId }}: {{ action(c) }}
        {{
          c.durationMs == null
            ? c.executionStatus === 'not_executed'
              ? '（已拦截）'
              : '（耗时未提供）'
            : `（${c.durationMs} ms）`
        }}
      </text>
      <line
        x1="160"
        :x2="target(c)"
        :y1="86 + i * 43"
        :y2="86 + i * 43"
        :stroke="tone(c)"
        stroke-width="2"
        :marker-end="`url(#tools-head-${tone(c) === '#ff253d' ? 1 : tone(c) === '#f4a300' ? 2 : 0})`"
      />
      <g v-if="c.permissionDecision === 'denied'">
        <circle
          :cx="target(c)"
          :cy="86 + i * 43"
          r="10"
          fill="white"
          stroke="#ff253d"
          stroke-width="2"
        />
        <path
          :d="`M${target(c) - 4} ${82 + i * 43}l8 8m0-8-8 8`"
          stroke="#ff253d"
          stroke-width="2"
        />
      </g>
      <line
        :x1="target(c)"
        x2="160"
        :y1="105 + i * 43"
        :y2="105 + i * 43"
        stroke="#637184"
        stroke-dasharray="4 3"
        marker-end="url(#tools-head-3)"
      />
      <foreignObject x="165" :y="92 + i * 43" :width="Math.max(170, target(c) - 170)" height="26"
        ><div xmlns="http://www.w3.org/1999/xhtml" class="return-caption">
          返回：<span
            :class="
              c.permissionDecision === 'denied' || c.executionStatus === 'failed'
                ? 'danger'
                : c.behaviorTags.length
                  ? 'warning'
                  : 'success'
            "
            >{{ returned(c) }}</span
          >
        </div></foreignObject
      >
    </g>
    <circle cx="72" :cy="height - 16" r="4" stroke="#778398" fill="white" stroke-width="1.8" />
    <text x="7" :y="height - 11" fill="#293e5d">
      {{ totalDurationMs == null ? '—' : (totalDurationMs / 1000).toFixed(2) + ' s' }}
    </text>
  </svg>
</template>
<style scoped>
.tool-sequence-svg {
  width: 100%;
  min-width: 750px;
  display: block;
  font:
    13px 'Microsoft YaHei',
    Arial,
    sans-serif;
}
.tool-sequence-svg g[role='button'] {
  cursor: pointer;
}
.tool-sequence-svg g[role='button']:focus {
  outline: none;
  filter: drop-shadow(0 0 2px #7ca9ff);
}
.return-caption {
  text-align: center;
  font-size: 12px;
  color: #263d60;
  white-space: nowrap;
  line-height: 22px;
}
.return-caption span {
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 700;
}
.success {
  background: #d5f6df;
  color: #1aa34c;
}
.danger {
  background: #ffe1e4;
  color: #f02b42;
}
.warning {
  background: #fff0bf;
  color: #d89200;
}
</style>
