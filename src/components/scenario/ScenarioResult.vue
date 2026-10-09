<script setup lang="ts">
import { computed } from 'vue'
import PanelCard from '../PanelCard.vue'
import RiskBadge from './RiskBadge.vue'
import ResultSection from './ResultSection.vue'
import AdviceList from './AdviceList.vue'
import CitationList from './CitationList.vue'
import ScenarioDetails from './ScenarioDetails.vue'
import type { ScenarioMaterial, ScenarioOutcome } from '../../types/scenario'
/* 结果容器，结构为「结论速览 + 输入 → 分析 → 输出」：
   结论速览：文档把 summary 定义为「本次材料分析摘要」，是整体结论，所以放最前面，
             风险等级是同一层级的信息，一起展示。
   ① 输入原文：提交的正文与参考材料（引用里的 source_id 指向这里）
   ② 分析过程：模型从材料中识别到的内容，附引用来源与分析局限
   ③ 输出结果：原始回答、场景结论与建议
   回看历史记录时正文来自保存的请求快照（记录里的 input），而不是当前输入框。 */
const props = defineProps<{ outcome: ScenarioOutcome }>()

const llm = computed(() => (props.outcome.mode === 'llm' ? props.outcome : null))
const backend = computed(() => (props.outcome.mode === 'backend' ? props.outcome : null))
const record = computed(() => llm.value?.record ?? null)
const result = computed(() => llm.value?.result ?? null)
/** result 为 null 说明这条记录没有可用结果，但要区分两种原因：
 *  failed 是已执行失败，running 是尚未完成（文档第 325 行：进程异常终止可能遗留 running）。
 *  把 running 当成失败显示会让用户误以为出了问题。 */
const incomplete = computed(() => (record.value && !result.value ? record.value : null))
const isRunning = computed(() => incomplete.value?.status === 'running')
const failed = computed(() => (incomplete.value && !isRunning.value ? incomplete.value : null))

/** 保存的请求快照：正文与参考材料。 */
const savedInput = computed<Record<string, unknown>>(() => record.value?.input ?? {})
const sourceText = computed(() => {
  const value = savedInput.value.content
  return typeof value === 'string' ? value : ''
})
const sourceMaterials = computed<ScenarioMaterial[]>(() => {
  const value = savedInput.value.materials
  return Array.isArray(value) ? (value as ScenarioMaterial[]) : []
})
const hasSource = computed(() => Boolean(sourceText.value.trim() || sourceMaterials.value.length))

/** 模型完整回答，对应记录里的 original_output。
 *  文档第 281 行说明该字段目前只用于生成治理、场景分析为 null；
 *  一旦模型服务开始返回原始回答，这里会自动显示，不需要改动其他代码。 */
const rawAnswer = computed(() => {
  const value = record.value?.originalOutput
  return typeof value === 'string' && value.trim() ? value : ''
})
</script>
<template>
  <!-- 业务后端模式：只带回通用任务，没有分析结果字段 -->
  <PanelCard v-if="backend" title="分析结果" icon="DataAnalysis">
    <template #extra><el-tag type="info" effect="plain">业务后端模式</el-tag></template>
    <p class="notice info">
      当前走业务后端的统一能力入口，该接口只返回任务状态，不返回摘要、风险等级与场景详情。
      完整的场景分析结果需要模型服务模式。
    </p>
    <el-descriptions :column="2" border size="small">
      <el-descriptions-item label="任务 ID">{{ backend.task.taskId }}</el-descriptions-item>
      <el-descriptions-item label="状态">{{ backend.task.status }}</el-descriptions-item>
    </el-descriptions>
    <details class="raw">
      <summary>查看接口返回结果</summary>
      <pre>{{ backend.task }}</pre>
    </details>
  </PanelCard>

  <PanelCard v-else title="分析结果" icon="DataAnalysis">
    <template #extra>
      <span v-if="record" class="meta">记录 {{ record.id }} · {{ record.elapsedMs }} ms</span>
    </template>

    <!-- 尚未完成：文档允许记录停留在 running，这里不能当成失败 -->
    <div v-if="isRunning" class="notice info">
      <b>分析正在进行中。</b>
      <p>这条记录还没有产生结果，稍后刷新「场景分析记录」即可查看。</p>
    </div>

    <!-- 已执行但失败：把失败阶段和记录 ID 交代清楚，不让用户以为只是网络错误 -->
    <div v-if="failed" class="notice error">
      <b>分析未完成，记录已保存。</b>
      <p>{{ failed.errorMessage || '模型服务未返回结果。' }}</p>
      <ul>
        <li>失败阶段：{{ failed.stage || '未知' }}</li>
        <li v-if="failed.errorCode">错误类型：{{ failed.errorCode }}</li>
        <li v-if="failed.upstreamStatus">上游状态：{{ failed.upstreamStatus }}</li>
      </ul>
      <p>可在下方「场景分析记录」中查看这条记录。</p>
    </div>

    <!-- 结论速览：整体结论先行，风险等级与资料不足的提示都归在这里 -->
    <section v-if="result" class="verdict">
      <div class="verdict-head"><span class="bar"></span>结论速览</div>
      <div class="verdict-body">
        <p class="verdict-text">{{ result.summary }}</p>
        <RiskBadge :level="result.riskLevel" />
      </div>
      <p v-if="result.insufficientMaterials" class="notice warn verdict-notice">
        资料不足，风险等级为未知，结论不可用。请补充材料后重新分析。
      </p>
    </section>

    <!-- ① 输入原文 -->
    <section v-if="hasSource" class="group">
      <h3 class="group-title">
        <span class="num">1</span>输入原文<small>引用中的 source_id 对应这里</small>
      </h3>
      <p v-if="sourceText" class="source-text">{{ sourceText }}</p>
      <div v-if="sourceMaterials.length" class="source-materials">
        <p class="source-materials-title">参考材料 {{ sourceMaterials.length }} 条</p>
        <article v-for="item in sourceMaterials" :key="item.id" class="source-material">
          <div class="source-material-head">
            <span class="source-id">{{ item.id }}</span>
            <span v-if="item.title" class="source-title">{{ item.title }}</span>
            <span v-if="item.time" class="source-time">{{ item.time }}</span>
          </div>
          <p class="source-material-text">{{ item.content }}</p>
        </article>
      </div>
    </section>

    <template v-if="result">
      <!-- ② 分析过程 -->
      <section class="group">
        <h3 class="group-title">
          <span class="num">2</span>分析过程<small>模型从材料中识别到的内容</small>
        </h3>
        <ScenarioDetails :details="result.details" part="analysis" />
        <div class="two-column">
          <ResultSection title="引用来源" note="source_id 为 input 时表示请求正文">
            <CitationList v-if="result.evidence?.length" :items="result.evidence" />
            <p v-else class="absent">无</p>
          </ResultSection>
          <ResultSection title="分析局限"><AdviceList :items="result.limitations" /></ResultSection>
        </div>
      </section>

      <!-- ③ 输出结果 -->
      <section class="group">
        <h3 class="group-title">
          <span class="num">3</span>输出结果<small>原始回答、场景结论与建议</small>
        </h3>
        <ResultSection
          v-if="rawAnswer"
          title="模型完整回答"
          note="模型输出的原文，未做结构化处理"
        >
          <p class="source-text">{{ rawAnswer }}</p>
        </ResultSection>
        <ScenarioDetails :details="result.details" part="output" />
        <!-- 备注用文档原话。文档只说 recommendations 是「建议，不表示已执行」，
             没有说明它和场景专属建议（communication_advice 等）的分工，
             所以这里不写「通用」之类文档没有的限定词。 -->
        <ResultSection title="建议" note="不表示已执行">
          <AdviceList :items="result.recommendations" />
        </ResultSection>
      </section>
    </template>
  </PanelCard>
</template>
<style scoped>
/* 结论速览：抬头的整体结论，样式上独立于三个编号分组 */
.verdict {
  margin-bottom: 26px;
  padding: 16px 18px;
  border: 1px solid #d8e5fb;
  border-radius: 8px;
  background: linear-gradient(96deg, #f2f7ff, #fbfdff);
}
.verdict-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: #2c3a4f;
  font-size: 13px;
  font-weight: 600;
}
.verdict-head .bar {
  width: 3px;
  height: 13px;
  border-radius: 2px;
  background: #2b6cf6;
}
.verdict-body {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}
.verdict-text {
  margin: 0;
  color: #22314a;
  font-size: 15px;
  line-height: 1.7;
}
.verdict-notice {
  margin: 12px 0 0;
}
/* 三段之间的分隔：编号 + 分隔线，让输入/过程/输出一眼分得开 */
.group {
  margin-bottom: 26px;
}
.group:last-child {
  margin-bottom: 0;
}
.group-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid #eef1f6;
  color: #1b3358;
  font-size: 15px;
  font-weight: 600;
}
.group-title .num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #2b6cf6;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}
.group-title small {
  color: #96a1b3;
  font-size: 12px;
  font-weight: 400;
}
/* 输入原文与模型完整回答共用同一套文本框样式 */
.source-text {
  margin: 0;
  max-height: 240px;
  overflow: auto;
  padding: 13px 15px;
  border: 1px solid #e5e9f2;
  border-radius: 6px;
  background: #fafbfd;
  color: #22314a;
  font-size: 13.5px;
  line-height: 1.8;
  white-space: pre-wrap;
}
.source-materials {
  margin-top: 12px;
}
.source-materials-title {
  margin: 0 0 8px;
  color: #7d91b0;
  font-size: 12.5px;
}
.source-material {
  margin-bottom: 8px;
  padding: 10px 13px;
  border: 1px solid #e5e9f2;
  border-left: 3px solid #c9d8f5;
  border-radius: 6px;
  background: #fbfcfe;
}
.source-material:last-child {
  margin-bottom: 0;
}
.source-material-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.source-id {
  padding: 1px 6px;
  border-radius: 4px;
  background: #eef2f9;
  color: #5b7295;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 11px;
}
.source-title {
  color: #2c3a4f;
  font-size: 13px;
  font-weight: 600;
}
.source-time {
  color: #2b6cf6;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
}
.source-material-text {
  margin: 0;
  max-height: 160px;
  overflow: auto;
  color: #5b6779;
  font-size: 13px;
  line-height: 1.75;
  white-space: pre-wrap;
}
.two-column {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}
@media (max-width: 1100px) {
  .two-column {
    grid-template-columns: 1fr;
  }
}
.meta {
  color: #96a1b3;
  font-size: 12px;
}
.notice {
  margin: 0 0 16px;
  padding: 11px 14px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.7;
  border: 1px solid #e6e9f0;
  background: #f6f7fa;
  color: #6b7686;
}
.notice b {
  display: block;
  margin-bottom: 4px;
  font-size: 13.5px;
}
.notice p {
  margin: 0;
}
.notice ul {
  margin: 6px 0 0;
  padding-left: 18px;
}
.notice.info {
  border-color: #d3e2fb;
  background: #f0f6ff;
  color: #3a5f9e;
}
.notice.warn {
  border-color: #f5e2b0;
  background: #fff8e6;
  color: #8a6416;
}
.notice.error {
  border-color: #f8c9ce;
  background: #fdecee;
  color: #a8343f;
}
.absent {
  margin: 0;
  color: #96a1b3;
  font-size: 13px;
}
.raw {
  margin-top: 14px;
}
.raw summary {
  cursor: pointer;
  color: #2b6cf6;
  font-size: 13px;
}
.raw pre {
  overflow: auto;
  max-height: 320px;
  margin: 8px 0 0;
  padding: 12px;
  border: 1px solid #e5e9f2;
  border-radius: 6px;
  background: #fbfcfe;
  font-size: 12px;
  line-height: 1.6;
}
</style>
