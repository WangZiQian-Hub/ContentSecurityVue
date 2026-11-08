import type { AgentTraceStatisticsWorkspace } from '../types/agent-trace-statistics'
import {
  donutOption,
  rankingOption,
  durationOption,
  statisticNumber,
  statisticStatus,
} from './agent-trace-statistics'
/** Fixed, data-only mock renderer. No HTML input and no network resource loading. */
export async function statisticsPng(w: AgentTraceStatisticsWorkspace): Promise<Blob> {
  const { init } = await import('echarts')
  const canvas = document.createElement('canvas')
  canvas.width = 1800
  canvas.height = 1100
  const context = canvas.getContext('2d')
  if (!context) throw new Error('PNG 画布不可用')
  const ctx = context
  ctx.fillStyle = '#f4f8ff'
  ctx.fillRect(0, 0, 1800, 1100)
  const text = (value: string, x: number, y: number, size = 18) => {
    ctx.fillStyle = '#17345c'
    ctx.font = `${size}px Microsoft YaHei,sans-serif`
    ctx.fillText(value, x, y)
  }
  text('智能体轨迹审计 · 统计指标', 25, 40, 28)
  text(`${w.scope?.batchId} · ${w.scope?.snapshotId} · ${w.scope?.language}`, 25, 70, 14)
  const names = [
    '样本',
    '检出风险样本',
    '已记录 Token',
    '推理/输出比',
    '工具调用',
    '工具种类',
    '平均步骤',
    '任务成功率',
  ]
  Object.values(w.kpis).forEach((m, i) => {
    text(names[i], 25 + i * 220, 110)
    text(statisticNumber(m.value, 2) + (m.unit === 'percent' ? '%' : ''), 25 + i * 220, 146, 26)
  })
  async function draw(
    option: Parameters<ReturnType<typeof init>['setOption']>[0],
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
  ) {
    ctx.fillStyle = '#fff'
    ctx.fillRect(x, y, width, height)
    text(title, x + 10, y + 25, 18)
    const el = document.createElement('div')
    el.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height - 40}px`
    document.body.append(el)
    const chart = init(el, undefined, { width, height: height - 40 })
    try {
      chart.setOption(option)
      const image = new Image()
      image.src = chart.getDataURL({ pixelRatio: 1, backgroundColor: '#fff' })
      await image.decode()
      ctx.drawImage(image, x, y + 40)
    } finally {
      chart.dispose()
      el.remove()
    }
  }
  await draw(
    donutOption(w.charts.testCategoryDistribution, w.listCounts.all),
    20,
    175,
    570,
    260,
    '测试集类别分布（单标签）',
  )
  await draw(rankingOption(w.charts.toolRanking), 1210, 175, 570, 260, '工具调用排行')
  text('Token 组成分布（已记录）', 620, 205)
  let offset = 620
  w.charts.tokenComposition.components.forEach((c, i) => {
    const width = (c.ratioPercent || 0) * 5.5
    ctx.fillStyle = ['#328bff', '#7cb7fa', '#61c48a'][i]
    ctx.fillRect(offset, 235, width, 48)
    offset += width
    text(
      `${c.label}：${statisticNumber(c.count)} (${statisticNumber(c.ratioPercent, 2)}%)`,
      620,
      320 + i * 32,
    )
  })
  await draw(
    durationOption(w.charts.durationDistribution),
    20,
    455,
    420,
    250,
    `运行时长 · 有效 ${w.charts.durationDistribution.validCount}`,
  )
  await draw(
    donutOption(w.charts.toolResultDistribution, w.charts.toolResultDistribution.terminalCount, [
      '#60c68b',
      '#ee7187',
      '#ffc445',
    ]),
    450,
    455,
    430,
    250,
    '工具调用结果',
  )
  text('行为矩阵（事件次数，可重叠）', 900, 480)
  w.charts.behaviorMatrix.rows.forEach((r, i) =>
    text(
      `${r.label}    ${r.cells.map((c) => c.count ?? '—').join('     ')}`,
      900,
      515 + i * 28,
      16,
    ),
  )
  text('来源与语言', 1370, 480)
  ;[...w.charts.sourceDistribution.items, ...w.charts.languageDistribution.items]
    .filter((i) => i.count)
    .forEach((r, i) => text(`${r.label}  ${r.count} (${r.ratioPercent}%)`, 1370, 515 + i * 26, 16))
  text(
    `完整性：来源 ${w.completeness.source.availableCount}/${w.listCounts.all}    时间 ${w.completeness.time.availableCount}/${w.listCounts.all}    推理 ${w.completeness.reasoning.availableCount}/${w.listCounts.all}`,
    25,
    745,
  )
  text(
    `列表：${w.listContext.listFilter} · 第 ${w.samplePage.page} 页 · 共 ${w.samplePage.total} 条`,
    25,
    785,
  )
  text(
    '样本 ID          语言         类别               输入 / 推理 / 输出 Token                步数      调用       时长       调用结果',
    25,
    825,
  )
  w.samplePage.items.forEach((r, i) =>
    text(
      `${r.displayId}       ${r.language}       ${r.testCategoryLabel}          ${r.tokenUsage.input ?? '—'} / ${r.tokenUsage.reasoningRecorded ?? '—'} / ${r.tokenUsage.finalOutput ?? '—'}                     ${r.eventCount}          ${r.callCount}           ${r.durationMs === null ? '—' : r.durationMs / 1000 + 's'}       ${statisticStatus(r.taskStatus)}`,
      25,
      865 + i * 30,
      17,
    ),
  )
  text('统计以固定快照为准；测试集标签不代表风险判定。', 25, 1080, 14)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 编码失败'))), 'image/png'),
  )
}
