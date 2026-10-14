<script setup lang="ts">
/** 多语言语义权重与风险分层工作台（GN21）。
 * 场景应用「多语言语义权重」页签（路由 /scenario/ethnic-governance）。
 * 左：模型/数据集/版本/语种/模式表单；右：分析结果（统计卡、权重分布、
 * 风险分层、关键片段）；底部：场景分析记录。接口走模型服务 8001，
 * 未联通时按 withFallback 自动回落固定模拟数据。
 */
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox, type UploadFile } from 'element-plus'
import PanelCard from '../../components/PanelCard.vue'
import AppIcon from '../../components/AppIcon.vue'
import RiskTierDonut from './components/RiskTierDonut.vue'
import { listScenarioModels } from '../../api/scenario'
import { getGovernanceResources } from '../../api/governance-resources'
import type { GovernanceResource } from '../../types/governance-resources'
import {
  fetchMultilingualResult,
  fetchMultilingualResultHistory,
  fetchMultilingualTask,
  fetchLatestMultilingualResult,
  startMultilingualAnalysis,
} from '../../api/ethnic-multilingual'
import { DEMO_MODEL_ID, DEMO_SCOPE } from '../../mock/ethnic-multilingual'
import {
  languageName,
  multilingualRiskLevels,
  riskLevelTagType,
  type MultilingualAnalysisMode,
  type MultilingualResult,
  type MultilingualRiskLevel,
  type MultilingualScope,
} from '../../types/ethnic-multilingual'

/* ---------------- 表单状态 ---------------- */

const modelOptions = ref<{ modelId: string; name: string }[]>([
  { modelId: DEMO_MODEL_ID, name: 'InternLM3-8B（多语言安全增强版）' },
])
const modelId = ref(DEMO_MODEL_ID)

/** 数据集/版本/语种均来自资源目录接口（与数据价值分析同源）。 */
const resources = ref<GovernanceResource[]>([])
const resourcesFailed = ref(false)
const datasetId = ref(0)
const versionId = ref('')

const versions = computed(
  () => resources.value.find((item) => item.id === datasetId.value)?.versions ?? [],
)
const languageOptions = computed(() =>
  (versions.value.find((item) => item.id === versionId.value)?.languages ?? []).map((item) => ({
    value: item.code,
    label: languageName(item.code),
  })),
)

const selectedLanguages = ref<string[]>([])
const analysisMode = ref<MultilingualAnalysisMode>('semantic_weighting')

/** 资源目录不可用时回落到演示范围，页面仍可演示。 */
function fallbackResources(): GovernanceResource[] {
  return [
    {
      id: DEMO_SCOPE.datasetId,
      name: '多语言安全测试集',
      versions: [
        {
          id: DEMO_SCOPE.versionId,
          label: DEMO_SCOPE.versionId,
          languages: DEMO_SCOPE.languages.map((code) => ({ code, name: languageName(code) })),
        },
      ],
    },
  ]
}

function versionLanguages(id: string): string[] {
  return (
    versions.value
      .find((item) => item.id === id)
      ?.languages.map((item) => item.code) ?? []
  )
}

/** 选中数据集/版本后默认分析该版本覆盖的全部语种。 */
function selectDataset(id: number) {
  datasetId.value = id
  const first = versions.value[0]?.id ?? ''
  versionId.value = first
  selectedLanguages.value = versionLanguages(first)
}
function selectVersion(id: string) {
  versionId.value = id
  selectedLanguages.value = versionLanguages(id)
}

async function loadResources() {
  resourcesFailed.value = false
  try {
    const list = await getGovernanceResources()
    if (!list.length) throw new Error('资源目录为空')
    resources.value = list
    selectDataset(list[0]!.id)
  } catch {
    resourcesFailed.value = true
    resources.value = fallbackResources()
    selectDataset(DEMO_SCOPE.datasetId)
  }
}

async function onDatasetChange(id: number) {
  selectDataset(id)
  await loadInitial()
}
async function onVersionChange(id: string) {
  selectVersion(id)
  await loadInitial()
}

/** 参考材料仅本地记录，不参与后端任务（后端按数据集范围分析）。 */
function onMaterialChange(file: UploadFile) {
  ElMessage.success(`已添加参考材料：${file.name}`)
}

/* ---------------- 结果与记录 ---------------- */

const result = ref<MultilingualResult | null>(null)
const analyzing = ref(false)
const history = ref<MultilingualResult[]>([])

const score = computed(() => result.value?.overallRiskScore ?? null)
const consistency = computed(() => result.value?.semanticConsistency ?? null)
const highWeight = computed(() => result.value?.highRiskSemanticWeight ?? null)
const coveredCount = computed(() => result.value?.coveredLanguageCount ?? null)
/** 语种短名（覆盖语言数卡片用），未命中时回落全称。 */
const languageShortNames: Record<string, string> = {
  zh: '中',
  en: '英',
  ug: '维',
  bo: '藏',
  ar: '阿',
  ru: '俄',
}
const coveredLanguages = computed(() =>
  result.value
    ? result.value.languageDistribution
        .map((item) => languageShortNames[item.language] ?? languageName(item.language))
        .join('/')
    : '',
)
const tierTotal = computed(() =>
  result.value
    ? result.value.riskDistribution.reduce((sum, item) => sum + item.count, 0)
    : 0,
)

function buildScope(mode: MultilingualAnalysisMode): MultilingualScope {
  return {
    datasetId: datasetId.value,
    versionId: versionId.value,
    languages: [...selectedLanguages.value].sort(),
    analysisMode: mode,
    schemeId: 'multilingual-v1',
  }
}

async function loadModels() {
  try {
    const list = await listScenarioModels()
    if (list.length) {
      modelOptions.value = list
      if (!list.some((item) => item.modelId === modelId.value))
        modelId.value = list[0]!.modelId
    }
  } catch {
    // 模型目录不可用时保留默认模型选项，页面仍可演示
  }
}

async function loadInitial() {
  if (!versionId.value || !selectedLanguages.value.length) {
    result.value = null
    history.value = []
    return
  }
  const scope = buildScope('semantic_weighting')
  try {
    result.value = await fetchLatestMultilingualResult(scope)
  } catch {
    // 最近结果加载失败时，历史记录仍应正常展示
  }
  try {
    await refreshHistory()
  } catch {
    // 历史记录非关键路径，失败时保留空列表
  }
}

async function refreshHistory() {
  if (!versionId.value || !selectedLanguages.value.length) {
    history.value = []
    return
  }
  history.value = await fetchMultilingualResultHistory(buildScope('semantic_weighting'))
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** 轮询任务直到成功，然后取结果。 */
async function waitForResult(taskId: string): Promise<MultilingualResult> {
  for (let i = 0; i < 90; i++) {
    if (i > 0) await sleep(2000)
    const task = await fetchMultilingualTask(taskId)
    if (task.status === 'succeeded' && task.resultId) {
      return await fetchMultilingualResult(task.resultId)
    }
    if (task.status === 'failed')
      throw new Error(task.errorMessage || '分析任务执行失败')
  }
  throw new Error('分析任务超时，请稍后在「场景分析记录」中查看')
}

async function submit() {
  if (!datasetId.value || !versionId.value) {
    ElMessage.warning('请先选择数据集与版本')
    return
  }
  if (!selectedLanguages.value.length) {
    ElMessage.warning('请至少选择一个分析语种')
    return
  }
  analyzing.value = true
  try {
    const scope = buildScope(analysisMode.value)
    const task = await startMultilingualAnalysis(scope, modelId.value)
    result.value = await waitForResult(task.taskId)
    ElMessage.success('建模分析完成')
    await refreshHistory()
  } catch (error) {
    if (error instanceof Error && error.message) ElMessage.error(error.message)
  } finally {
    analyzing.value = false
  }
}

/* ---------------- 展示辅助 ---------------- */

function languagesText(row: MultilingualResult): string {
  return row.scope.languages.map(languageName).join('、')
}
function tierName(level: MultilingualRiskLevel): string {
  const names: Record<string, string> = {
    safe: '安全层',
    low: '低风险层',
    medium: '中风险层',
    high: '高风险层',
    unknown: '未评估',
  }
  return names[level] ?? level
}
function deltaText(value: number | null | undefined): string {
  if (value === null || value === undefined) return '不适用'
  return `${value > 0 ? '+' : ''}${value}`
}
function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/* ---------------- 记录联动与弹窗 ---------------- */

const evidenceDialogOpen = ref(false)

/** 页面滚动容器：桌面画布下为 .main-content，否则回落到窗口。 */
function scrollToTop() {
  const container = document.querySelector<HTMLElement>('.main-content')
  if (container && container.scrollHeight > container.clientHeight) {
    container.scrollTo({ top: 0, behavior: 'smooth' })
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** 点击「查看详情」：把该记录填入上方结果区（分析结果/权重分布/判定依据）并滚到页面顶部。 */
function openDetail(row: MultilingualResult) {
  result.value = row
  scrollToTop()
}

async function removeRecord(row: MultilingualResult) {
  try {
    await ElMessageBox.confirm('确认删除该条分析记录？删除后不可恢复。', '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  // 6 个接口中没有删除端点；这里仅更新当前列表，真实删除由后端负责，刷新后以后端为准。
  history.value = history.value.filter((item) => item.id !== row.id)
  ElMessage.success('记录已删除')
}

/** 下载文本报告（演示：由当前结果生成；联通后可改为后端导出接口）。 */
function downloadReport(row: MultilingualResult) {
  const lines = [
    '多语言语义权重与风险分层分析报告',
    '='.repeat(36),
    `报告编号：${row.id}`,
    `任务编号：${row.taskId}`,
    `数据集：${row.datasetName}（${row.scope.versionId}）`,
    `分析语种：${languagesText(row)}`,
    `完成时间：${formatDateTime(row.finishedAt)}`,
    '',
    `综合风险分数：${row.overallRiskScore?.toFixed(2) ?? '—'}`,
    `综合风险等级：${multilingualRiskLevels[row.overallRiskLevel]}`,
    `语义一致性：${row.semanticConsistency?.toFixed(2) ?? '—'}`,
    `高风险语义权重：${row.highRiskSemanticWeight?.toFixed(1) ?? '—'}%`,
    `覆盖语言数：${row.coveredLanguageCount}`,
    '',
    '风险分层：',
    ...row.riskDistribution.map(
      (item) =>
        `  - ${tierName(item.level)}：${item.count} 条（${item.percent.toFixed(1)}%）`,
    ),
    '',
    '数据权重判别准确率：',
    row.dataWeightClassificationAccuracy === null
      ? '  - 无标准档位样本，暂无法计算'
      : `  - ${(row.dataWeightClassificationAccuracy * 100).toFixed(2)}%（${row.accuracyCorrectCount}/${row.accuracyTestCount}）`,
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `多语言分析报告-${row.id}.txt`
  anchor.click()
  URL.revokeObjectURL(url)
  ElMessage.success('报告已生成并下载')
}

onMounted(async () => {
  void loadModels()
  await loadResources()
  await loadInitial()
})
</script>

<template>
  <div class="ml-workbench">
    <!-- 顶部横幅 -->
    <div class="ml-banner">
      <div class="ml-banner-body">
        <span class="eyebrow">SCENARIO APPLICATION</span>
        <h2>多语言语义权重与风险分层工作台</h2>
        <p>
          面向多语言、多文化语境，进行语义权重建模与风险分层识别，支持中文、英文及少数民族语言等多语种内容的安全评估与治理分析。
        </p>
      </div>
      <div class="ml-banner-deco" aria-hidden="true">
        <span class="pill p1">中文</span>
        <span class="pill p2">English</span>
        <span class="pill p3" dir="rtl">العربية</span>
        <span class="pill p4" dir="rtl">ئۇيغۇرچە</span>
        <span class="pill p5">བོད་སྐད།</span>
        <span class="pill p6">Русский</span>
        <span class="globe"></span>
      </div>
    </div>

    <!-- 表单 + 结果 -->
    <div class="ml-main">
      <PanelCard title="多语言语义分析" icon="ChatDotRound">
        <el-alert
          v-if="resourcesFailed"
          class="scope-alert"
          type="warning"
          :closable="false"
          title="数据集目录加载失败，当前为演示范围"
        >
          <el-button link type="primary" @click="loadResources">重试</el-button>
        </el-alert>
        <el-form label-position="top" class="ml-form" @submit.prevent>
          <el-form-item label="选择模型">
            <el-select v-model="modelId" class="full">
              <el-option
                v-for="item in modelOptions"
                :key="item.modelId"
                :label="item.name"
                :value="item.modelId"
              />
            </el-select>
            <p class="hint">支持中、英及少数民族语言的语义理解与风险识别。</p>
          </el-form-item>

          <el-form-item label="选择数据集">
            <el-select
              v-model="datasetId"
              class="full"
              filterable
              placeholder="选择数据集"
              @change="onDatasetChange"
            >
              <el-option
                v-for="item in resources"
                :key="item.id"
                :label="item.name"
                :value="item.id"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="选择版本">
            <el-select
              v-model="versionId"
              class="full"
              placeholder="选择版本"
              @change="onVersionChange"
            >
              <el-option v-for="item in versions" :key="item.id" :label="item.label" :value="item.id" />
            </el-select>
          </el-form-item>

          <el-form-item label="选择分析语种（可多选）">
            <el-select
              v-model="selectedLanguages"
              multiple
              collapse-tags
              collapse-tags-tooltip
              class="full"
              placeholder="请选择语种"
            >
              <el-option
                v-for="item in languageOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-select>
            <p class="hint">语种来自所选数据集版本实际覆盖范围。</p>
          </el-form-item>

          <el-form-item label="分析模式">
            <el-radio-group v-model="analysisMode">
              <el-radio value="semantic_weighting">语义权重建模</el-radio>
              <el-radio value="risk_tiering">风险分层识别</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="参考材料（可选）">
            <el-upload
              :auto-upload="false"
              multiple
              accept=".txt,.doc,.docx,.pdf,.md"
              :on-change="onMaterialChange"
            >
              <el-button class="upload-btn">
                <AppIcon name="Upload" /> 上传文件（支持 txt、doc、pdf 等）
              </el-button>
            </el-upload>
          </el-form-item>

          <el-button
            class="full submit-btn"
            type="primary"
            :loading="analyzing"
            @click="submit"
          >
            开始建模分析
          </el-button>
        </el-form>
      </PanelCard>

      <div class="ml-results">
        <PanelCard title="分析结果" icon="DataAnalysis">
          <div v-if="result" class="stat-cards">
            <div class="stat-card">
              <div class="stat-head">
                <AppIcon name="WarnTriangleFilled" class="ic red" />
                <span class="stat-label">综合风险等级</span>
                <el-tag
                  :type="riskLevelTagType[result.overallRiskLevel]"
                  size="small"
                  effect="light"
                >
                  {{ multilingualRiskLevels[result.overallRiskLevel] }}
                </el-tag>
              </div>
              <div class="stat-value">
                <strong>{{ score === null ? '—' : score.toFixed(2) }}</strong>
                <i>/1.00</i>
              </div>
            </div>

            <div class="stat-card">
              <div class="stat-head">
                <AppIcon name="Share" class="ic blue" />
                <span class="stat-label">
                  语义一致性
                  <el-tooltip content="各语种风险语义分布的两两 Jensen-Shannon 相似度均值">
                    <AppIcon name="InfoFilled" class="info-ic" />
                  </el-tooltip>
                </span>
              </div>
              <div class="stat-value">
                <strong>{{ consistency === null ? '—' : consistency.toFixed(2) }}</strong>
                <span v-if="result.semanticConsistencyDelta !== null" class="delta up">
                  ↑ {{ deltaText(result.semanticConsistencyDelta) }}
                </span>
              </div>
            </div>

            <div class="stat-card">
              <div class="stat-head">
                <AppIcon name="DataAnalysis" class="ic purple" />
                <span class="stat-label">高风险语义权重</span>
              </div>
              <div class="stat-value">
                <strong>
                  {{ highWeight === null ? '—' : `${highWeight.toFixed(1)}%` }}
                </strong>
                <span v-if="result.highRiskSemanticWeightDelta !== null" class="delta up">
                  ↑ {{ deltaText(result.highRiskSemanticWeightDelta) }}%
                </span>
              </div>
            </div>

            <div class="stat-card">
              <div class="stat-head">
                <AppIcon name="Position" class="ic cyan" />
                <span class="stat-label">样本覆盖语言数</span>
              </div>
              <div class="stat-value">
                <strong>{{ coveredCount ?? '—' }}</strong>
                <i>种</i>
              </div>
              <p class="covered-langs">{{ coveredLanguages }}</p>
            </div>
          </div>
          <div v-else class="result-empty">
            <b>尚未分析</b>
            <p>选择数据集、版本与语种后，点击「开始建模分析」。</p>
          </div>
        </PanelCard>

        <template v-if="result">
          <div class="result-grid">
            <PanelCard title="多语言语义权重分布" icon="Histogram">
              <el-table :data="result.languageDistribution" size="small">
                <el-table-column label="语言" width="84">
                  <template #default="{ row }">{{ languageName(row.language) }}</template>
                </el-table-column>
                <el-table-column label="安全语义">
                  <template #default="{ row }">
                    <div class="wbar">
                      <span class="wbar-fill safe" :style="{ width: `${row.safeWeight}%` }"></span>
                      <em>{{ row.safeWeight.toFixed(1) }}%</em>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="中性语义">
                  <template #default="{ row }">
                    <div class="wbar">
                      <span
                        class="wbar-fill neutral"
                        :style="{ width: `${row.neutralWeight}%` }"
                      ></span>
                      <em>{{ row.neutralWeight.toFixed(1) }}%</em>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="风险语义">
                  <template #default="{ row }">
                    <div class="wbar">
                      <span class="wbar-fill risk" :style="{ width: `${row.riskWeight}%` }"></span>
                      <em>{{ row.riskWeight.toFixed(1) }}%</em>
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </PanelCard>

            <PanelCard class="tier-card" title="风险分层结果" icon="PieChart">
              <div class="tier-panel">
                <div class="tier-list">
                  <div
                    v-for="item in result.riskDistribution"
                    :key="item.level"
                    class="tier-row"
                    :class="item.level"
                  >
                    <span class="tier-dot"></span>
                    <span class="tier-name">{{ tierName(item.level) }}</span>
                    <span class="tier-bar">
                      <span
                        class="tier-bar-fill"
                        :style="{ width: `${Math.max(item.percent, 2)}%` }"
                      ></span>
                    </span>
                    <span class="tier-count">
                      <strong>{{ item.count }}</strong>
                      <i>条</i>
                    </span>
                    <span class="tier-percent">{{ item.percent.toFixed(1) }}%</span>
                  </div>
                </div>
                <div class="tier-side">
                  <RiskTierDonut :items="result.riskDistribution" />
                  <p class="tier-total">
                    当前范围共 <strong>{{ tierTotal }}</strong> 条样本
                  </p>
                </div>
              </div>
            </PanelCard>
          </div>

          <PanelCard title="风险判定依据 / 关键语义片段" icon="Document">
            <template #extra>
              <el-button link type="primary" @click="evidenceDialogOpen = true">
                查看更多 ›
              </el-button>
            </template>
            <el-table :data="result.riskEvidence.slice(0, 4)" size="small">
              <el-table-column label="语种" width="78">
                <template #default="{ row }">{{ languageName(row.language) }}</template>
              </el-table-column>
              <el-table-column label="关键语义片段" prop="quote" />
              <el-table-column label="语义权重" width="90">
                <template #default="{ row }">
                  <span class="weight-num">{{ row.semanticWeight.toFixed(2) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="风险层级" width="90">
                <template #default="{ row }">
                  <el-tag
                    :type="riskLevelTagType[row.riskLevel as MultilingualRiskLevel]"
                    size="small"
                  >
                    {{ multilingualRiskLevels[row.riskLevel as MultilingualRiskLevel] }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>
          </PanelCard>
        </template>
      </div>
    </div>

    <!-- 场景分析记录 -->
    <PanelCard title="场景分析记录" icon="Tickets">
      <template #extra>
        <el-button link @click="refreshHistory">
          <AppIcon name="Refresh" /> 刷新
        </el-button>
      </template>
      <el-table :data="history" size="small">
        <el-table-column type="index" label="#" width="44" />
        <el-table-column label="数据集 / 版本" min-width="240">
          <template #default="{ row }">{{ row.datasetName }}（{{ row.scope.versionId }}）</template>
        </el-table-column>
        <el-table-column label="语种" width="170">
          <template #default="{ row }">{{ languagesText(row) }}</template>
        </el-table-column>
        <el-table-column label="语义权重" width="90">
          <template #default="{ row }">
            {{ row.overallRiskScore === null ? '—' : row.overallRiskScore.toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column label="风险层级" width="90">
          <template #default="{ row }">
            <el-tag
              :type="riskLevelTagType[row.overallRiskLevel as MultilingualRiskLevel]"
              size="small"
            >
              {{ multilingualRiskLevels[row.overallRiskLevel as MultilingualRiskLevel] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="96">
          <template #default>
            <span class="status-dot done"></span> 分析完成
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="168">
          <template #default="{ row }">{{ formatDateTime(row.finishedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="210">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">查看详情</el-button>
            <el-button link type="primary" @click="downloadReport(row)">下载报告</el-button>
            <el-button link type="danger" @click="removeRecord(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </PanelCard>

    <!-- 全部关键语义片段 -->
    <el-dialog v-model="evidenceDialogOpen" title="全部关键语义片段" width="760px">
      <el-table
        v-if="result"
        :data="result.riskEvidence"
        size="small"
        max-height="440"
      >
        <el-table-column label="语种" width="78">
          <template #default="{ row }">{{ languageName(row.language) }}</template>
        </el-table-column>
        <el-table-column label="关键语义片段" prop="quote" />
        <el-table-column label="判断原因" prop="reason" min-width="180" />
        <el-table-column label="语义权重" width="90">
          <template #default="{ row }">{{ row.semanticWeight.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="风险层级" width="90">
          <template #default="{ row }">
            <el-tag
              :type="riskLevelTagType[row.riskLevel as MultilingualRiskLevel]"
              size="small"
            >
              {{ multilingualRiskLevels[row.riskLevel as MultilingualRiskLevel] }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<style scoped>
.ml-workbench {
  min-width: 0;
}
.full {
  width: 100%;
}
.hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #7d91b0;
}
.scope-alert {
  margin-bottom: 12px;
}

/* 横幅 */
.ml-banner {
  position: relative;
  display: flex;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 15px;
  padding: 22px 28px;
  overflow: hidden;
  border: 1px solid #dcebfa;
  border-radius: 10px;
  background: linear-gradient(105deg, #eaf3ff 0%, #f5f9ff 55%, #eef4ff 100%);
}
.ml-banner-body {
  min-width: 0;
}
.eyebrow {
  font-size: 11px;
  letter-spacing: 3px;
  color: #8aa6d0;
}
.ml-banner-body h2 {
  margin: 6px 0 8px;
  font-size: 25px;
  color: #123470;
}
.ml-banner-body p {
  margin: 0;
  max-width: 720px;
  font-size: 13px;
  line-height: 1.8;
  color: #5b719a;
}
.ml-banner-deco {
  position: relative;
  flex: 0 0 240px;
  height: 110px;
}
.pill {
  position: absolute;
  padding: 5px 12px;
  border: 1px solid #c7dcf6;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  color: #3d639c;
  box-shadow: 0 3px 10px rgba(90, 140, 210, 0.15);
}
.p1 { top: 8px; left: 10px; }
.p2 { top: 0; left: 96px; }
.p3 { top: 30px; right: 18px; }
.p4 { top: 62px; left: 30px; }
.p5 { bottom: 4px; left: 120px; }
.p6 { bottom: 12px; right: 0; }
.globe {
  position: absolute;
  top: 22px;
  left: 104px;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 35% 30%, rgba(80, 150, 255, 0.4), rgba(40, 110, 220, 0.12)),
    repeating-linear-gradient(0deg, transparent 0 11px, rgba(70, 130, 220, 0.25) 11px 12px);
  border: 1px solid #bcd4f2;
}

/* 主体布局 */
.ml-main {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 15px;
  align-items: start;
  margin-bottom: 15px;
}
@media (max-width: 1200px) {
  .ml-main {
    grid-template-columns: 1fr;
  }
}
.ml-results {
  min-width: 0;
}
.upload-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.submit-btn {
  margin-top: 4px;
}

/* 统计卡 */
.stat-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
@media (max-width: 900px) {
  .stat-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}
.stat-card {
  padding: 12px 14px;
  border: 1px solid #e7f0fb;
  border-radius: 8px;
  background: linear-gradient(160deg, #f8fbff, #f2f7ff);
}
.stat-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.stat-label {
  font-size: 12.5px;
  color: #5f7398;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.ic {
  font-size: 18px;
}
.ic.red { color: #f56c6c; }
.ic.blue { color: #2f80ed; }
.ic.purple { color: #8b5cf6; }
.ic.cyan { color: #06b6d4; }
.info-ic {
  font-size: 12px;
  color: #a8b8d4;
}
.stat-value {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.stat-value strong {
  font-size: 26px;
  color: #10275f;
}
.stat-value i {
  font-style: normal;
  font-size: 12px;
  color: #9aaac4;
}
.delta {
  font-size: 13px;
  font-weight: 600;
}
.delta.up {
  color: #18b26b;
}
.covered-langs {
  margin: 6px 0 0;
  font-size: 12px;
  color: #7d91b0;
}
.result-empty {
  padding: 48px 20px;
  text-align: center;
  color: #96a1b3;
}
.result-empty b {
  display: block;
  margin-bottom: 6px;
  color: #5b6779;
}

/* 结果中部双栏 */
.result-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  gap: 15px;
}
@media (max-width: 1000px) {
  .result-grid {
    grid-template-columns: 1fr;
  }
}

/* 权重条 */
.wbar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 120px;
}
.wbar-fill {
  height: 8px;
  border-radius: 999px;
  display: inline-block;
}
.wbar-fill.safe { background: #34c77b; }
.wbar-fill.neutral { background: #3b82f6; }
.wbar-fill.risk { background: #f56c6c; }
.wbar em {
  font-style: normal;
  font-size: 12px;
  color: #5f7398;
  white-space: nowrap;
}

/* 风险分层：卡片随左栏等高拉伸，行内用占比条填充，避免大面积留白 */
.tier-card {
  display: flex;
  flex-direction: column;
}
.tier-card :deep(.panel-content) {
  flex: 1 1 auto;
  display: flex;
}
.tier-panel {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: stretch;
  gap: 18px;
}
.tier-list {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  gap: 6px;
}
.tier-row {
  display: grid;
  grid-template-columns: 9px 66px minmax(0, 1fr) 46px 52px;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: 7px;
  background: #f8fbff;
}
.tier-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}
.safe .tier-dot { background: #34c77b; }
.low .tier-dot { background: #3b82f6; }
.medium .tier-dot { background: #f59e0b; }
.high .tier-dot { background: #f56c6c; }
.tier-name {
  font-size: 13px;
  color: #3e5278;
}
.tier-bar {
  height: 6px;
  border-radius: 999px;
  background: #e9eff8;
  overflow: hidden;
}
.tier-bar-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  transition: width 0.3s ease;
}
.safe .tier-bar-fill { background: #34c77b; }
.low .tier-bar-fill { background: #3b82f6; }
.medium .tier-bar-fill { background: #f59e0b; }
.high .tier-bar-fill { background: #f56c6c; }
.tier-count {
  font-size: 13px;
  color: #5f7398;
  text-align: right;
}
.tier-count strong {
  color: #10275f;
  font-size: 15px;
}
.tier-count i {
  font-style: normal;
  margin-left: 2px;
  font-size: 12px;
}
.tier-percent {
  font-size: 12.5px;
  font-weight: 600;
  color: #5f7398;
  text-align: right;
}
.tier-side {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.tier-total {
  margin: 0;
  font-size: 12px;
  color: #7d91b0;
}
.tier-total strong {
  color: #10275f;
  font-size: 13px;
}
.weight-num {
  font-weight: 600;
  color: #d83f3f;
}

/* 记录表状态 */
.status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-right: 4px;
}
.status-dot.done {
  background: #18b26b;
  box-shadow: 0 0 0 3px rgba(24, 178, 107, 0.15);
}
</style>
