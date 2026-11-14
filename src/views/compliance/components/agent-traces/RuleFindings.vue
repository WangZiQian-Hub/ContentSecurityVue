<script setup lang="ts">
import type { RuleFinding } from '../../../../utils/agent-trace-presentation'
import {
  groupTraceFindings,
  traceRiskName,
  traceEvidenceText,
} from '../../../../utils/agent-trace-presentation'
import { computed } from 'vue'
const props = defineProps<{ items?: RuleFinding[]; version?: string }>()
const findings = computed(() => groupTraceFindings(props.items))

function evidencePreview(text: string) {
  const readable = traceEvidenceText(text)
  // The recorded evidence can contain a status/error prefix before the JSON.
  const response = readable.match(/^((?:状态=[^；\n]*；)?(?:错误码=[^；\n]*；)?)返回=([\s\S]*)$/)
  const payload = response ? response[2]! : readable
  let formatted = payload
  try {
    formatted = JSON.stringify(JSON.parse(payload), null, 2)
  } catch {
    // Plain text or a truncated response remains visible as recorded.
  }
  if (!response) return formatted
  const metadata = response[1]!.split('；').filter(Boolean).map(field => field.replace('=', '：'))
  return [...metadata, '返回：', formatted].join('\n')
}
defineEmits<{ locate: [eventId: string, callId?: string | null] }>()
const group = {
  security: '安全风险',
  policy: '请求拦截',
  operation: '运行异常',
  efficiency: '调用效率',
}
const outcome: Record<string, string> = {
  blocked: '已拦截',
  executed: '已执行',
  unknown: '结果未知',
  exposure_only: '尚未确认是否造成影响',
  recorded: '日志已记录',
}
</script>
<template>
  <section class="trace-rule-findings">
    <h3>
      检查结果 <small>{{ version ? `规则版本：${version}` : '尚未检查' }}</small>
    </h3>
    <p>根据已有日志检查。工具报错、重试或重复调用会单独列出，不直接算作安全风险。</p>
    <el-empty
      v-if="!findings.length"
      :image-size="45"
      :description="version ? '本次检查未发现问题' : '等待后台检查'"
    />
    <article v-for="f in findings" :key="f.key">
      <el-tag
        :type="f.category === 'security' ? 'danger' : f.category === 'policy' ? 'warning' : 'info'"
        >{{ group[f.category] }}</el-tag
      >
      <strong>{{ f.title }}</strong
      ><span>{{ outcome[f.outcome] || f.outcome }}</span>
      <el-button link type="primary" @click="$emit('locate', f.eventId, f.callId)"
        >查看 {{ f.eventDisplayId }}</el-button
      >
      <details class="finding-details">
        <summary>查看依据（{{ f.items.length }} 条）</summary>
        <div v-for="item in f.items" :key="item.findingId">
          <b>{{ traceRiskName({ code: item.ruleId, label: item.label }) }}</b>
          <pre tabindex="0" aria-label="审计依据内容，可滚动查看">{{ evidencePreview(item.evidenceText) }}</pre>
          <small>规则编号：{{ item.ruleId }} · {{ item.ruleVersion }}</small>
        </div>
      </details>
    </article>
  </section>
</template>
<style scoped>
.trace-rule-findings {
  padding: 14px;
  margin: 12px 0;
  border: 1px solid #d5e3f7;
  border-radius: 8px;
  background: #fff;
  min-width: 0;
}
h3 {
  font-size: 16px;
  margin: 0 0 8px;
}
h3 small {
  font-size: 12px;
  color: #66788f;
  margin-left: 10px;
}
p,
small {
  font-size: 12px;
  color: #66788f;
}
article {
  padding: 10px 0;
  border-top: 1px solid #e5edf9;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
article span {
  font-size: 12px;
}
pre {
  flex-basis: 100%;
  white-space: pre;
  max-height: 240px;
  max-width: 100%;
  box-sizing: border-box;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  margin: 0;
  padding: 8px;
  background: #f5f8fc;
  font-size: 12px;
}
pre::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
pre::-webkit-scrollbar-track {
  background: #edf2f8;
}
pre::-webkit-scrollbar-thumb {
  background: #a8b8cf;
  border-radius: 4px;
}
</style>
<style scoped>
.finding-details {
  flex-basis: 100%;
  min-width: 0;
  width: 100%;
  font-size: 12px;
  line-height: 1.7;
}
.finding-details summary {
  cursor: pointer;
  color: #336aab;
}
.finding-details > div {
  margin-top: 8px;
}
.finding-details pre {
  margin: 5px 0;
}
</style>
