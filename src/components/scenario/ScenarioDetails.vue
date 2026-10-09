<script setup lang="ts">
import { computed } from 'vue'
import ResultSection from './ResultSection.vue'
import ResultCard from './ResultCard.vue'
import ClaimList from './ClaimList.vue'
import AdviceList from './AdviceList.vue'
import CitationList from './CitationList.vue'
import { sentimentLabels, type ScenarioDetails } from '../../types/scenario'
/* 六套 details 的分发渲染，按 part 拆成两组：
   analysis —— 模型从材料里识别到的内容（看到了什么）
   output   —— 结论、等级、建议与答复（所以怎么办）
   摘要、风险等级、引用来源和分析局限由 ScenarioResult 负责，不在这里重复。 */
const props = defineProps<{ details: ScenarioDetails; part: 'analysis' | 'output' }>()

const analysis = computed(() => props.part === 'analysis')
const opinion = computed(() => (props.details.type === 'public_opinion' ? props.details : null))
const hot = computed(() => (props.details.type === 'hot_events' ? props.details : null))
const cultural = computed(() => (props.details.type === 'cross_cultural' ? props.details : null))
const ethnic = computed(() => (props.details.type === 'ethnic_governance' ? props.details : null))
const government = computed(() => (props.details.type === 'smart_government' ? props.details : null))
const cyber = computed(() => (props.details.type === 'cyber_security' ? props.details : null))
</script>
<template>
  <div class="details-grid">
    <!-- 舆情：情感倾向是唯一需要单独标签的字段 -->
    <template v-if="opinion">
      <template v-if="analysis">
        <ResultSection title="情感倾向" wide>
          <ResultCard>
            <span class="sentiment" :class="opinion.sentiment">
              {{ sentimentLabels[opinion.sentiment] || '未知' }}
            </span>
            <CitationList
              v-if="opinion.sentimentEvidence?.length"
              :items="opinion.sentimentEvidence"
            />
          </ResultCard>
        </ResultSection>
        <ResultSection title="主要议题"><ClaimList :items="opinion.issues" /></ResultSection>
        <ResultSection title="争议点"><ClaimList :items="opinion.controversies" /></ResultSection>
      </template>
      <ResultSection v-else title="沟通建议" wide
        ><AdviceList :items="opinion.communicationAdvice"
      /></ResultSection>
    </template>

    <!-- 热点：时间轴独占整行；趋势属于结论，放在输出组 -->
    <template v-if="hot">
      <template v-if="analysis">
        <ResultSection title="事件概述" wide>
          <p class="paragraph">{{ hot.eventSummary }}</p>
        </ResultSection>
        <ResultSection title="事件时间轴" wide note="时间取自材料原文，不做转换">
          <ol v-if="hot.timeline?.length" class="timeline">
            <li v-for="(item, index) in hot.timeline" :key="index">
              <span class="time">{{ item.time }}</span>
              <div class="body">
                <p>{{ item.text }}</p>
                <CitationList v-if="item.evidence?.length" :items="item.evidence" />
              </div>
            </li>
          </ol>
          <p v-else class="absent">无</p>
        </ResultSection>
        <ResultSection title="关注焦点"><ClaimList :items="hot.focalPoints" /></ResultSection>
        <ResultSection title="矛盾点"><ClaimList :items="hot.contradictions" /></ResultSection>
        <ResultSection title="信息缺口"><AdviceList :items="hot.informationGaps" /></ResultSection>
      </template>
      <ResultSection v-else title="趋势判断">
        <ClaimList v-if="hot.trend" :items="[hot.trend]" />
        <p v-else class="absent">材料不足，无法判断趋势。</p>
      </ResultSection>
    </template>

    <!-- 跨文化：译文只在传了目标语言时才有值 -->
    <template v-if="cultural">
      <template v-if="analysis">
        <ResultSection title="文化背景"><ClaimList :items="cultural.culturalContexts" /></ResultSection>
        <ResultSection title="歧义点"><ClaimList :items="cultural.ambiguities" /></ResultSection>
      </template>
      <template v-else>
        <ResultSection title="表达建议" wide
          ><AdviceList :items="cultural.expressionSuggestions"
        /></ResultSection>
        <ResultSection
          v-if="cultural.translation"
          title="参考译文"
          wide
          :note="`目标语言 ${cultural.translation.targetLanguage}`"
        >
          <p class="translation">{{ cultural.translation.text }}</p>
        </ResultSection>
      </template>
    </template>

    <!-- 多民族社会治理：全部是论断或建议，没有特殊控件 -->
    <template v-if="ethnic">
      <template v-if="analysis">
        <ResultSection title="主要议题"><ClaimList :items="ethnic.issues" /></ResultSection>
        <ResultSection title="可能的误解点"
          ><ClaimList :items="ethnic.misunderstandings"
        /></ResultSection>
        <ResultSection title="冲突性表达"
          ><ClaimList :items="ethnic.conflictExpressions"
        /></ResultSection>
      </template>
      <ResultSection v-else title="协调建议" wide
        ><AdviceList :items="ethnic.coordinationAdvice"
      /></ResultSection>
    </template>

    <!-- 智能政务：答复是拼接后的正文，资料不足时是固定文案 -->
    <template v-if="government">
      <ResultSection v-if="analysis" title="政策依据">
        <ClaimList :items="government.policyClaims" />
      </ResultSection>
      <template v-else>
        <ResultSection title="办理答复" wide>
          <p class="paragraph">{{ government.answer }}</p>
        </ResultSection>
        <ResultSection title="办理要点" wide>
          <ClaimList :items="government.processingPoints" />
        </ResultSection>
      </template>
    </template>

    <!-- 网络空间安防：全部是论断或建议 -->
    <template v-if="cyber">
      <template v-if="analysis">
        <ResultSection title="风险类型"><ClaimList :items="cyber.riskTypes" /></ResultSection>
        <ResultSection title="可疑迹象"><ClaimList :items="cyber.suspiciousSigns" /></ResultSection>
      </template>
      <ResultSection v-else title="处置建议" wide
        ><AdviceList :items="cyber.handlingAdvice"
      /></ResultSection>
    </template>
  </div>
</template>
<style scoped>
.details-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  margin-bottom: 18px;
}
@media (max-width: 1100px) {
  .details-grid {
    grid-template-columns: 1fr;
  }
}
.paragraph {
  margin: 0;
  padding: 14px 16px;
  border: 1px solid #e3ebfd;
  border-radius: 6px;
  background: #f7faff;
  font-size: 14px;
  line-height: 1.85;
  color: #22314a;
  white-space: pre-wrap;
}
.translation {
  margin: 0;
  padding: 13px 15px;
  border: 1px solid #d9efe4;
  border-radius: 6px;
  background: #f7fcf9;
  font-size: 14px;
  line-height: 1.8;
  color: #1d4436;
}
.sentiment {
  display: inline-block;
  padding: 5px 14px;
  border-radius: 20px;
  background: #eef2f8;
  color: #5b6779;
  font-size: 13px;
  font-weight: 600;
}
.sentiment.positive {
  background: #e8f8f1;
  color: #00a870;
}
.sentiment.negative {
  background: #fdecee;
  color: #e34d59;
}
.sentiment.mixed {
  background: #fef3e8;
  color: #ed7b2f;
}
.sentiment.unknown {
  background: #f2f4f8;
  color: #98a2b3;
}
.timeline {
  list-style: none;
  margin: 0;
  padding: 0 0 0 22px;
  position: relative;
}
.timeline::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 6px;
  bottom: 6px;
  width: 2px;
  background: #dfe7f5;
}
.timeline li {
  position: relative;
  padding-bottom: 16px;
}
.timeline li:last-child {
  padding-bottom: 0;
}
.timeline li::before {
  content: '';
  position: absolute;
  left: -21px;
  top: 5px;
  width: 9px;
  height: 9px;
  border: 2px solid #2b6cf6;
  border-radius: 50%;
  background: #fff;
}
.time {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12px;
  font-weight: 600;
  color: #2b6cf6;
}
.timeline p {
  margin: 2px 0 0;
  font-size: 13.5px;
  color: #22314a;
}
.absent {
  margin: 0;
  font-size: 13px;
  color: #96a1b3;
}
</style>
