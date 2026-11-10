import type { EChartsOption } from 'echarts'
import type {
  AgentTraceDistribution,
  AgentTraceStatisticsCharts,
  AgentTraceMetric,
} from '../types/agent-trace-statistics'
export const statisticColors = ['#5278ff', '#39c7d9', '#85cf34', '#ffcc45', '#89b7f2', '#b68af0']
export const statisticNumber = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined
    ? '未提供'
    : n.toLocaleString('zh-CN', { maximumFractionDigits: digits })
export const statisticMetric = (m: AgentTraceMetric) =>
  m.availability === 'not_applicable'
    ? '不适用'
    : m.availability === 'unavailable'
      ? '未提供'
      : statisticNumber(m.value, 2) + (m.unit === 'percent' && m.value !== null ? '%' : '')
export const statisticSeconds = (n: number | null | undefined) =>
  n === null || n === undefined ? '未提供' : `${(n / 1000).toFixed(1)} s`
export const statisticStatus = (s: string) =>
  ({
    completed: '成功完成',
    blocked: '风险拦截',
    terminated: '流程终止',
    running: '处理中',
    pending: '处理中',
    failed: '执行失败',
    unknown: '未知',
  })[s] || '未知'
export const statisticStatusType = (s: string): 'success' | 'danger' | 'info' | 'warning' =>
  s === 'completed'
    ? 'success'
    : ['blocked', 'failed'].includes(s)
      ? 'danger'
      : ['pending', 'running'].includes(s)
        ? 'warning'
        : 'info'
export function donutOption(
  d: AgentTraceDistribution,
  total: number,
  colors = statisticColors,
  layout?: { percentage?: boolean; centerLabel: string },
): EChartsOption {
  const items = d.items.filter((r) => r.count !== null && r.count > 0)
  return {
    animation: false,
    color: colors,
    tooltip: { trigger: 'item', renderMode: 'richText' },
    title: {
      text: layout ? `{value|${total}}\n{caption|${layout.centerLabel}}` : String(total),
      subtext: layout ? '' : '总计',
      left: layout ? '50%' : '25%',
      top: layout ? 'middle' : '38%',
      padding: layout ? 0 : 5,
      textAlign: 'center',
      itemGap: layout ? 2 : 10,
      textStyle: {
        fontSize: 28,
        color: '#10274b',
        rich: layout
          ? {
              value: {
                fontSize: 26,
                fontWeight: 700,
                lineHeight: 30,
                color: '#10274b',
                align: 'center',
              },
              caption: {
                fontSize: 12,
                fontWeight: 400,
                lineHeight: 18,
                color: '#64799a',
                align: 'center',
              },
            }
          : undefined,
      },
      subtextStyle: { color: '#526b8d', fontSize: 13 },
    },
    legend: {
      show: !layout,
      orient: 'vertical',
      right: 0,
      top: 'middle',
      itemWidth: 11,
      itemHeight: 11,
      textStyle: { fontSize: 12, color: '#334b6d' },
      formatter: (name) => {
        const item = d.items.find((i) => i.label === name)
        return `${name}   ${statisticNumber(item?.count)}  (${statisticNumber(item?.ratioPercent, 2)}%)`
      },
    },
    series: [
      {
        type: 'pie',
        radius: layout ? ['48%', '78%'] : ['43%', '66%'],
        center: layout ? ['50%', '50%'] : ['26%', '52%'],
        label: {
          show: !!layout?.percentage,
          position: 'outside',
          formatter: '{d}%',
          fontSize: 12,
          color: '#334b6d',
          fontWeight: 600,
        },
        labelLine: { show: !!layout?.percentage, length: 5, length2: 4 },
        data: items.map((i) => ({ name: i.label, value: i.count! })),
        emphasis: { label: { show: true, formatter: '{d}%' } },
      },
    ],
  }
}
export function rankingOption(d: AgentTraceStatisticsCharts['toolRanking']): EChartsOption {
  return {
    animation: false,
    grid: { left: 8, right: 40, top: 12, bottom: 25, containLabel: true },
    tooltip: { trigger: 'axis', renderMode: 'richText' },
    xAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#edf3fb' } } },
    yAxis: {
      type: 'category',
      inverse: true,
      data: d.items.map((i) => i.label),
      axisLabel: { interval: 0, fontSize: 11, margin: 10 },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 17,
        itemStyle: { color: '#4381ff', borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right' },
        data: d.items.map((i) => i.count),
      },
    ],
  }
}
export function durationOption(
  d: AgentTraceStatisticsCharts['durationDistribution'],
): EChartsOption {
  return {
    animation: false,
    grid: { left: 35, right: 8, top: 25, bottom: 30 },
    tooltip: { trigger: 'axis', renderMode: 'richText' },
    xAxis: {
      type: 'category',
      data: d.buckets.map((b) => b.label),
      axisLabel: { fontSize: 10, interval: 0 },
      axisTick: { show: false },
    },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#edf3fb' } } },
    series: [
      {
        type: 'bar',
        barMaxWidth: 29,
        label: { show: true, position: 'top', fontSize: 11 },
        itemStyle: { color: '#79b4fa', borderRadius: [3, 3, 0, 0] },
        data: d.buckets.map((b) => b.count),
      },
    ],
  }
}
/** Tokenizes text only; Vue escapes each token. Never injects source HTML. */
export function jsonLineTokens(line: string) {
  return (
    line.match(
      /"(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[^"\d-]+|./g,
    ) || []
  ).map((text) => ({
    text,
    kind: /^".*:\s*$/.test(text)
      ? 'key'
      : text.startsWith('"')
        ? 'string'
        : /^(true|false|null)$/.test(text)
          ? 'literal'
          : /^-?\d/.test(text)
            ? 'number'
            : 'plain',
  }))
}
