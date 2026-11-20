<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PanelCard from '../../../components/PanelCard.vue'
import { getRiskSample } from '../../../api/data-risk'
import {
  getRiskDispositionState,
  previewRiskPublication,
  publishRiskVersion,
  updateRiskDisposition,
} from '../../../api/risk-dispositions'
import { formatBeijingTime } from '../../../utils/beijing-time'
import type { Level, Sample } from '../../../types/data-risk'
import type {
  DispositionCommand,
  DispositionStatus,
  ReviewDecision,
  RiskDisposition,
  RiskDispositionState,
  RiskPublicationPreview,
  RiskTreatment,
} from '../../../types/risk-disposition'

const props = defineProps<{ resultId: string; sample?: Sample }>()
const emit = defineEmits<{ openVersion: [versionId: string] }>()
const state = ref<RiskDispositionState>()
const issue = ref('')
const busy = ref(false)
const queueFilter = ref<DispositionStatus | ''>('')
const dialogOpen = ref(false)
const publishOpen = ref(false)
const activeId = ref('')
const activeSample = ref<Sample>()
const decision = ref<ReviewDecision>('confirm')
const level = ref<Level>('NOTICE')
const treatment = ref<RiskTreatment>('redact')
const note = ref('')
const replacementText = ref('')
const preview = ref<RiskPublicationPreview>()

const levels: Record<Level, string> = {
  NOTICE: '提示',
  LOW: '低风险',
  MEDIUM: '中风险',
  HIGH: '高风险',
}
const levelsInOrder: Level[] = ['NOTICE', 'LOW', 'MEDIUM', 'HIGH']
const statuses: Record<DispositionStatus, string> = {
  PENDING_REVIEW: '待复核',
  PENDING_ACTION: '待处置',
  PENDING_APPROVAL: '待审核',
  APPROVED: '已批准',
  DISMISSED: '误报',
  PUBLISHED: '已发布',
}
const treatments: Record<RiskTreatment, string> = {
  redact: '脱敏后替换正文',
  correct: '核实来源或更正后替换正文',
  exclude: '从新版本排除',
}
const eventLabels: Record<RiskDisposition['events'][number]['action'], string> = {
  submit: '发起复核',
  confirm: '确认风险',
  adjust: '调整等级',
  dismiss: '标记误报',
  propose: '提交处置审核',
  approve: '审核通过',
  return: '退回处置',
  publish: '发布新版本',
}
const active = computed(() => state.value?.reviews.find((row) => row.sampleId === activeId.value))
const selectedReview = computed(() =>
  state.value?.reviews.find((row) => row.sampleId === props.sample?.id),
)
const queue = computed(() =>
  (state.value?.reviews ?? []).filter(
    (row) => !queueFilter.value || row.status === queueFilter.value,
  ),
)
const approvedCount = computed(
  () => state.value?.reviews.filter((row) => row.status === 'APPROVED').length ?? 0,
)
const inProgressCount = computed(
  () =>
    state.value?.reviews.filter((row) =>
      ['PENDING_REVIEW', 'PENDING_ACTION', 'PENDING_APPROVAL'].includes(row.status),
    ).length ?? 0,
)
const canOpenSelected = computed(() =>
  Boolean(selectedReview.value || (state.value?.editable && props.sample?.findings.length)),
)

async function run(action: () => Promise<void>) {
  if (busy.value) return
  issue.value = ''
  busy.value = true
  try {
    await action()
  } catch (e) {
    issue.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

const refresh = () =>
  run(async () => {
    state.value = await getRiskDispositionState(props.resultId)
  })
onMounted(refresh)

function save(row: RiskDisposition) {
  if (!state.value) return
  state.value.reviews = [
    ...state.value.reviews.filter((item) => item.sampleId !== row.sampleId),
    row,
  ].sort((a, b) => a.sampleId.localeCompare(b.sampleId, 'zh', { numeric: true }))
}

function show(row: RiskDisposition, sample?: Sample) {
  activeId.value = row.sampleId
  activeSample.value = sample
  decision.value = 'confirm'
  level.value = row.originalLevel
  treatment.value =
    row.treatment ?? (row.originalCategory === '个人信息暴露' ? 'redact' : 'correct')
  note.value = ''
  replacementText.value = row.replacementText ?? sample?.text ?? ''
  dialogOpen.value = true
}

function openSelected() {
  const sample = props.sample
  if (busy.value || !sample || !canOpenSelected.value) return
  const existing = selectedReview.value
  if (existing) {
    show(existing, sample)
    return
  }
  void run(async () => {
    const row = await updateRiskDisposition(props.resultId, sample.id, sample.revisionId, {
      action: 'submit',
    })
    save(row)
    show(row, sample)
  })
}
defineExpose({ openSelected, canOpenSelected, busy })

function openSaved(row: RiskDisposition) {
  if (busy.value) return
  void run(async () => {
    const sample =
      props.sample?.id === row.sampleId
        ? props.sample
        : await getRiskSample(props.resultId, row.sampleId)
    show(row, sample)
  })
}

function submit(command: DispositionCommand) {
  const row = active.value
  if (!row || !state.value?.editable || !note.value.trim()) return
  void run(async () => {
    const updated = await updateRiskDisposition(
      props.resultId,
      row.sampleId,
      row.inputSampleRevisionId,
      command,
    )
    save(updated)
    show(updated, activeSample.value)
  })
}

function submitDecision() {
  const action = decision.value
  submit(
    action === 'adjust'
      ? { action, level: level.value, note: note.value }
      : { action, note: note.value },
  )
}

function submitTreatment() {
  submit({
    action: 'propose',
    treatment: treatment.value,
    note: note.value,
    replacementText: treatment.value === 'exclude' ? undefined : replacementText.value,
  })
}

function preparePublication() {
  void run(async () => {
    preview.value = await previewRiskPublication(props.resultId)
    publishOpen.value = true
  })
}

function confirmPublication() {
  if (!preview.value) return
  const token = preview.value.token
  void run(async () => {
    const published = await publishRiskVersion(props.resultId, token)
    publishOpen.value = false
    if (state.value) {
      state.value.editable = false
      state.value.published = published
    }
    state.value = await getRiskDispositionState(props.resultId)
  })
}
</script>

<template>
  <PanelCard title="风险复核与处置" icon="Checked">
    <template #extra>
      <el-button link type="primary" :disabled="busy" @click="refresh">刷新清单</el-button>
    </template>
    <el-alert
      v-if="issue && !dialogOpen && !publishOpen"
      :title="issue"
      type="error"
      :closable="false"
    />
    <div v-if="state" class="disposition">
      <div class="disposition-tools">
        <span
          >固定版本 {{ state.sourceVersionLabel }} · 进行中 {{ inProgressCount }} 条 · 待发布
          {{ approvedCount }} 条</span
        >
        <div>
          <el-button :disabled="busy || !canOpenSelected" @click="openSelected">
            {{ selectedReview ? '查看选中样本处置' : '发起复核（选中样本）' }}
          </el-button>
          <el-button
            type="primary"
            :disabled="busy || !state.editable || !approvedCount"
            @click="preparePublication"
            >预览并生成新版本</el-button
          >
        </div>
      </div>
      <el-alert
        v-if="state.published"
        type="success"
        :closable="false"
        :title="`已发布 ${state.published.versionLabel}，共 ${state.published.sampleCount} 条样本`"
      >
        <el-button
          link
          type="primary"
          :disabled="!state.published.sampleCount"
          @click="emit('openVersion', state.published!.newDatasetVersionId)"
          >打开新版本复检</el-button
        >
      </el-alert>
      <el-alert
        v-else-if="!state.editable"
        title="当前账号或检测版本仅支持查看已有处置"
        type="info"
        :closable="false"
      />
      <template v-if="state.reviews.length">
        <el-select
          v-model="queueFilter"
          class="disposition-filter"
          placeholder="全部状态"
          aria-label="处置状态筛选"
        >
          <el-option label="全部状态" value="" />
          <el-option v-for="(text, key) in statuses" :key="key" :label="text" :value="key" />
        </el-select>
        <el-table :data="queue" row-key="sampleId" max-height="330" @row-click="openSaved">
          <el-table-column prop="sampleId" label="样本 ID" min-width="100" />
          <el-table-column label="模型建议" min-width="110">
            <template #default="{ row }">{{ levels[row.originalLevel as Level] }}</template>
          </el-table-column>
          <el-table-column label="人工等级" min-width="110">
            <template #default="{ row }">{{
              row.reviewedLevel ? levels[row.reviewedLevel as Level] : '—'
            }}</template>
          </el-table-column>
          <el-table-column label="处置方式" min-width="165">
            <template #default="{ row }">{{
              row.treatment ? treatments[row.treatment as RiskTreatment] : '—'
            }}</template>
          </el-table-column>
          <el-table-column label="状态" min-width="105">
            <template #default="{ row }">{{ statuses[row.status as DispositionStatus] }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }"
              ><el-button link type="primary" :disabled="busy" @click.stop="openSaved(row)"
                >查看 ›</el-button
              ></template
            >
          </el-table-column>
        </el-table>
      </template>
      <el-empty v-else description="从风险明细选中一条候选，可发起复核。" :image-size="50" />
    </div>
    <p v-else-if="busy">正在读取处置清单…</p>
  </PanelCard>

  <el-dialog
    v-model="dialogOpen"
    title="样本复核与处置"
    width="min(640px, 94vw)"
    :close-on-click-modal="!busy"
  >
    <template v-if="active">
      <el-alert v-if="issue" :title="issue" type="error" :closable="false" />
      <p>
        样本 {{ active.sampleId }} · {{ active.originalCategory }} · 模型建议
        {{ levels[active.originalLevel] }} · {{ statuses[active.status] }}
      </p>
      <p v-if="active.reviewedLevel">人工等级 {{ levels[active.reviewedLevel] }}</p>
      <details v-if="activeSample">
        <summary>查看检测正文与原始依据</summary>
        <div class="governance-sample-scroll" tabindex="0">
          <p class="disposition-text">{{ activeSample.text }}</p>
          <p v-for="finding in activeSample.findings" :key="finding.ruleId">{{ finding.reason }}</p>
        </div>
      </details>
      <el-form
        v-if="state?.editable && active.status === 'PENDING_REVIEW'"
        label-position="top"
        @submit.prevent="submitDecision"
      >
        <el-form-item label="复核结论">
          <el-radio-group v-model="decision">
            <el-radio value="confirm">确认风险</el-radio>
            <el-radio value="adjust">调整等级</el-radio>
            <el-radio value="dismiss">标记误报</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="decision === 'adjust'" label="人工等级">
          <el-select v-model="level">
            <el-option
              v-for="option in levelsInOrder"
              :key="option"
              :label="levels[option]"
              :value="option"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="复核理由" required>
          <el-input v-model="note" type="textarea" :maxlength="1000" />
        </el-form-item>
        <el-button
          native-type="submit"
          type="primary"
          :loading="busy"
          :disabled="!note.trim() || (decision === 'adjust' && level === active.originalLevel)"
          >保存复核结论</el-button
        >
      </el-form>
      <el-form
        v-else-if="state?.editable && active.status === 'PENDING_ACTION'"
        label-position="top"
        @submit.prevent="submitTreatment"
      >
        <el-form-item label="处置方式">
          <el-select v-model="treatment">
            <el-option v-for="(text, key) in treatments" :key="key" :label="text" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="treatment !== 'exclude'" label="处置后正文" required>
          <el-input v-model="replacementText" type="textarea" :rows="6" :maxlength="12000" />
        </el-form-item>
        <el-form-item label="处置理由" required>
          <el-input v-model="note" type="textarea" :maxlength="1000" />
        </el-form-item>
        <el-button
          native-type="submit"
          type="primary"
          :loading="busy"
          :disabled="!note.trim() || (treatment !== 'exclude' && !replacementText.trim())"
          >提交处置审核</el-button
        >
      </el-form>
      <template v-else-if="active.treatment">
        <p>处置方式 · {{ treatments[active.treatment] }}</p>
        <p
          v-if="active.replacementText"
          class="governance-sample-scroll disposition-text"
          tabindex="0"
        >
          {{ active.replacementText }}
        </p>
        <el-form
          v-if="
            state?.editable &&
            (active.status === 'PENDING_APPROVAL' || active.status === 'APPROVED')
          "
          label-position="top"
        >
          <el-form-item label="审核理由" required>
            <el-input v-model="note" type="textarea" :maxlength="1000" />
          </el-form-item>
          <el-button
            v-if="active.status === 'PENDING_APPROVAL'"
            type="primary"
            :loading="busy"
            :disabled="!note.trim()"
            @click="submit({ action: 'approve', note })"
            >审核通过</el-button
          >
          <el-button :disabled="busy || !note.trim()" @click="submit({ action: 'return', note })"
            >退回处置</el-button
          >
        </el-form>
      </template>
      <details class="disposition-events">
        <summary>操作记录（{{ active.events.length }}）</summary>
        <p v-for="(event, index) in active.events" :key="index">
          {{ formatBeijingTime(event.at) }} · {{ event.actor }} · {{ eventLabels[event.action] }}
          <template v-if="event.note"> · {{ event.note }}</template>
        </p>
      </details>
    </template>
  </el-dialog>
  <el-dialog
    v-model="publishOpen"
    title="确认生成处置版本"
    width="min(490px, 94vw)"
    :close-on-click-modal="!busy"
  >
    <template v-if="preview">
      <el-alert v-if="issue" :title="issue" type="error" :closable="false" />
      <p>
        从 {{ preview.sourceVersionLabel }} 生成新版本。替换
        {{ preview.replacedCount }} 条正文，排除 {{ preview.excludedCount }} 条，保留
        {{ preview.sampleCount }} 条样本。
      </p>
      <p>原版本及检测记录可继续查看。替换正文的样本可在复检前重新标注。</p>
    </template>
    <template #footer>
      <el-button :disabled="busy" @click="publishOpen = false">取消</el-button>
      <el-button type="primary" :loading="busy" :disabled="!preview" @click="confirmPublication"
        >确认生成</el-button
      >
    </template>
  </el-dialog>
</template>

<style scoped>
.disposition {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.disposition-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}
.disposition-filter {
  width: 160px;
}
.disposition-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.disposition-events {
  margin-top: 14px;
  overflow-wrap: anywhere;
}
</style>
