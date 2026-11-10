<script setup lang="ts">
import type { RuleFinding } from '../../../../utils/agent-trace-presentation'
defineProps<{ items?: RuleFinding[]; version?: string }>()
defineEmits<{ locate: [eventId: string, callId?: string | null] }>()
const group = { security: '安全风险线索', policy: '策略拒绝', operation: '运行异常', efficiency: '效率线索' }
const outcome: Record<string, string> = { blocked: '已拦截', executed: '已执行', unknown: '结果未知', exposure_only: '仅发现外部指令，未判定攻击成功', recorded: '日志已记录' }
</script>
<template>
  <section class="trace-rule-findings">
    <h3>规则审计发现 <small>{{ version || '尚未完成规则审计' }}</small></h3>
    <p>仅检查已记录的明确事件；未命中不代表全面安全。运行异常和效率线索不计入安全风险样本。</p>
    <el-empty v-if="!items?.length" :image-size="45" :description="version ? '当前规则未发现命中项' : '等待后台规则审计'" />
    <article v-for="f in items" :key="f.findingId">
      <el-tag :type="f.category === 'security' ? 'danger' : f.category === 'policy' ? 'warning' : 'info'">{{ group[f.category] }}</el-tag>
      <strong>{{ f.label }}</strong><span>{{ outcome[f.outcome] || f.outcome }}</span>
      <el-button link type="primary" @click="$emit('locate', f.eventId, f.callId)">{{ f.eventDisplayId }} · 定位</el-button>
      <pre>{{ f.evidenceText }}</pre><small>规则 {{ f.ruleId }} · {{ f.ruleVersion }}</small>
    </article>
  </section>
</template>
<style scoped>
.trace-rule-findings{padding:14px;margin:12px 0;border:1px solid #d5e3f7;border-radius:8px;background:#fff;min-width:0}
h3{font-size:16px;margin:0 0 8px}h3 small{font-size:12px;color:#66788f;margin-left:10px}p,small{font-size:12px;color:#66788f}article{padding:10px 0;border-top:1px solid #e5edf9;display:flex;gap:8px;align-items:center;flex-wrap:wrap}article span{font-size:12px}pre{flex-basis:100%;white-space:pre-wrap;overflow-wrap:anywhere;max-height:140px;overflow:auto;margin:0;padding:8px;background:#f5f8fc;font-size:12px}
</style>
