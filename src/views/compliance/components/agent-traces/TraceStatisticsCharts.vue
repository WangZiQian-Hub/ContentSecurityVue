<script setup lang="ts">
import { computed } from 'vue'
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
const maxCell = computed(() =>
  Math.max(
    1,
    ...c.value.behaviorMatrix.rows.flatMap((r) => r.cells.map((cell) => cell.count || 0)),
  ),
)
const available = (s: string) => ['available', 'partial'].includes(s)
</script>
<template>
  <div class="ats-primary-grid">
    <PanelCard :title="`测试集类别分布（单标签 / ${data.listCounts.all}）`">
      <small>测试标签，不代表检出风险</small>
      <div
        v-if="available(c.testCategoryDistribution.availability) && data.listCounts.all"
        class="ats-donut-pair ats-category-pair"
      >
        <TraceStatisticChart
          v-if="available(c.testCategoryDistribution.availability) && data.listCounts.all"
          :option="
            donutOption(c.testCategoryDistribution, data.listCounts.all, statisticColors, {
              percentage: true,
              centerLabel: '总样本',
            })
          "
          label="测试集类别数量与占比"
        />
        <div class="ats-donut-legend">
          <div v-for="(item, i) in c.testCategoryDistribution.items" :key="item.code">
            <i :style="{ background: statisticColors[i % statisticColors.length] }" /><span>{{
              item.label
            }}</span
            ><b>{{ num(item.count) }}</b
            ><b>（{{ item.ratioPercent?.toFixed(1) ?? '—' }}%）</b>
          </div>
        </div>
      </div>
      <el-empty
        v-else
        :description="c.testCategoryDistribution.reason || '当前范围暂无样本'"
        :image-size="45"
      />
    </PanelCard>
    <PanelCard :title="`Token 组成分布（共 ${num(c.tokenComposition.totalRecorded)}）`">
      <template
        v-if="available(c.tokenComposition.availability) && c.tokenComposition.mutuallyExclusive"
      >
        <div class="ats-token-stack">
          <div
            v-for="(part, i) in c.tokenComposition.components"
            :key="part.code"
            :style="{ flex: part.count || 0, background: ['#378fff', '#78b8fb', '#60c68a'][i] }"
            :title="`${part.label}：${num(part.count)}；覆盖 ${part.validSampleCount}/${part.eligibleSampleCount}`"
          >
            <b>{{ num(part.count) }}</b
            ><span>{{ num(part.ratioPercent, 1) }}%</span>
          </div>
        </div>
        <div class="ats-token-legend">
          <div v-for="(part, i) in c.tokenComposition.components" :key="part.code">
            <i :style="{ background: ['#378fff', '#78b8fb', '#60c68a'][i] }" />{{
              part.label
            }}：<b>{{ num(part.count) }}</b
            >（{{ num(part.ratioPercent, 1) }}%）
          </div>
        </div>
        <small :title="c.tokenComposition.normalizedPolicy"
          >{{
            data.completeness.reasoning.missingCount
          }}
          条未提供推理字段；仅汇总可拆分的已记录分量。</small
        > </template
      ><el-empty
        v-else
        :description="c.tokenComposition.reason || 'Token 不可相加或未提供'"
        :image-size="45"
      />
    </PanelCard>
    <PanelCard :title="`工具调用排行（共 ${c.toolRanking.totalCallCount} 次）`">
      <div
        v-if="available(c.toolRanking.availability) && c.toolRanking.items.length"
        class="ats-ranking-with-total"
      >
        <TraceStatisticChart
          v-if="available(c.toolRanking.availability) && c.toolRanking.items.length"
          :option="rankingOption(c.toolRanking)"
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
    <PanelCard title="行为矩阵（风险类别 × 关键行为，单位：次）">
      <table v-if="available(c.behaviorMatrix.availability)" class="ats-matrix">
        <thead>
          <tr>
            <th>风险类别</th>
            <th v-for="col in c.behaviorMatrix.columns" :key="col.code">{{ col.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in c.behaviorMatrix.rows" :key="row.categoryCode">
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
        :description="c.behaviorMatrix.reason || '未采集行为数据'"
        :image-size="45"
      />
      <small>按事件类型计数，可重叠；类别为测试标签。</small>
    </PanelCard>
    <PanelCard :title="`来源与语言分布（共 ${data.listCounts.all} 样本）`"
      ><div class="ats-distributions">
        <div v-for="(distribution, i) in [c.sourceDistribution, c.languageDistribution]" :key="i">
          <strong>{{ i ? '样本语言' : '轨迹来源（调用场景）' }}</strong
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
  <div class="ats-completeness">
    <strong>证据完整性与质量 <small>（轨迹字段可用率）</small></strong>
    <div
      v-for="(key, i) in ['source', 'time', 'reasoning'] as const"
      :key="key"
      :title="`缺失 ${data.completeness[key].missingCount}；无效 ${data.completeness[key].invalidCount}；不适用 ${data.completeness[key].notApplicableCount}`"
    >
      <span
        >{{ ['来源', '时间', '已记录推理字段'][i] }}：{{ data.completeness[key].availableCount }} /
        {{ data.completeness[key].applicableCount }}（{{
          num(data.completeness[key].ratePercent, 1)
        }}%）</span
      ><el-progress
        :percentage="data.completeness[key].ratePercent || 0"
        :show-text="false"
        :stroke-width="9"
      />
    </div>
  </div>
</template>
