<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { useComplianceStore } from '../../stores/compliance'
import PanelCard from '../../components/PanelCard.vue'
import ContextSelector from './components/ContextSelector.vue'
import StateBadge from './components/StateBadge.vue'
import AuditReviewDialog from './components/AuditReviewDialog.vue'
import { getModelWorkbench } from '../../api/model-workbench'
import { demoTrainings } from '../../mock/compliance'
import { TASK_STATUS } from '../../utils/enums'
import { formatTime } from './presentation'
import type { AbnormalNeuron } from '../../types/compliance'
import type { TrainingTask } from '../../types/model-workbench'
/**
 * 「模型内部审计」= 模型层的细查页，分两块、各自独立选择：
 * ① 训练检查点留痕：查一个训练任务该存的存档存够没有（真实数据，演示模式用演示训练任务）。
 * ② 神经元激活审计：看模型推理时捕获的采样单元激活（本地无法部署模型，真实模式给说明，演示模式可看效果）。
 */
const store = useComplianceStore(),
  taskId = ref(''),
  trainings = ref<TrainingTask[]>([]),
  trainingsLoading = ref(false),
  trainingsError = ref(''),
  selected = ref(''),
  reviewOpen = ref(false),
  open = inject<(id: string) => void>('complianceEvidence')!
const task = computed(() => trainings.value.find((item) => item.id === taskId.value) ?? null)
/** 存档间隔，与后端 back/app/routers/training_tasks.py 的规则保持一致：max(1, epochs // 3)。 */
const interval = computed(() => Math.max(1, Math.floor((task.value?.epochs || 1) / 3)))
/** 规则要求保存的轮次：能被存档间隔整除的轮，以及最后一轮。 */
const expectedEpochs = computed(() => {
  const current = task.value
  if (!current) return []
  const list: number[] = []
  for (let index = 1; index <= (current.epoch || 0); index += 1)
    if (index === current.epoch || index % interval.value === 0) list.push(index)
  return list
})
const savedByEpoch = computed(
  () => new Map((task.value?.checkpoints ?? []).map((item) => [item.epoch, item])),
)
/** 规则外的额外存档：实际存了，但存档规则并不要求。 */
const extraCheckpoints = computed(() =>
  (task.value?.checkpoints ?? []).filter((item) => !expectedEpochs.value.includes(item.epoch)),
)
/** 应存档的检查点核验行：损失值取自逐轮训练日志，缺失的轮次同样能显示数值。 */
const checkpointRows = computed(() => {
  const current = task.value
  return expectedEpochs.value.map((epoch) => {
    const saved = savedByEpoch.value.get(epoch)
    return {
      epoch,
      name: saved?.name ?? null,
      loss: current?.loss?.[epoch - 1] ?? saved?.loss ?? null,
      validationLoss: current?.validationLoss?.[epoch - 1] ?? null,
      state: saved ? ('verified' as const) : ('missing' as const),
    }
  })
})
const savedRows = computed(() => checkpointRows.value.filter((row) => row.state === 'verified'))
const missingRows = computed(() => checkpointRows.value.filter((row) => row.state === 'missing'))
/** 一句话结论：把「缺哪几轮」翻译成人话。 */
const conclusion = computed(() => {
  const current = task.value
  if (!current) return ''
  if (!current.epoch) return '训练尚未开始，还没有产生检查点。'
  const head = `存档规则要求在第 ${expectedEpochs.value.join('、')} 轮各存一次，实际存了${
    savedRows.value.length ? `第 ${savedRows.value.map((row) => row.epoch).join('、')} 轮` : ' 0 个'
  }`
  const tail = missingRows.value.length
    ? `，缺第 ${missingRows.value.map((row) => row.epoch).join('、')} 轮。`
    : '，检查点齐全。'
  const extra = extraCheckpoints.value.length
    ? `另有 ${extraCheckpoints.value.length} 个规则外的额外存档：${extraCheckpoints.value.map((item) => item.name).join('、')}。`
    : ''
  return `${head}${tail}${extra}`
})
/**
 * 训练损失曲线：把 task.loss 逐轮映射到 SVG 坐标，
 * 并在曲线上标出「规则要求的检查点」——实心绿点=已保存，空心红圈=应有但缺失。
 */
const chart = computed(() => {
  const current = task.value
  const values = current?.loss ?? []
  if (!current || values.length < 2) return null
  // 尺寸按「左半栏」定：viewBox 缩小后由 CSS 自适应填充左栏。
  const width = 520,
    height = 190,
    padX = 46,
    padTop = 18,
    padBottom = 34,
    max = Math.max(...values),
    min = Math.min(...values),
    span = max - min || 1
  /**
   * 横轴按「计划轮数」铺开，而不是按损失数组的长度：
   * 后端只记录了部分轮次的损失时，右半段留白本身就代表「这段没有训练日志」；
   * 检查点标记也才能落在各自正确的轮次上（按数组长度会把靠后的轮次挤到最右端重叠）。
   */
  const axisMax = Math.max(current.epochs || 0, current.epoch || 0, values.length, 1)
  const xOf = (epoch: number) =>
    padX +
    ((Math.min(Math.max(epoch, 1), axisMax) - 1) / Math.max(axisMax - 1, 1)) * (width - padX * 2)
  const yOf = (value: number) =>
    padTop + (1 - (value - min) / span) * (height - padTop - padBottom)
  // 轮次多时按步长抽稀刻度，避免横轴文字挤在一起。
  const tickStep = Math.max(1, Math.ceil(axisMax / 12))
  return {
    width,
    height,
    padX,
    plotBottom: height - padBottom,
    polyline: values.map((value, index) => `${xOf(index + 1)},${yOf(value)}`).join(' '),
    points: values.map((value, index) => ({ cx: xOf(index + 1), cy: yOf(value) })),
    // 检查点只画圆点、不写文字：文字在原尺寸下会互相重叠并被裁掉，轮次刻度统一放到横轴上。
    marks: expectedEpochs.value.map((epoch) => {
      const saved = savedByEpoch.value.get(epoch)
      const value = saved?.loss ?? values[epoch - 1] ?? min
      return { epoch, saved: !!saved, cx: xOf(epoch), cy: yOf(value) }
    }),
    yTicks: [max, (max + min) / 2, min].map((value) => ({ text: value.toFixed(2), y: yOf(value) })),
    xTicks: Array.from({ length: axisMax }, (_, index) => index + 1)
      .filter((epoch) => epoch === 1 || epoch === axisMax || epoch % tickStep === 0)
      .map((epoch) => ({ text: String(epoch), x: xOf(epoch) })),
  }
})
async function loadTrainings() {
  trainingsLoading.value = true
  trainingsError.value = ''
  try {
    // 示例演示模式使用演示训练任务，不连后端。
    trainings.value = store.demo ? demoTrainings : ((await getModelWorkbench()).training ?? [])
    if (!taskId.value && trainings.value.length) taskId.value = trainings.value[0]!.id
  } catch (exception) {
    trainingsError.value = exception instanceof Error ? exception.message : '训练任务加载失败'
  } finally {
    trainingsLoading.value = false
  }
}
const statusLabel = (state: string) => TASK_STATUS[state as keyof typeof TASK_STATUS]?.label ?? state
const statusColor = (state: string) => TASK_STATUS[state as keyof typeof TASK_STATUS]?.color ?? 'info'
/* ── 区块②：神经元激活（沿用原有逻辑，仅在真实模式补一段说明） ── */
const result = computed(() =>
  store.audit?.result.kind === 'neuron_audit' ? store.audit.result : null,
)
const hasMatrix = computed(
  () =>
    result.value?.availability === 'available' &&
    !!result.value.captureId &&
    result.value.heatmap.length > 0,
)
/** 本地没有部署模型，真实模式读不到模型内部的激活数据。 */
const neuronHint = computed(() =>
  '当前环境没有本地部署模型，读不到模型内部的神经元激活数据。神经元捕获需要在模型推理时由推理服务侧采集；可切换到「示例演示」查看这个模块的演示效果。',
)
function color(value: number | null | undefined) {
  if (value == null) return '#eef1f5'
  return value >= 2.5
    ? '#ed4764'
    : value <= -2.5
      ? '#2455ba'
      : value > 0
        ? '#edafc0'
        : value < 0
          ? '#9ab8eb'
          : '#f1eef4'
}
function select(item: AbnormalNeuron) {
  selected.value = `${item.layer}-${item.index}`
  if (item.evidenceRefs[0]) open(item.evidenceRefs[0])
}
function cell(layer: number, index: number) {
  selected.value = `${layer}-${index}`
  const item = result.value?.abnormalNeurons.find((n) => n.layer === layer && n.index === index)
  if (item) select(item)
}
onMounted(loadTrainings)
</script>
<template>
  <div class="audit-section">
    <span class="audit-section-index">①</span
    ><strong>📋 训练检查点留痕</strong
    ><small>核验一个训练任务该存的检查点有没有存够</small>
  </div>
  <div class="compliance-filter">
    <label
      >训练任务<el-select
        v-model="taskId"
        filterable
        :loading="trainingsLoading"
        placeholder="请选择训练任务"
        ><el-option
          v-for="item in trainings"
          :key="item.id"
          :label="`${item.name} · ${item.id} · 第 ${item.epoch}/${item.epochs} 轮`"
          :value="item.id" /></el-select></label
    ><span class="compliance-muted">{{
      task ? `${task.id} · 检查点核验` : '选择训练任务，核验它的检查点留痕'
    }}</span>
  </div>
  <el-alert v-if="trainingsError" :title="trainingsError" type="warning" :closable="false" show-icon />
  <template v-if="task"
    ><div class="checkpoint-row"
      ><PanelCard title="训练检查点留痕" icon="Tickets"
      ><template #extra
        ><span class="compliance-muted"
          >规则来自后端存档逻辑：每 {{ interval }} 轮存一次，最后一轮必存</span
        ></template
      ><dl class="checkpoint-task">
        <dt>训练任务</dt>
        <dd>{{ task.id }} · {{ task.name }}</dd>
        <dt>计划轮数</dt>
        <dd>{{ task.epochs }} 轮</dd>
        <dt>已训到</dt>
        <dd>第 {{ task.epoch }} 轮</dd>
        <dt>目标版本</dt>
        <dd>{{ task.targetVersion || '未记录' }}</dd>
        <dt>训练方法</dt>
        <dd>{{ task.method || '未记录' }}</dd>
        <dt>更新时间</dt>
        <dd>{{ formatTime(task.updatedAt) }}</dd>
        <dt>执行状态</dt>
        <dd>
          <el-tag :type="statusColor(task.status)">{{ statusLabel(task.status) }}</el-tag>
        </dd>
      </dl></PanelCard
      ><PanelCard title="训练损失曲线" icon="DataAnalysis"
        ><template #extra
          ><span class="compliance-muted">横轴为训练轮次，纵轴为损失值</span></template
        ><div class="checkpoint-chart">
          <template v-if="chart"
            ><svg
              :viewBox="`0 0 ${chart.width} ${chart.height}`"
              role="img"
              aria-label="训练损失曲线与检查点位置"
            >
              <line
                v-for="tick in chart.yTicks"
                :key="tick.text"
                :x1="chart.padX"
                :x2="chart.width - chart.padX"
                :y1="tick.y"
                :y2="tick.y"
                stroke="#e7eff9"
                stroke-width="1"
              />
              <text
                v-for="tick in chart.yTicks"
                :key="`y-${tick.text}`"
                :x="chart.padX - 8"
                :y="tick.y + 4"
                text-anchor="end"
                fill="#859bb9"
                font-size="12"
              >
                {{ tick.text }}
              </text>
              <line
                :x1="chart.padX"
                :x2="chart.width - chart.padX"
                :y1="chart.plotBottom"
                :y2="chart.plotBottom"
                stroke="#dfeaf8"
                stroke-width="1"
              />
              <text
                v-for="tick in chart.xTicks"
                :key="`x-${tick.text}`"
                :x="tick.x"
                :y="chart.height - 12"
                text-anchor="middle"
                fill="#859bb9"
                font-size="11"
              >
                {{ tick.text }}
              </text>
              <polyline :points="chart.polyline" fill="none" stroke="#248cff" stroke-width="2" />
              <circle
                v-for="(point, index) in chart.points"
                :key="`p-${index}`"
                :cx="point.cx"
                :cy="point.cy"
                r="2.5"
                fill="#248cff"
              />
              <circle
                v-for="mark in chart.marks"
                :key="`m-${mark.epoch}`"
                :cx="mark.cx"
                :cy="mark.cy"
                r="6"
                :fill="mark.saved ? '#1f9d6b' : '#ffffff'"
                :stroke="mark.saved ? '#1f9d6b' : '#e04f4f'"
                stroke-width="2"
              />
            </svg>
            <p class="compliance-muted">
              ● 绿色实心＝已保存的检查点，○ 红色空心＝规则要求但缺失。
            </p></template
          ><el-empty
            v-else
            description="这个任务还没有逐轮损失数据"
            :image-size="60" /></div></PanelCard
    ></div>
    <PanelCard title="检查点核验" icon="Shield"
      ><template #extra
        ><span class="compliance-muted"
          >应有 {{ checkpointRows.length }} 个 · 实际 {{ savedRows.length }} 个 · 缺
          {{ missingRows.length }} 个</span
        ></template
      ><p class="compliance-muted">{{ conclusion }}</p>
      <div class="checkpoint-detail">
        <h3 class="checkpoint-heading">应存档的检查点</h3>
        <el-table :data="checkpointRows" stripe
          ><el-table-column label="轮次" width="110"
            ><template #default="{ row }">第 {{ row.epoch }} 轮</template></el-table-column
          ><el-table-column label="实际保存" min-width="200"
            ><template #default="{ row }">{{
              row.name || '未保存'
            }}</template></el-table-column
          ><el-table-column label="训练损失" width="120"
            ><template #default="{ row }">{{
              row.loss == null ? '—' : row.loss.toFixed(2)
            }}</template></el-table-column
          ><el-table-column label="验证损失" width="120"
            ><template #default="{ row }">{{
              row.validationLoss == null ? '—' : row.validationLoss.toFixed(2)
            }}</template></el-table-column
          ><el-table-column label="状态" width="120"
            ><template #default="{ row }"
              ><StateBadge :state="row.state" /></template></el-table-column
          ><el-table-column label="证据" min-width="140"
            ><template #default="{ row }"
              ><el-button
                v-if="row.state === 'verified'"
                link
                type="primary"
                @click="open(`evidence-training-${task.id}`)"
                >查看源证据</el-button
              ><span v-else class="compliance-muted">—</span></template
            ></el-table-column
          ></el-table
        >
      </div></PanelCard
    ></template
  >
  <div class="audit-section">
    <span class="audit-section-index">②</span
    ><strong>🧠 神经元激活审计</strong
    ><small>查看模型推理时捕获的采样单元激活</small>
  </div>
  <ContextSelector kind="model" label="模型" capability="neuron_audit" />
  <el-alert v-if="!store.demo && !hasMatrix" :title="neuronHint" type="warning" :closable="false" show-icon />
  <div v-if="hasMatrix && result" class="compliance-split">
    <PanelCard title="采样单元激活矩阵" icon="Grid"
      ><template #extra
        ><span class="compliance-muted"
          >{{ result.unit }}；阈值 |z| ≥ {{ result.threshold }}</span
        ></template
      >
      <div class="compliance-heat-scroll">
        <div
          class="compliance-heatmap"
          :style="{
            gridTemplateColumns: `70px repeat(${result.neuronIndices.length}, minmax(22px,1fr))`,
          }"
        >
          <template v-for="(layer, row) in result.layerIndices" :key="layer"
            ><span class="compliance-layer">Layer {{ layer }}</span
            ><button
              v-for="(index, col) in result.neuronIndices"
              :key="index"
              :style="{ background: color(result.heatmap[row]?.[col]) }"
              :class="{
                abnormal: result.abnormalNeurons.some(
                  (n) => n.layer === layer && n.index === index,
                ),
                selected: selected === `${layer}-${index}`,
              }"
              :aria-label="`L${layer} / ${index} = ${result.heatmap[row]?.[col] ?? '未采集'}`"
              :title="`L${layer} / ${index} = ${result.heatmap[row]?.[col] ?? '未采集'}`"
              @click="cell(layer, index)"
            >
              <span v-if="result.heatmap[row]?.[col] == null">—</span>
            </button></template
          ><span>单元索引</span
          ><small v-for="index in result.neuronIndices" :key="index">{{ index }}</small>
        </div>
      </div>
      <div class="compliance-legend">
        <span>−3.0</span><i></i><span>+3.0</span><span>边框：超阈值；灰色：未采集</span>
      </div>
      <p class="compliance-muted">
        {{ result.observedCount }} 个采样单元；{{ result.abnormalNeurons.length }} 个超阈值（{{
          result.ratio === null ? '未知' : `${(result.ratio * 100).toFixed(2)}%`
        }}）。未采样区域不作推断。
      </p></PanelCard
    >
    <div class="compliance-stack">
      <PanelCard title="超阈值单元" icon="Warning"
        ><el-table :data="result.abnormalNeurons" @row-click="select"
          ><el-table-column label="层 / 单元"
            ><template #default="{ row }"
              ><el-button type="primary" link @click.stop="select(row)"
                >L{{ row.layer }} / {{ row.index }}</el-button
              ></template
            ></el-table-column
          ><el-table-column prop="value" label="z 值" width="75" /><el-table-column
            prop="concept"
            label="关联概念"
        /></el-table>
        <p class="compliance-muted">点击单元定位矩阵，并打开捕获证据。</p></PanelCard
      ><PanelCard title="证据适用范围" icon="Shield"
        ><dl class="compliance-details">
          <dt>捕获对象</dt>
          <dd>{{ result.inferenceId }}</dd>
          <dt>捕获记录</dt>
          <dd>{{ result.captureId }}</dd>
          <dt>模型版本</dt>
          <dd>{{ result.modelVersion }}</dd>
          <dt>归一化基线</dt>
          <dd>{{ result.normalizationBaseline }}</dd>
          <dt>算法版本</dt>
          <dd>{{ store.audit?.adapterVersion }}</dd>
          <dt>复核状态</dt>
          <dd><StateBadge :state="store.audit?.reviewStatus" /></dd>
        </dl>
        <p class="compliance-note">异常激活仅提供关联线索，不直接证明风险原因。</p>
        <el-button @click="reviewOpen = true">人工复核</el-button></PanelCard
      >
    </div>
  </div>
  <el-empty
    v-else-if="!store.loading && !store.error && store.demo"
    :description="
      result?.unavailableReason || '不支持内部捕获 / 尚未采集：请选择精确模型版本与捕获记录'
    "
  />
  <AuditReviewDialog v-model="reviewOpen" />
</template>
<style scoped>
/* 页面内分块的标题条：左侧粗蓝线 + 浅蓝渐变，与合规模块的蓝色调一致。 */
.audit-section {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 14px;
  padding: 12px 18px;
  border: 1px solid #d8e8fb;
  border-left: 4px solid #087bff;
  border-radius: 8px;
  background: linear-gradient(90deg, #eaf4ff, #f8fcff);
}
/* 第二块之前多留一点空隙，把上下两块分开。 */
.audit-section:not(:first-child) {
  margin-top: 28px;
}
.audit-section-index {
  flex: none;
  width: 26px;
  height: 26px;
  line-height: 26px;
  border-radius: 50%;
  background: #087bff;
  color: #ffffff;
  font-size: 14px;
  font-weight: 700;
  text-align: center;
}
.audit-section strong {
  font-size: 19px;
  color: #10275f;
}
.audit-section small {
  font-size: 14px;
  color: #7490b5;
}
.checkpoint-task {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 12px 20px;
  margin: 0 0 8px;
  font-size: 16px;
}
.checkpoint-task dt {
  color: #7b8fac;
}
.checkpoint-task dd {
  margin: 0;
  color: #26456f;
  overflow-wrap: anywhere;
}
/* 第一行两栏：左＝任务信息，右＝训练损失曲线。 */
.checkpoint-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 15px;
  align-items: start;
}
/* 第三块：单栏，表格撑满面板。 */
.checkpoint-detail {
  margin-top: 14px;
}
.checkpoint-heading {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin: 0 0 8px;
  font-size: 17px;
  color: #10275f;
}
.checkpoint-heading small {
  font-size: 13px;
  font-weight: 400;
  color: #7b8fac;
}
.checkpoint-chart svg {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid #e7eff9;
  border-radius: 10px;
  background: #fbfdff;
}
.checkpoint-chart .compliance-muted {
  margin: 8px 0 0;
}
/* ① 面板标题：23px → 20px（只影响本页三个面板） */
:deep(.panel-heading h2) {
  font-size: 22px !important;
}

/* ② 面板右上角的小字：12px → 14px */
:deep(.panel-heading .compliance-muted) {
  font-size: 14px !important;
}
/* 加在 :deep(.panel-heading .compliance-muted) 后面 */
:deep(.compliance-muted) {
  font-size: 14px !important;
}
@media (max-width: 1100px) {
  .checkpoint-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
