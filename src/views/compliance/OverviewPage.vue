<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useComplianceStore } from '../../stores/compliance'
import PanelCard from '../../components/PanelCard.vue'
import { formatCount, formatTime } from './presentation'
import { request } from '../../api/request'
import { complianceApi } from '../../api/compliance'
import { getModelWorkbench } from '../../api/model-workbench'
/** 三层缺口的统计口径：链路层看引用、任务层看执行状态、模型层看检查点与内部激活。 */
type Layer = 'link' | 'task' | 'model'
interface GapStat {
  expected: number | null
  missing: number | null
}
/** 「合规检查清单」的一行：只描述"查什么、去哪处理"，不承载任何数值。 */
interface CheckRow {
  layer: Layer
  layerLabel: string
  item: string
  unit: string
  rule: string
  target: string
  entry: string
}
const store = useComplianceStore(),
  dates = ref(initialDateRange()),
  layer = ref<'' | Layer>('')
// 真实接口模式下三层缺口的实时统计；演示模式改用下方 demoGaps。
const gaps = ref<Record<Layer, GapStat> | null>(null)
// 演示数据不含任务层 / 模型层的明细，这里给出与示例口径一致的固定值。
const demoGaps: Record<Layer, GapStat> = {
  link: { expected: 284, missing: 4 },
  task: { expected: 12, missing: 3 },
  model: { expected: 6, missing: 2 },
}
const layerOptions: { value: '' | Layer; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'link', label: '链路层' },
  { value: 'task', label: '任务层' },
  { value: 'model', label: '模型层' },
]
// 清单本身是静态的：数值由上方卡片承载，表格只负责说明与跳转。
const checkItems: CheckRow[] = [
  {
    layer: 'link',
    layerLabel: '链路层',
    item: '数据版本 → 治理任务',
    unit: '交接关系',
    rule: '引用的数据版本未在资源库登记',
    target: '/compliance/lineage',
    entry: '数据谱系追踪',
  },
  {
    layer: 'link',
    layerLabel: '链路层',
    item: '治理版本 → 训练任务',
    unit: '交接关系',
    rule: '引用的数据版本未在资源库登记',
    target: '/compliance/lineage',
    entry: '数据谱系追踪',
  },
  {
    layer: 'link',
    layerLabel: '链路层',
    item: '训练产物 → 模型版本',
    unit: '交接关系',
    rule: '来源训练任务未登记',
    target: '/compliance/lineage',
    entry: '数据谱系追踪',
  },
  {
    layer: 'link',
    layerLabel: '链路层',
    item: '模型版本 → 推理输出',
    unit: '交接关系',
    rule: '调用的模型版本未登记',
    target: '/compliance/lineage',
    entry: '数据谱系追踪',
  },
  {
    layer: 'task',
    layerLabel: '任务层',
    item: '执行状态',
    unit: '任务',
    rule: '执行失败',
    target: '/compliance/full-chain',
    entry: '全链路追踪',
  },
  {
    layer: 'model',
    layerLabel: '模型层',
    item: '训练检查点齐全',
    unit: '检查点',
    rule: '应有检查点数量不足',
    target: '/compliance/model-internal',
    entry: '模型内部审计',
  },
  {
    layer: 'model',
    layerLabel: '模型层',
    item: '神经元激活异常',
    unit: '捕获记录',
    rule: '存在超阈值激活单元',
    target: '/compliance/model-internal',
    entry: '模型内部审计',
  },
]
const checkRows = computed(() =>
  layer.value ? checkItems.filter((row) => row.layer === layer.value) : checkItems,
)
function initialDateRange() {
  if (store.demo) return ['2026-09-21', '2026-09-28']
  const start = new Date(),
    end = new Date()
  start.setDate(start.getDate() - 6)
  end.setDate(end.getDate() + 1)
  return [start, end].map(
    (date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
  )
}
/** 某一层的缺口数字：演示模式读示例值，真实模式读实时统计。 */
function gapOf(target: Layer): GapStat {
  if (store.demo) return demoGaps[target]
  return gaps.value?.[target] ?? { expected: null, missing: null }
}
// 三层缺口要逐个查询谱系，聚合期间用省略号表示"正在统计"，避免误显示成"未知"。
const gapsLoading = ref(false)
/** 卡片上的数字文案：统计中显示省略号，取不到才显示"未知"。 */
function gapText(target: Layer, key: keyof GapStat): string {
  if (gapsLoading.value) return '…'
  return formatCount(gapOf(target)[key])
}
/** 「待处理问题」= 三层缺口条数之和（这里以"条问题"为单位，与各层自身的单位无关）。 */
function gapTotalText(): string {
  if (gapsLoading.value) return '…'
  const parts = [gapOf('link').missing, gapOf('task').missing, gapOf('model').missing]
  if (parts.some((value) => value === null)) return formatCount(null)
  return formatCount(parts.reduce<number>((sum, value) => sum + (value ?? 0), 0))
}
function toggleLayer(value: Layer) {
  layer.value = layer.value === value ? '' : value
}
/**
 * 汇总三层缺口。
 * - 链路层：4 类交接关系的引用核验（3 类来自 /compliance/lineage，第 4 类由调用记录与模型版本比对得出）。
 * - 任务层：执行失败的任务数（进行中 / 等待中还没有结论，不计入）。
 * - 模型层：训练检查点缺口数；神经元激活部分待后端提供聚合接口后并入。
 */
async function loadLayerGaps() {
  if (store.demo) {
    gaps.value = null
    return
  }
  gapsLoading.value = true
  try {
    // 1. 取可查询的根节点：数据集（含被引用但未登记的）与模型。
    const [datasetContext, modelContext] = await Promise.all([
      complianceApi.contexts({ sourceKind: 'dataset' }),
      complianceApi.contexts({ sourceKind: 'model' }),
    ])
    const datasetIds = [...new Set(datasetContext.candidates.map((item) => String(item.sourceId)))]
    const modelIds = [...new Set(modelContext.candidates.map((item) => String(item.sourceId)))]
    // 2. 逐个根节点查询谱系，再按边 id 去重：同一条边会被多个起点重复返回。
    const graphs = await Promise.all([
      ...datasetIds.map((id) =>
        complianceApi.lineage({ entityType: 'dataset', entityId: id, direction: 'both' }),
      ),
      ...modelIds.map((id) =>
        complianceApi.lineage({ entityType: 'model', entityId: id, direction: 'both' }),
      ),
    ])
    const edges = new Map<string, (typeof graphs)[number]['edges'][number]>()
    graphs.forEach((graph) => graph.edges.forEach((edge) => edges.set(edge.id, edge)))
    // 3. 只统计清单里列出的 3 类谱系关系。
    const countedRelations = new Set(['输入数据引用', '训练数据绑定', '训练产物登记'])
    let linkExpected = 0,
      linkMissing = 0
    edges.forEach((edge) => {
      if (!countedRelations.has(edge.relation)) return
      linkExpected += 1
      if (edge.verificationState === 'missing') linkMissing += 1
    })
    // 4. 链路层第 4 类 + 模型层的检查点数据，都来自模型工作台聚合接口。
    const workbench = await getModelWorkbench()
    const registered = new Set<string>()
    workbench.models.forEach((model) => {
      registered.add(`${model.id}::${model.version}`)
      model.versions.forEach((version) => registered.add(`${model.id}::${version.version}`))
    })
    linkExpected += workbench.calls.length
    linkMissing += workbench.calls.filter(
      (call) => !registered.has(`${call.modelId}::${call.version}`),
    ).length
    // 5. 模型层：按训练配置推算应有检查点数，与实际保存数比较。
    let checkpointExpected = 0,
      checkpointMissing = 0
    workbench.training.forEach((task) => {
      const interval = Math.max(1, Math.floor((task.epochs || 1) / 3))
      let shouldHave = 0
      for (let index = 1; index <= (task.epoch || 0); index += 1)
        if (index === task.epoch || index % interval === 0) shouldHave += 1
      const actual = (task.checkpoints ?? []).length
      checkpointExpected += shouldHave
      checkpointMissing += Math.max(0, shouldHave - actual)
    })
    // 6. 任务层：执行失败的任务。进行中 / 等待中还没有结论，不算缺项。
    const taskPage = await request<{ items: { status: string }[]; total: number }>({
      url: '/tasks',
      params: { page: 1, pageSize: 100 },
    })
    const taskItems = taskPage.items ?? []
    gaps.value = {
      link: { expected: linkExpected, missing: linkMissing },
      task: {
        expected: taskPage.total ?? taskItems.length,
        missing: taskItems.filter((item) => item.status === 'failed').length,
      },
      model: { expected: checkpointExpected, missing: checkpointMissing },
    }
  } catch {
    // 取不到就显示"未知"，不编造数字。
    gaps.value = null
  } finally {
    gapsLoading.value = false
  }
}
function load() {
  if (dates.value?.length !== 2) {
    store.invalidate()
    return
  }
  store.loadOverview(
    {
      scope: 'all',
      from: `${dates.value[0]}T00:00:00+08:00`,
      to: `${dates.value[1]}T00:00:00+08:00`,
    },
    1,
  )
}
function filter() {
  load()
}
onMounted(() => {
  load()
  // 三层缺口与日期筛选无关（后端未按时间过滤），只在进入页面时聚合一次。
  void loadLayerGaps()
})
</script>
<template>
  <div class="compliance-filter">
    <label
      >时间范围（结束日期不含）<el-date-picker
        v-model="dates"
        type="daterange"
        value-format="YYYY-MM-DD"
        @change="filter" /></label
    ><span class="compliance-muted">快照时间 {{ formatTime(store.overview?.asOf) }}</span
    ><el-button type="primary" :loading="store.loading" @click="load">刷新核验</el-button>
  </div>
  <template v-if="store.overview"
    ><div class="compliance-kpis">
      <PanelCard title="链路断点" icon="Share"
        ><button class="compliance-metric" @click="toggleLayer('link')">
          <strong>{{ gapText('link', 'missing') }}</strong
          ><span>/ {{ gapText('link', 'expected') }} 条交接关系</span
          ><el-tag type="warning">{{ layer === 'link' ? '显示全部' : '定位缺口' }}</el-tag>
        </button></PanelCard
      ><PanelCard title="任务缺项" icon="Tickets"
        ><button class="compliance-metric" @click="toggleLayer('task')">
          <strong>{{ gapText('task', 'missing') }}</strong
          ><span>/ {{ gapText('task', 'expected') }} 个任务</span
          ><el-tag type="warning">{{ layer === 'task' ? '显示全部' : '定位缺口' }}</el-tag>
        </button></PanelCard
      ><PanelCard title="模型隐患" icon="Shield"
        ><button class="compliance-metric" @click="toggleLayer('model')">
          <strong>{{ gapText('model', 'missing') }}</strong
          ><span>/ {{ gapText('model', 'expected') }} 项检查</span
          ><el-tag type="warning">{{ layer === 'model' ? '显示全部' : '定位缺口' }}</el-tag>
        </button></PanelCard
      ><PanelCard title="待处理问题" icon="Warning"
        ><router-link class="compliance-metric" to="/compliance/risk-alert">
          <strong>{{ gapTotalText() }}</strong
          ><span>个问题</span
          ><el-tag type="danger">去处理 →</el-tag>
        </router-link></PanelCard
      >
    </div>
    <p class="compliance-scope">
      当前核验范围说明：链路层看引用是否登记 · 任务层看执行状态 · 模型层看检查点与内部激活
    </p>
    <PanelCard title="合规检查清单" icon="Share"
      ><template #extra
        ><el-button-group
          ><el-button
            v-for="option in layerOptions"
            :key="option.value"
            size="small"
            :type="layer === option.value ? 'primary' : 'default'"
            @click="layer = option.value"
            >{{ option.label }}</el-button
          ></el-button-group
        ></template
      ><el-table :data="checkRows" stripe
        ><el-table-column label="层级" width="120"
          ><template #default="{ row }"
            ><span class="compliance-layer-tag" :class="row.layer">{{
              row.layerLabel
            }}</span></template
          ></el-table-column
        ><el-table-column prop="item" label="检查项" min-width="160" /><el-table-column
          prop="unit"
          label="单位"
          width="200" /><el-table-column prop="rule" label="缺口说明" min-width="250" /><el-table-column
          label="处理入口"
          min-width="120"
          ><template #default="{ row }"
            ><router-link :to="row.target">{{ row.entry }} →</router-link></template
          ></el-table-column
        ></el-table
      ></PanelCard
    ></template
  >
</template>
