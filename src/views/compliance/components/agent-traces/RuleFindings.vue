<script setup lang="ts">
import type { RuleFinding } from '../../../../utils/agent-trace-presentation'
defineProps<{ items?: RuleFinding[]; version?: string }>()
defineEmits<{ locate: [eventId: string, callId?: string | null] }>()
const group = { security: '安全风险线索', policy: '策略拒绝', operation: '运行异常', efficiency: '效率线索' }
const outcome: Record<string, string> = { blocked: '已拦截', executed: '已执行', unknown: '结果未知', exposure_only: '仅发现外部指令，未判定攻击成功', recorded: '日志已记录' }
const modelLabel = { deepseek: 'DeepSeek', internlm: '书生 9B' }
</script>
<template>
  <section class="trace-rule-findings">
    <h3>审计发现 <small>{{ version || '尚未完成审计' }}</small></h3>
    <el-empty v-if="!items?.length" :image-size="45" :description="version ? '当前审计未发现命中项' : '等待后台审计'" />
    <article v-for="f in items" :key="f.findingId">
      <el-tag :type="f.category === 'security' ? 'danger' : f.category === 'policy' ? 'warning' : 'info'">{{ group[f.category] }}</el-tag>
      <strong>{{ f.label }}</strong><span v-if="f.eventId && f.outcome !== 'model_judgment'">{{ outcome[f.outcome] || f.outcome }}</span>
      <el-button v-if="f.eventId" link type="primary" @click="$emit('locate', f.eventId, f.callId)">{{ f.competitionStep ? `赛题第 ${f.competitionStep} 步 · ` : '' }}{{ f.eventDisplayId }} · 定位</el-button>
      <span v-else>整条轨迹</span>
      <pre v-if="f.evidenceText">{{ f.evidenceText }}</pre>
      <small v-if="f.detectionSource === 'model_fallback'" :title="f.modelId">
        {{ f.ruleId }} · {{ f.modelProvider ? modelLabel[f.modelProvider] : '模型' }}补查
      </small>
      <small v-else>规则 {{ f.ruleId }} · {{ f.ruleVersion }}</small>
    </article>
  </section>
</template>
<style scoped>
.trace-rule-findings{padding:14px;margin:12px 0;border:1px solid #d5e3f7;border-radius:8px;background:#fff;min-width:0}
h3{font-size:16px;margin:0 0 8px}h3 small{font-size:12px;color:#66788f;margin-left:10px}p,small{font-size:12px;color:#66788f}article{padding:10px 0;border-top:1px solid #e5edf9;display:flex;gap:8px;align-items:center;flex-wrap:wrap}article span{font-size:12px}pre{flex-basis:100%;white-space:pre-wrap;overflow-wrap:anywhere;max-height:140px;overflow:auto;margin:0;padding:8px;background:#f5f8fc;font-size:12px}
</style>
