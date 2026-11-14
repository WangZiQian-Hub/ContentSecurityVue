<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  agentActive,
  agentStatus,
  agentTools,
  agentModeLabels,
  agentCallStatus,
} from '../../../../types/internal-agent'
import type { AgentRun } from '../../../../types/internal-agent'
import { useComplianceStore } from '../../../../stores/compliance'
const props = defineProps<{
  modelValue: boolean
  run?: AgentRun
  error: string
  busy: boolean
  canOperate: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; stop: []; trace: [] }>()
const router = useRouter(),
  tab = ref('result')
watch(
  () => props.run?.runId,
  () => {
    tab.value = 'result'
  },
)
const traceQuery = computed(() => ({ view: 'execution', ...props.run?.trace }))
function audit() {
  if (props.run?.trace) {
    useComplianceStore().setDemo(false)
    emit('update:modelValue', false)
    void router.push({ path: '/compliance/agent-traces', query: traceQuery.value })
  }
}
const json = (value: unknown) => JSON.stringify(value, null, 2)
</script>
<template>
  <el-drawer
    :model-value="modelValue"
    title="智能体任务详情"
    size="min(900px, 95vw)"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-skeleton v-if="!run && !error" :rows="8" animated />
    <template v-if="run">
      <div class="task-heading">
        <strong>{{ run.runId }}</strong
        ><el-tag>{{ agentStatus(run.status) }}</el-tag>
        <el-tag type="info">{{ agentModeLabels[run.mode || 'privacy'] }}</el-tag>
      </div>
      <p>
        {{ run.dataset.name }} · {{ run.dataset.version }} ·
        {{
          run.mode === 'policy_test'
            ? '仅查询已有信息，不读取样本正文'
            : `最多 ${run.sampleLimit} 条样本`
        }}
      </p>
      <el-alert
        v-if="run.mode === 'policy_test'"
        :title="run.policy.description"
        type="warning"
        :closable="false"
      />
      <p class="request">{{ run.prompt }}</p>
      <p v-if="run.batch">
        所属批次：<b>{{ run.batch.name }}</b
        >（{{ run.batch.displayId }}）
      </p>
      <div class="task-actions">
        <el-button
          v-if="agentActive(run)"
          type="warning"
          :loading="busy"
          :disabled="!canOperate || run.stopRequested"
          @click="emit('stop')"
          >{{ run.stopRequested ? '正在请求停止' : '请求停止' }}</el-button
        >
        <el-button type="primary" :disabled="!run.trace" @click="audit">查看轨迹审计</el-button>
        <el-button v-if="run.traceError" :disabled="busy || !canOperate" @click="emit('trace')"
          >重试发布轨迹</el-button
        >
      </div>
      <p v-if="run.stopRequested" class="hint">
        停止将在外部请求结束或超时后生效；已经完成的检测和调用费用不会回滚。
      </p>
      <el-alert
        v-if="run.error || run.traceError"
        :title="run.error || run.traceError"
        type="warning"
        :closable="false"
      />
      <div class="task-metrics">
        <span>模型轮数 {{ run.rounds }}/{{ run.maxRounds }}</span
        ><span>工具请求 {{ run.callCount }}/{{ run.maxCalls }}</span
        ><span>Token {{ run.tokenUsage.totalTokens ?? '未提供' }}</span>
        <span>策略拦截 {{ run.blockedCount ?? 0 }} 次</span>
      </div>
      <el-tabs v-model="tab">
        <el-tab-pane label="最终结果" name="result">
          <pre>{{
            run.answer ||
            (agentActive(run)
              ? '任务执行中，等待工具结果与最终回答…'
              : '本次未获得最终回答，请查看已保存的调用记录。')
          }}</pre>
          <p v-if="run.privacyCheckId">隐私检测编号：{{ run.privacyCheckId }}</p></el-tab-pane
        >
        <el-tab-pane label="工具调用" name="calls">
          <el-empty v-if="!run.calls?.length" description="暂无工具调用" />
          <article v-for="call in run.calls" :key="call.callId">
            <h4 :class="{ blocked: call.executionStatus === 'not_executed' }">
              {{ agentTools[call.toolName] || call.toolName }} ·
              {{ agentCallStatus(call.executionStatus) }}
            </h4>
            <small
              >{{ call.callId }} ·
              {{
                call.executionStatus === 'not_executed'
                  ? '策略拒绝，动作未执行'
                  : call.endedAtMs == null
                    ? '耗时未提供'
                    : `${call.endedAtMs - call.startedAtMs} ms`
              }}</small
            >
            <pre>{{ call.arguments }}</pre>
            <pre>{{ json(call.result) }}</pre>
          </article>
        </el-tab-pane>
        <el-tab-pane label="对话记录（脱敏）" name="messages">
          <pre>{{ json(run.messages) }}</pre>
          <small>仅展示实际记录的消息；模型未提供的推理内容不会补写。</small></el-tab-pane
        >
        <el-tab-pane label="模型用量" name="usage">
          <pre>{{ json(run.invocations) }}</pre>
          <small
            >包括智能体对话与隐私检测调用；Token 为服务商返回值，缺失时不估算费用。</small
          ></el-tab-pane
        >
      </el-tabs>
    </template>
  </el-drawer>
</template>
<style scoped>
.task-heading,
.task-actions,
.task-metrics {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.task-heading strong {
  font-size: 18px;
}
.task-actions {
  margin: 16px 0;
}
.task-metrics {
  background: #edf5ff;
  padding: 12px;
  margin: 15px 0;
}
.request {
  white-space: pre-wrap;
  color: #496585;
  line-height: 1.7;
}
.hint {
  font-size: 12px;
  color: #96702e;
  line-height: 1.7;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: #f5f8fc;
  padding: 16px;
  border-radius: 7px;
  font:
    13px/1.8 Consolas,
    'Microsoft YaHei',
    monospace;
}
article {
  border-bottom: 1px solid #dce6f2;
  padding: 8px 0;
}
.blocked {
  color: #d9364f;
}
small {
  color: #7286a2;
}
</style>
