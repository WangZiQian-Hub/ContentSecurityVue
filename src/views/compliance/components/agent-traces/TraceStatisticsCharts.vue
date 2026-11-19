<script setup lang="ts">
import { computed } from 'vue'
import type { BarSeriesOption } from 'echarts'
import PanelCard from '../../../../components/PanelCard.vue'
import TraceStatisticChart from './TraceStatisticChart.vue'
import type { AgentTraceStatisticsWorkspace } from '../../../../types/agent-trace-statistics'
import {
  donutOption,
  rankingOption,
  durationOption,
  statisticNumber as num,
  statisticSeconds as seconds,
  statisticColors,
} from '../../../../utils/agent-trace-statistics'
const props = defineProps<{ data: AgentTraceStatisticsWorkspace }>()
const c = computed(() => props.data.charts)
const recordedReasoning = computed(() => c.value.tokenComposition.components.find(
  part => part.code.replaceAll('_', '').toLowerCase() === 'reasoningrecorded',
))
const tokenParts = computed(() => {
  const parts = c.value.tokenComposition.components
  const input = parts.find(p => p.code === 'input')?.count || 0
  // The source projection already separates reasoning from final output.
  const output = parts.filter(p => ['reasoningrecorded', 'finaloutput'].includes(p.code.replaceAll('_', '').toLowerCase()))
    .reduce((sum, p) => sum + (p.count || 0), 0)
  const total = input + output
  return [
    { code: 'input', label: '输入 Token', count: input },
    { code: 'output', label: '输出 Token', count: output },
  ].map(p => ({ ...p, ratioPercent: total ? p.count / total * 100 : 0 }))
})
const tokenChartOption = computed(() => {
  const option = rankingOption({
    availability: c.value.tokenComposition.availability,
    totalCallCount: c.value.tokenComposition.totalRecorded || 0,
    toolTypeCount: tokenParts.value.length,
    rankingOrder: 'source',
    items: tokenParts.value.map(part => ({ toolCode: part.code, label: part.label, count: part.count, isOther: false })),
  })
  const series = (option.series as BarSeriesOption[])[0]!
  series.data = tokenParts.value.map((part, i) => ({
    value: part.count,
    itemStyle: { color: ['#4381ff', '#35aa93'][i] },
  }))
  series.label = {
    ...series.label,
    formatter: params => {
      const part = tokenParts.value[params.dataIndex]
      return part ? `${num(part.count)}（${num(part.ratioPercent, 1)}%）` : ''
    },
  }
  option.grid = { left: 8, right: 180, top: 16, bottom: 30, containLabel: true }
  return option
})
const matrixRows = computed(() => c.value.behaviorMatrix.rows.filter(r => r.categoryCode !== 'normal' && r.label !== '正常任务'))
const behaviorLabel = (code: string, fallback: string) => ({ unauthorized: '权限异常', policy_denied: '调用被拦截', argument_error: '参数错误', timeout: '调用超时', duplicate: '重复请求', retry: '调用重试' } as Record<string, string>)[code] || fallback
const coverageFields = [
  { key: 'source', label: '来源定位', help: '可定位到导入文件和原始记录。' },
  { key: 'time', label: '任务耗时', help: '提供了任务总耗时，可用于运行时长统计。' },
  { key: 'reasoning', label: '推理 Token 用量', help: '提供了推理 Token 数量，不代表提供了完整推理文本。' },
] as const
const maxCell = computed(() =>
  Math.max(
    1,
    ...matrixRows.value.flatMap((r) => r.cells.map((cell) => cell.count || 0)),
  ),
)
const available = (s: string) => ['available', 'partial'].includes(s)
</script>
<template>
  <div class="ats-primary-grid">
    <PanelCard class="ats-token-panel" :title="`Token 组成分布（共 ${num(c.tokenComposition.totalRecorded)}）`">
      <template
        v-if="available(c.tokenComposition.availability) && c.tokenComposition.mutuallyExclusive"
      >
        <TraceStatisticChart
          :option="tokenChartOption"
          :style="{ height: '200px', marginBottom: '20px' }"
          label="输入与输出 Token 数量"
        />
        <div class="ats-token-legend">
          <div v-for="(part, i) in tokenParts" :key="part.code">
            <i :style="{ background: ['#4381ff', '#35aa93'][i] }" />{{
              part.label
            }}：<b>{{ num(part.count) }}</b
            >（{{ num(part.ratioPercent, 1) }}%）
          </div>
          <div title="已包含在输出 Token 中">
            <i style="background: #78b8fb" />已记录推理 Token：<b>{{ num(recordedReasoning?.count) }}</b>
            <span>（{{ num(recordedReasoning?.ratioPercent, 1) }}%）</span>
          </div>
        </div>
        <small :title="c.tokenComposition.normalizedPolicy"
          >输出 Token 包含已记录推理与最终输出；仅统计已提供的用量。</small
        > </template
      ><el-empty
        v-else
        :description="c.tokenComposition.reason || 'Token 不可相加或未提供'"
        :image-size="45"
      />
    </PanelCard>
    <PanelCard class="ats-tools-panel" :title="`工具调用情况（共 ${c.toolRanking.totalCallCount} 次）`">
      <div
        v-if="available(c.toolRanking.availability) && c.toolRanking.items.length"
        class="ats-ranking-with-total"
      >
        <TraceStatisticChart
          v-if="available(c.toolRanking.availability) && c.toolRanking.items.length"
          :option="rankingOption(c.toolRanking)"
          :style="{ height: `${Math.max(320, c.toolRanking.items.length * 34 + 48)}px` }"
          label="各工具调用次数"
        />
        <aside class="ats-tool-total">
          <strong>工具调用总计</strong><b>{{ num(c.toolRanking.totalCallCount) }}</b>
        </aside>
      </div>
      <el-empty
        v-else
        :description="c.toolRanking.reason || '当前范围暂无工具调用'"
        :image-size="45"
      />
    </PanelCard>
  </div>
  <div class="ats-secondary-grid">
    <PanelCard title="任务运行时长分布">
      <small
        >有效 {{ c.durationDistribution.validCount }} 条 / 缺失
        {{ c.durationDistribution.missingCount }} 条 / 异常
        {{ c.durationDistribution.invalidCount }} 条</small
      >
      <div v-if="available(c.durationDistribution.availability)" class="ats-duration">
        <TraceStatisticChart
          :option="durationOption(c.durationDistribution)"
          label="任务运行时长分桶，单位秒"
        />
        <aside>
          <div>
            P50<b>{{ seconds(c.durationDistribution.p50Ms) }}</b>
          </div>
          <div>
            P95<b>{{ seconds(c.durationDistribution.p95Ms) }}</b>
          </div>
        </aside>
      </div>
      <el-empty
        v-else
        :description="c.durationDistribution.reason || '时长未提供'"
        :image-size="45"
      />
    </PanelCard>
    <PanelCard :title="`工具调用结果分布（共 ${c.toolResultDistribution.terminalCount} 次）`">
      <div
        v-if="
          available(c.toolResultDistribution.availability) && c.toolResultDistribution.terminalCount
        "
        class="ats-donut-pair ats-result-pair"
      >
        <TraceStatisticChart
          v-if="
            available(c.toolResultDistribution.availability) &&
            c.toolResultDistribution.terminalCount
          "
          :option="
            donutOption(
              c.toolResultDistribution,
              c.toolResultDistribution.terminalCount,
              ['#60c68a', '#ed7086', '#ffc447'],
              { centerLabel: '总调用' },
            )
          "
          label="工具调用终态分布"
        />
        <div class="ats-donut-legend">
          <div v-for="(item, i) in c.toolResultDistribution.items" :key="item.code">
            <i :style="{ background: ['#60c68a', '#ed7086', '#ffc447'][i] }" /><span
              >{{ item.label }}：</span
            ><b>{{ num(item.count) }}</b
            ><b>（{{ item.ratioPercent?.toFixed(2) ?? '—' }}%）</b>
          </div>
        </div>
      </div>
      <el-empty v-else description="暂无工具终态数据" :image-size="45" />
      <small
        v-if="c.toolResultDistribution.nonTerminalCount || c.toolResultDistribution.unknownCount"
        >处理中 {{ c.toolResultDistribution.nonTerminalCount }}；未知
        {{ c.toolResultDistribution.unknownCount }}</small
      >
    </PanelCard>
    <PanelCard title="风险类别与关键行为">
      <div class="ats-matrix-scroll">
      <table v-if="available(c.behaviorMatrix.availability) && matrixRows.length" class="ats-matrix">
        <thead>
          <tr>
            <th class="ats-matrix-axis">风险类别<span>／关键行为</span></th>
            <th v-for="col in c.behaviorMatrix.columns" :key="col.code">{{ behaviorLabel(col.code, col.label) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in matrixRows" :key="row.categoryCode">
            <th>{{ row.label }}</th>
            <td
              v-for="cell in row.cells"
              :key="cell.behaviorCode"
              tabindex="0"
              :style="{
                background:
                  cell.count === null
                    ? '#f5f6f8'
                    : `rgba(22,119,255,${0.04 + (cell.count / maxCell) * 0.35})`,
              }"
              :title="`${row.label} / ${c.behaviorMatrix.columns.find((col) => col.code === cell.behaviorCode)?.label}：${num(cell.count)}次；事件可重叠`"
            >
              {{ num(cell.count) }}
            </td>
          </tr>
        </tbody>
      </table>
      <el-empty
        v-else
        :description="c.behaviorMatrix.reason || '暂无带风险类别标签的样本，正常任务不进入此矩阵'"
        :image-size="45"
      />
      </div>
      <small class="ats-matrix-note">行：测试集风险类别（不含正常任务）；列：实际记录的关键行为。按调用去重计次，同一次调用可命中多列；不是风险样本数。</small>
    </PanelCard>
    <PanelCard :title="`来源与语言分布（共 ${data.listCounts.all} 样本）`"
      ><div class="ats-distributions">
        <div v-for="(distribution, i) in [c.sourceDistribution, c.languageDistribution]" :key="i">
          <strong>{{ i ? '样本语言' : '接入来源' }}</strong
          ><template v-if="available(distribution.availability)"
            ><div
              v-for="r in distribution.items.filter((row) => row.count !== 0)"
              :key="r.code"
              class="ats-distribution"
            >
              <div>
                {{ r.label }} <b>{{ num(r.count) }}（{{ num(r.ratioPercent, 1) }}%）</b>
              </div>
              <el-progress :percentage="r.ratioPercent || 0" :show-text="false" color="#91befa" />
            </div>
            <small v-if="!distribution.denominator">暂无数据</small></template
          ><small v-else>{{ distribution.reason || '未提供' }}</small>
        </div>
      </div></PanelCard
    >
  </div>
  <section class="ats-completeness">
    <header><strong>轨迹字段覆盖情况</strong><small>统计有多少条样本提供了对应字段，不代表安全评分或证据可信度。</small></header>
    <div class="ats-coverage-grid">
      <article v-for="field in coverageFields" :key="field.key" class="ats-coverage-card">
        <div class="ats-coverage-heading"><b>{{ field.label }}</b><span>{{ data.completeness[field.key].ratePercent == null ? '不适用' : `${num(data.completeness[field.key].ratePercent, 1)}%` }}</span></div>
        <p>已提供 <strong>{{ data.completeness[field.key].availableCount }}</strong> / {{ data.completeness[field.key].applicableCount }} 条样本</p>
        <el-progress :percentage="data.completeness[field.key].ratePercent || 0" :show-text="false" :stroke-width="6" />
        <small>{{ field.help }}</small>
        <span class="ats-coverage-missing">缺失 {{ data.completeness[field.key].missingCount }} 条 · 无效 {{ data.completeness[field.key].invalidCount }} 条<template v-if="data.completeness[field.key].notApplicableCount"> · 不适用 {{ data.completeness[field.key].notApplicableCount }} 条</template></span>
      </article>
    </div>
  </section>
</template>
