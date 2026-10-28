<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { EChartsOption } from 'echarts'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import PanelCard from '../../components/PanelCard.vue'
import { useModelWorkbench } from '../../stores/model-workbench'
import { formatModelTime, trainingMethods, trainingStates } from '../../types/model-workbench'
import WorkbenchKpis from './WorkbenchKpis.vue'
import WorkbenchChart from './WorkbenchChart.vue'
import ComplianceEventMonitor from './ComplianceEventMonitor.vue'
import { isMock } from '../../api/request'
import { isGovernanceLlm } from '../../api/governance-llm'
import {
  createRealTraining,
  downloadRealArtifact,
  fetchRealTrainingMetrics,
  fetchRealTrainingTask,
  fetchTrainingScripts,
  listRealArtifacts,
  syncRealTraining,
  type RealArtifact,
  type TrainingScriptCatalog,
} from '../../api/model-workbench'
const store = useModelWorkbench()
/** 真实训练任务用模型服务的 UUID 做主键；旧的演示台账是 TR-xxxxxxxx 短号。 */
const isRealId = (id?: string) => !!id && id.length >= 20
const keyword = ref('')
const selectedId = ref(store.data.training[0]?.id)
const selected = computed(() => store.data.training.find((t) => t.id === selectedId.value))
const tasks = computed(() =>
  store.data.training.filter((t) => `${t.name}${trainingStates[t.status]}`.includes(keyword.value)),
)
const kpis = computed(() => [
  { label: '训练任务', value: store.data.training.length, icon: 'Tickets', unit: '项' },
  ...(['running', 'succeeded', 'pending', 'failed'] as const).map((status, i) => ({
    label: trainingStates[status],
    value: store.data.training.filter((t) => t.status === status).length,
    icon: ['VideoPlay', 'CircleCheckFilled', 'Clock', 'CircleCloseFilled'][i]!,
    unit: '项',
  })),
])
const dataset = computed(() => store.data.datasets.find((d) => d.id === selected.value?.datasetId))
const model = computed(() => store.data.models.find((m) => m.id === selected.value?.modelId))
// 只列训练集；全部被标为测试集时下拉为空并由提交校验拦截，不再回退显示全部。
const trainingDatasets = computed(() =>
  store.data.datasets.filter((d) => d.purpose === 'training'),
)
const chart = computed<EChartsOption>(() => ({
  color: ['#087bff', '#9555ff'],
  tooltip: { trigger: 'axis' },
  legend: { data: ['训练损失', '验证损失'], right: 0 },
  grid: { left: 45, right: 20, bottom: 42, top: 40 },
  xAxis: { type: 'category', name: '轮次', data: selected.value?.loss.map((_, i) => i) },
  yAxis: { type: 'value', name: '损失', min: 0 },
  series: [
    { name: '训练损失', type: 'line', data: selected.value?.loss },
    { name: '验证损失', type: 'line', data: selected.value?.validationLoss },
  ],
}))
const dialog = ref(false)
const checkpoint = ref<{ name: string; epoch: number; loss: number }>()
/** 真实训练脚本目录，从 8001 透传拉取；不再前端硬编码。8001 注册什么就显示什么。 */
const realScripts = ref<TrainingScriptCatalog[]>([])
const realScriptsLoading = ref(false)
const realScriptsError = ref('')
/** 当前选中脚本；8001 拉取完成后若默认 scriptId 不在目录里，自动选第一个。 */
const currentScript = computed(() =>
  realScripts.value.find((s) => s.id === form.scriptId) ?? realScripts.value[0],
)
/** 是否需要"训练样本数"输入框：由 8001 返回的 parameters_schema 是否声明 train_samples 字段决定，不再硬编码脚本 ID。 */
const scriptHasTrainSamples = computed(() => {
  const props = (currentScript.value?.parametersSchema?.properties ?? {}) as Record<string, unknown>
  return 'train_samples' in props
})
async function loadRealScripts() {
  if (isMock || !isGovernanceLlm) return
  realScriptsLoading.value = true
  realScriptsError.value = ''
  try {
    realScripts.value = await fetchTrainingScripts()
    // 拉到目录后，若当前 scriptId 不在其中（或还是默认 mini-mlp 但目录里没有），自动选第一项。
    if (!realScripts.value.some((s) => s.id === form.scriptId)) {
      form.scriptId = realScripts.value[0]?.id ?? ''
    }
  } catch (err) {
    realScriptsError.value = err instanceof Error ? err.message : '训练脚本目录加载失败'
  } finally {
    realScriptsLoading.value = false
  }
}
const form = reactive({
  name: '',
  modelId: store.data.models[0]?.id || '',
  baseVersion: '',
  datasetId: trainingDatasets.value[0]?.id || '',
  datasetVersion: '',
  epochs: 10,
  learningRate: 0.0002,
  batchSize: 8,
  targetVersion: '',
  method: trainingMethods[0] as string,
  scriptId: 'mini-mlp',
  trainSamples: 5000,
})
const realScriptHint = computed(() => currentScript.value?.description ?? '')
const baseModel = computed(() => store.data.models.find((m) => m.id === form.modelId))
// 弹窗当前选中的训练数据集，版本下拉随它联动。
const currentDataset = computed(() =>
  trainingDatasets.value.find((d) => d.id === form.datasetId),
)
// 根据当前数据集推断它配套的脚本 dataset_key。
// 聚合接口已在数据集顶层下发 datasetKey（优先）；再兜底 metadata；最后按名称关键词匹配。
const currentDatasetKey = computed(() => {
  const ds = currentDataset.value
  if (!ds) return ''
  const top = (ds as Record<string, unknown>).datasetKey
  if (typeof top === 'string' && top) return top
  const meta = (ds as Record<string, unknown>).metadata as Record<string, unknown> | undefined
  const fromMeta = meta?.datasetKey
  if (typeof fromMeta === 'string' && fromMeta) return fromMeta
  const name = `${ds.name || ''} ${ds.sourceName || ''}`
  if (/fashion|服饰|MNIST/i.test(name)) return 'fashion-mnist'
  if (/cifar/i.test(name)) return 'cifar100'
  if (/合成|synthetic|mlp/i.test(name)) return 'synthetic'
  return ''
})
// 脚本下拉按当前数据集过滤：只显示 dataset_key 匹配的脚本；数据集没匹配上时下拉为空并提示。
const filteredScripts = computed(() => {
  const key = currentDatasetKey.value
  if (!key) return []
  return realScripts.value.filter((s) => s.datasetKey === key)
})
// 切换数据集后，脚本下拉自动选第一个匹配的脚本；没有匹配则清空。
watch(currentDatasetKey, (key) => {
  if (!key) { form.scriptId = ''; return }
  const matched = realScripts.value.filter((s) => s.datasetKey === key)
  if (!matched.some((s) => s.id === form.scriptId)) {
    form.scriptId = matched[0]?.id ?? ''
  }
})
// 后台刷新后原选中数据集可能被标成测试集而掉出选项，自动回退到当前首项，避免表单残留失效 ID。
watch(trainingDatasets, (list) => {
  if (!list.some((d) => d.id === form.datasetId)) form.datasetId = list[0]?.id || ''
})
// 切换数据集后，数据版本默认选中该数据集当前版本（versions 中与主版本一致者），否则取首项；
// 版本表缺失时兜底主表 version，保证下拉不出现空值。
watch(
  () => form.datasetId,
  (datasetId) => {
    const d = trainingDatasets.value.find((item) => item.id === datasetId)
    const versions = d?.versions ?? []
    form.datasetVersion =
      versions.find((v) => v.version === d?.version)?.version ??
      versions[0]?.version ??
      d?.version ??
      ''
  },
  { immediate: true },
)
watch(
  baseModel,
  (m) => {
    form.baseVersion = m?.version || ''
  },
  { immediate: true },
)
async function submit() {
  if (
    ![form.epochs, form.batchSize, form.learningRate].every(
      (n) => typeof n === 'number' && Number.isFinite(n) && n > 0,
    )
  )
    return void ElMessage.warning('请填写有效的训练轮次、批次大小和学习率')
  // 只接受训练集下拉里的数据集，防止把已标为测试集的数据集提交成训练输入。
  const ds = trainingDatasets.value.find((d) => d.id === form.datasetId)
  // 数据版本必须是该数据集版本清单中的一项，防止提交未登记或已失效的版本。
  const datasetVersionValid =
    !!ds &&
    (ds.versions.some((v) => v.version === form.datasetVersion) ||
      form.datasetVersion === ds.version)
  if (
    !form.name.trim() ||
    !ds ||
    !datasetVersionValid ||
    !baseModel.value ||
    !/^v?\d+\.\d+\.\d+$/.test(form.targetVersion)
  )
    return void ElMessage.warning('请填写任务名称、数据集、有效的数据版本和目标版本，如 v2.2.0')
  if (
    baseModel.value.versions.some(
      (v) => v.version.replace(/^v/, '') === form.targetVersion.replace(/^v/, ''),
    )
  )
    return void ElMessage.warning('目标版本已存在，请使用新版本号')
  try {
    if (isGovernanceLlm && !isMock) {
      await createRealTraining({
        name: form.name.trim(),
        modelId: form.modelId,
        baseVersion: form.baseVersion,
        datasetId: form.datasetId,
        datasetVersion: form.datasetVersion,
        epochs: form.epochs,
        learningRate: form.learningRate,
        batchSize: form.batchSize,
        targetVersion: form.targetVersion,
        method: form.method || trainingMethods[0],
        scriptId: form.scriptId,
        ...(scriptHasTrainSamples ? { trainSamples: form.trainSamples } : {}),
      })
      dialog.value = false
      ElMessage.success('真实训练任务已创建，等待模型服务执行')
      await store.load()
      return
    }
    const trainingInput = {
      ...form,
      name: form.name.trim(),
      method: form.method || trainingMethods[0],
      datasetVersion: form.datasetVersion,
    }
    const task = await store.addTraining(trainingInput)
    selectedId.value = task.id
    dialog.value = false
    ElMessage.success('训练任务已登记，等待启动')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '创建失败')
  }
}

/** 拉取全量指标事件并按轮聚合出真实曲线与检查点（任务事件量有限，直接翻页拉全）。 */
async function collectRealCurves(taskId: string) {
  const items: { phase?: string | null; epoch?: number | null; metrics?: Record<string, number> }[] = []
  let after = 0
  for (let guard = 0; guard < 20; guard += 1) {
    const page = await fetchRealTrainingMetrics(taskId, after)
    items.push(...(page.items || []))
    if (!page.hasMore) break
    after = page.nextAfterId
  }
  const trainLoss: Record<number, number> = {}
  const validationLoss: Record<number, number> = {}
  for (const item of items) {
    const epoch = item.epoch
    if (!epoch || !item.metrics) continue
    // train 事件逐步覆盖，最后一个值是该轮最后一步的瞬时 loss
    if (item.phase === 'train' && typeof item.metrics.loss === 'number') trainLoss[epoch] = item.metrics.loss
    // validation 事件在同轮 train 事件之后：用轮均 train_loss 覆盖瞬时值，loss 才是验证损失
    if (item.phase === 'validation') {
      if (typeof item.metrics.train_loss === 'number') trainLoss[epoch] = item.metrics.train_loss
      if (typeof item.metrics.loss === 'number') validationLoss[epoch] = item.metrics.loss
    }
  }
  const epochs = [...new Set([...Object.keys(trainLoss), ...Object.keys(validationLoss)])]
    .map(Number)
    .sort((a, b) => a - b)
  // 缺值用 null 占位（曲线断点、面板显示“暂无”），不用训练损失顶替验证损失
  return {
    lossHistory: epochs.map((epoch) => trainLoss[epoch] ?? null),
    validationLossHistory: epochs.map((epoch) => validationLoss[epoch] ?? null),
    checkpoints: epochs
      .filter((epoch) => validationLoss[epoch] != null)
      .map((epoch) => ({
        name: `checkpoint-${String(epoch).padStart(2, '0')}`,
        epoch,
        loss: validationLoss[epoch],
      })),
  }
}

/** 把模型服务的真实状态同步进 8000 台账；有变化时刷新页面数据。 */
async function syncRealTasks() {
  const running = store.data.training.filter(
    (t) => isRealId(t.id) && (t.status === 'pending' || t.status === 'running'),
  )
  if (!running.length) return
  let changed = false
  for (const task of running) {
    try {
      const detail = (await fetchRealTrainingTask(task.id)) as Record<string, unknown>
      const curves = await collectRealCurves(task.id)
      await syncRealTraining(task.id, {
        status: String(detail.status || 'running'),
        epoch: Number(detail.epoch || 0),
        progress: Number(detail.progress || 0),
        lossHistory: curves.lossHistory,
        validationLossHistory: curves.validationLossHistory,
        checkpoints: curves.checkpoints,
        errorMessage: (detail.errorMessage as string) || null,
      })
      changed = true
    } catch {
      // 单个任务同步失败静默重试：下一轮 5 秒节拍会再次尝试，不打断页面。
    }
  }
  if (changed) await store.load()
}

let syncTimer: ReturnType<typeof setInterval> | undefined
function ensureSyncTimer() {
  const active = store.data.training.some(
    (t) => isRealId(t.id) && (t.status === 'pending' || t.status === 'running'),
  )
  if (active && !syncTimer) syncTimer = setInterval(() => void syncRealTasks(), 5000)
  if (!active && syncTimer) {
    clearInterval(syncTimer)
    syncTimer = undefined
  }
}
watch(() => store.data.training, ensureSyncTimer, { deep: true })
onMounted(() => {
  void syncRealTasks()
  ensureSyncTimer()
  void loadRealScripts()
})
onBeforeUnmount(() => {
  if (syncTimer) clearInterval(syncTimer)
})

const artifacts = ref<RealArtifact[]>([])
const artifactsBusy = ref(false)
const artifactsError = ref('')
watch(
  selected,
  async (task) => {
    artifacts.value = []
    artifactsError.value = ''
    if (!task || !isRealId(task.id) || !isGovernanceLlm || isMock) return
    artifactsBusy.value = true
    try {
      artifacts.value = await listRealArtifacts(task.id)
    } catch (e) {
      artifactsError.value = e instanceof Error ? e.message : '产物读取失败'
    } finally {
      artifactsBusy.value = false
    }
  },
  { immediate: true },
)
async function saveArtifact(row: RealArtifact) {
  if (!selected.value) return
  try {
    await downloadRealArtifact(selected.value.id, row.id, row.filename)
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '产物下载失败')
  }
}
</script>
<template>
  <WorkbenchKpis :items="kpis" />
  <div class="mw-training-grid">
    <PanelCard title="训练任务" icon="Tickets"
      ><template #extra
        ><el-button type="primary" :icon="Plus" @click="dialog = true"
          >新建任务</el-button
        ></template
      >
      <el-input
        v-model="keyword"
        placeholder="搜索任务名称、状态"
        clearable
        aria-label="搜索训练任务"
      />
      <div class="mw-task-list">
        <button
          v-for="task in tasks"
          :key="task.id"
          :class="['mw-task', { active: task.id === selectedId }]"
          @click="selectedId = task.id"
        >
          <div class="mw-row">
            <b>{{ task.name }}</b
            ><el-tag>{{ trainingStates[task.status] }}</el-tag>
          </div>
          <p>{{ task.description }}</p>
          <el-progress :percentage="task.progress" /><small
            >更新于 {{ formatModelTime(task.updatedAt) }}</small
          ></button
        ><el-empty v-if="!tasks.length" description="暂无匹配的训练任务" :image-size="70" />
      </div>
    </PanelCard>
    <PanelCard :title="selected?.name || '训练进度'" icon="TrendCharts"
      ><template #extra
        ><el-tag v-if="isMock">训练过程模拟</el-tag
        ><el-tag v-else-if="isRealId(selected?.id)" type="success">真实训练</el-tag></template
      >
      <template v-if="selected"
        ><div class="mw-info-strip">
          已完成轮次 <b>{{ selected.epoch }} / {{ selected.epochs }}</b
          ><span>已用时 {{ selected.elapsed }}</span>
        </div>
        <el-progress :percentage="selected.progress" /><WorkbenchChart
          v-if="selected.loss.length"
          :option="chart"
          label="训练与验证损失曲线"
        /><el-empty v-else description="任务尚未产生训练日志" />
        <div class="mw-metric-pair">
          <div>
            当前训练损失<strong>{{ selected.loss[selected.loss.length - 1] ?? '暂无' }}</strong>
          </div>
          <div>
            验证损失<strong>{{
              selected.validationLoss[selected.validationLoss.length - 1] ?? '暂无'
            }}</strong>
          </div>
        </div></template
      ><el-empty v-else description="请选择训练任务" />
    </PanelCard>
    <PanelCard title="训练配置" icon="Setting"
      ><el-descriptions v-if="selected" :column="1" border
        ><el-descriptions-item label="基础模型"
          >{{ model?.name }} {{ selected.baseVersion }}</el-descriptions-item
        ><el-descriptions-item label="训练方式">{{ selected.method || '未记录' }}</el-descriptions-item
        ><el-descriptions-item label="数据集">{{
          dataset?.name || selected.datasetId
        }}</el-descriptions-item
        ><el-descriptions-item label="数据版本">{{ selected.datasetVersion }}</el-descriptions-item
        ><el-descriptions-item label="样本量"
          >{{ dataset?.rowCount.toLocaleString() || '暂无' }} 条</el-descriptions-item
        ><el-descriptions-item label="学习率">{{ selected.learningRate }}</el-descriptions-item
        ><el-descriptions-item label="批次大小">{{ selected.batchSize }}</el-descriptions-item
        ><el-descriptions-item label="训练轮次">{{
          selected.epochs
        }}</el-descriptions-item></el-descriptions
      ></PanelCard
    >
  </div>
  <div v-if="selected" class="mw-grid mw-wide-left">
    <PanelCard title="检查点与训练产物" icon="Coin"
      ><el-table :data="selected.checkpoints" border empty-text="暂无检查点"
        ><el-table-column prop="name" label="检查点" min-width="150" /><el-table-column
          prop="epoch"
          label="轮次"
          width="80"
        /><el-table-column prop="loss" label="验证损失" /><el-table-column label="状态"
          ><template #default>已保存</template></el-table-column
        ><el-table-column label="操作" width="80"
          ><template #default="{ row }"
            ><el-button link type="primary" @click="checkpoint = row">查看</el-button></template
          ></el-table-column
        ></el-table
      >
      <div class="mw-info-strip">
        目标模型版本 <b>{{ selected.targetVersion }}</b
        ><router-link
          v-if="selected.status === 'succeeded'"
          :to="{ path: '/model-train/management', query: { modelId: selected.modelId } }"
          >查看模型产物</router-link
        ><span v-else>完成后登记模型产物</span>
      </div></PanelCard
    >
    <PanelCard
      v-if="isGovernanceLlm && isRealId(selected.id)"
      class="mw-artifact-panel"
      title="模型服务产物（真实文件）"
      icon="Download"
      ><el-alert
        v-if="artifactsError"
        type="warning"
        :closable="false"
        show-icon
        :title="artifactsError"
      /><el-table
        v-else
        v-loading="artifactsBusy"
        :data="artifacts"
        border
        empty-text="任务完成后即可下载产物"
        ><el-table-column
          prop="filename"
          label="文件"
          min-width="220"
          show-overflow-tooltip
        /><el-table-column prop="kind" label="类型" width="110" /><el-table-column
          label="大小"
          width="100"
          ><template #default="{ row }">{{ (row.size / 1024).toFixed(1) }} KB</template></el-table-column
        ><el-table-column label="SHA-256" min-width="130"
          ><template #default="{ row }"
            ><el-tooltip :content="row.sha256" placement="top"
              ><code class="mw-sha">{{ row.sha256.slice(0, 12) }}…</code></el-tooltip
            ></template
          ></el-table-column
        ><el-table-column label="操作" width="80" fixed="right"
          ><template #default="{ row }"
            ><el-button link type="primary" @click="saveArtifact(row)">下载</el-button></template
          ></el-table-column
        ></el-table
      ></PanelCard
    >
    <ComplianceEventMonitor
      :training-task-id="selected.id"
      :running="selected.status === 'running'"
    />
  </div>
  <el-dialog v-model="dialog" title="新建训练任务" width="560px" class="mw-dialog"
    ><el-form label-width="100px" @submit.prevent="submit"
      ><el-form-item label="任务名称" required
        ><el-input v-model="form.name" maxlength="80" /></el-form-item
      ><el-form-item label="基础模型" required
        ><el-select v-model="form.modelId"
          ><el-option
            v-for="m in store.data.models"
            :key="m.id"
            :label="m.name"
            :value="m.id" /></el-select></el-form-item
      ><el-form-item label="基础版本"
        ><el-select v-model="form.baseVersion"
          ><el-option
            v-for="v in baseModel?.versions"
            :key="v.version"
            :value="v.version" /></el-select></el-form-item
      ><el-form-item label="训练数据" required
        ><el-select v-model="form.datasetId"
          ><el-option
            v-for="d in trainingDatasets"
            :key="d.id"
            :value="d.id"
            :label="d.name" /></el-select></el-form-item
      ><el-form-item label="数据版本" required
        ><el-select v-model="form.datasetVersion"
          ><el-option
            v-for="v in currentDataset?.versions"
            :key="v.versionId || v.version"
            :value="v.version"
            :label="v.version" /></el-select></el-form-item
      ><el-form-item v-if="isGovernanceLlm && !isMock" label="训练脚本" required
        ><el-select v-model="form.scriptId" :loading="realScriptsLoading" :disabled="filteredScripts.length === 0"
          ><el-option
            v-for="script in filteredScripts"
            :key="script.id"
            :label="script.name"
            :value="script.id" /></el-select
        ><span v-if="realScriptsError" class="mw-field-hint" style="color:#f56c6c">{{ realScriptsError }}</span
        ><span v-else-if="currentDatasetKey && filteredScripts.length === 0" class="mw-field-hint" style="color:#e6a23c">当前数据集暂无配套训练脚本，请先在 8001 注册对应脚本</span
        ><span v-else class="mw-field-hint">{{ realScriptHint }}</span></el-form-item
      ><el-form-item v-if="isGovernanceLlm && !isMock && scriptHasTrainSamples" label="训练样本数"
        ><el-input-number
          v-model="form.trainSamples"
          :min="100"
          :max="60000"
          :step="1000"
          :precision="0"
        /><span class="mw-field-hint">按类等额抽样；首批演示建议 5000 条以内，CPU 分钟级完成。</span
        ></el-form-item
      ><el-form-item label="训练方式" required
        ><el-select v-model="form.method">
          <el-option
            v-for="method in trainingMethods"
            :key="method"
            :label="method"
            :value="method" />
        </el-select></el-form-item
      ><el-form-item label="目标版本" required
        ><el-input v-model="form.targetVersion" placeholder="例如 v2.2.0" /></el-form-item
      ><el-form-item label="学习率"
        ><el-input-number
          v-model="form.learningRate"
          :min="0.000001"
          :max="1"
          :step="0.0001"
          :precision="6" /></el-form-item
      ><el-form-item label="批次大小"
        ><el-input-number
          v-model="form.batchSize"
          :min="1"
          :max="256"
          :precision="0" /></el-form-item
      ><el-form-item label="训练轮次"
        ><el-input-number
          v-model="form.epochs"
          :min="1"
          :max="100"
          :precision="0" /></el-form-item></el-form
    ><template #footer
      ><el-button @click="dialog = false">取消</el-button
      ><el-button type="primary" :loading="store.busy" @click="submit"
        >创建任务</el-button
      ></template
    ></el-dialog
  >
  <el-dialog
    :model-value="!!checkpoint"
    title="检查点详情"
    width="440px"
    class="mw-dialog"
    @close="checkpoint = undefined"
    ><el-descriptions v-if="checkpoint" :column="1" border
      ><el-descriptions-item label="名称">{{ checkpoint.name }}</el-descriptions-item
      ><el-descriptions-item label="轮次">{{ checkpoint.epoch }}</el-descriptions-item
      ><el-descriptions-item label="验证损失">{{ checkpoint.loss }}</el-descriptions-item
      ><el-descriptions-item label="关联任务">{{
        selected?.id
      }}</el-descriptions-item></el-descriptions
    ></el-dialog
  >
</template>
