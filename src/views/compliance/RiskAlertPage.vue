<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PanelCard from '../../components/PanelCard.vue'
import { complianceApi } from '../../api/compliance'
import { request } from '../../api/request'
import { getModelWorkbench } from '../../api/model-workbench'
import { useComplianceStore } from '../../stores/compliance'
import { demoAuditErrors } from '../../mock/compliance'
import { formatCount, formatTime } from './presentation'
import type { AuditError, AuditErrorLayer, ErrorComment } from '../../types/compliance'
/**
 * 「合规风险审计」：把三层检查（链路 / 任务 / 模型）算出的缺口整理成一份错误清单，
 * 条数与总览页「待处理问题」卡片一一对应（后端告警工单属另一条线，不并入本清单）。
 * 每条错误有一个由业务对象拼成的稳定编号，评论挂在编号上；
 * 某条错误上一轮出现过、本轮消失，即判定为「已修复」，仍保留在清单里可查看历史评论。
 */

// 评论后端接口就绪后改成 true，即切换到服务端存储。
// 服务端接口见 api/compliance.ts 的 errorComments / addErrorComment（GET/POST /compliance/errors/{id}/comments）。
const COMMENT_BACKEND = false
/** 错误档案（本机暂存）：记录每条错误最后一次出现的轮次，用来判断「已修复」。 */
const ARCHIVE_KEY = 'compliance:audit-error-archive'
/** 评论（本机暂存，仅当 COMMENT_BACKEND 为 false 时使用）。 */
const COMMENT_KEY = 'compliance:error-comments'
/** 计入链路层的 3 类谱系关系；第 4 类「模型版本 → 推理输出」由调用记录与模型版本比对得出。 */
const COUNTED_RELATIONS = new Set(['输入数据引用', '训练数据绑定', '训练产物登记'])
const LAYER_LABEL: Record<AuditErrorLayer, string> = {
  link: '链路层',
  task: '任务层',
  model: '模型层',
}
/** 档案件：错误本身 + 最后一次见到的时间 + 判定为已修复的时间。 */
interface ArchivedError extends AuditError {
  lastSeen: string
  fixedAt: string | null
}
const store = useComplianceStore()
const loading = ref(false),
  loadError = ref(''),
  items = ref<AuditError[]>([]),
  layer = ref<'' | AuditErrorLayer>(''),
  state = ref<'' | 'open' | 'fixed'>(''),
  drawer = ref(false),
  active = ref<AuditError | null>(null),
  comments = ref<ErrorComment[]>([]),
  commentsLoading = ref(false),
  draft = ref(''),
  posting = ref(false)
const rows = computed(() =>
  items.value.filter(
    (item) =>
      (!layer.value || item.layer === layer.value) &&
      (!state.value || item.state === state.value),
  ),
)
const openCount = computed(() => items.value.filter((item) => item.state === 'open').length)
const fixedCount = computed(() => items.value.filter((item) => item.state === 'fixed').length)
function readArchive(): Record<string, ArchivedError> {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, ArchivedError>) : {}
  } catch {
    return {}
  }
}
function writeArchive(value: Record<string, ArchivedError>) {
  try {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(value))
  } catch {
    // 本机存储不可用时退化为「不跟踪已修复」，不影响错误清单本身。
  }
}
function readLocalComments(errorId: string): ErrorComment[] {
  try {
    const raw = localStorage.getItem(COMMENT_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, ErrorComment[]>) : {}
    return map[errorId] ?? []
  } catch {
    return []
  }
}
function writeLocalComment(errorId: string, comment: ErrorComment) {
  try {
    const raw = localStorage.getItem(COMMENT_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, ErrorComment[]>) : {}
    map[errorId] = [...(map[errorId] ?? []), comment]
    localStorage.setItem(COMMENT_KEY, JSON.stringify(map))
  } catch {
    // 忽略：写入失败时页面会提示。
  }
}
/** 与档案对账：本轮消失的错误标记为「已修复」，并把已修复的历史一并返回。 */
function reconcile(current: AuditError[]): AuditError[] {
  const archive = readArchive()
  const now = new Date().toISOString()
  const currentIds = new Set(current.map((item) => item.id))
  current.forEach((item) => {
    archive[item.id] = { ...item, lastSeen: now, fixedAt: null }
  })
  Object.values(archive).forEach((item) => {
    if (!currentIds.has(item.id) && !item.fixedAt) item.fixedAt = now
  })
  writeArchive(archive)
  const fixed = Object.values(archive)
    .filter((item) => item.fixedAt)
    .map<AuditError>((item) => ({ ...item, state: 'fixed', commentCount: 0 }))
  return [...current, ...fixed]
}
function withCommentCount(list: AuditError[]): AuditError[] {
  return list.map((item) => ({ ...item, commentCount: readLocalComments(item.id).length }))
}
/** 采集三层缺口 + 告警工单，合成错误清单。 */
async function loadErrors() {
  loading.value = true
  loadError.value = ''
  try {
    // 演示模式没有谱系 / 任务 / 模型工作台这些数据源，直接用写好的演示清单。
    if (store.demo) {
      items.value = withCommentCount(demoAuditErrors.map((item) => ({ ...item })))
      return
    }
    const list: AuditError[] = []
    // 1. 链路层：逐个根节点查询谱系，按边 id 去重后取「待补证」的边。
    const [datasetContext, modelContext] = await Promise.all([
      complianceApi.contexts({ sourceKind: 'dataset' }),
      complianceApi.contexts({ sourceKind: 'model' }),
    ])
    const datasetIds = [...new Set(datasetContext.candidates.map((item) => String(item.sourceId)))]
    const modelIds = [...new Set(modelContext.candidates.map((item) => String(item.sourceId)))]
    const graphs = await Promise.all([
      ...datasetIds.map((id) =>
        complianceApi.lineage({ entityType: 'dataset', entityId: id, direction: 'both' }),
      ),
      ...modelIds.map((id) =>
        complianceApi.lineage({ entityType: 'model', entityId: id, direction: 'both' }),
      ),
    ])
    const labels = new Map<string, string>()
    const edges = new Map<string, (typeof graphs)[number]['edges'][number]>()
    graphs.forEach((graph) => {
      graph.nodes.forEach((node) => labels.set(node.id, node.label))
      graph.edges.forEach((edge) => edges.set(edge.id, edge))
    })
    edges.forEach((edge) => {
      if (!COUNTED_RELATIONS.has(edge.relation) || edge.verificationState !== 'missing') return
      list.push({
        id: `link:${edge.relation}:${edge.id}`,
        source: 'system',
        layer: 'link',
        title: `${labels.get(edge.fromId) ?? edge.fromId} → ${labels.get(edge.toId) ?? edge.toId}`,
        detail: edge.missingReason ?? '引用未登记',
        state: 'open',
        target: '/compliance/lineage',
        commentCount: 0,
      })
    })
    // 2. 模型工作台：链路层第 4 类（调用引用的模型版本）+ 模型层的检查点缺口。
    const workbench = await getModelWorkbench()
    const registered = new Set<string>()
    workbench.models.forEach((model) => {
      registered.add(`${model.id}::${model.version}`)
      model.versions.forEach((version) => registered.add(`${model.id}::${version.version}`))
    })
    workbench.calls.forEach((call) => {
      if (registered.has(`${call.modelId}::${call.version}`)) return
      list.push({
        id: `link:模型版本引用:${call.id}`,
        source: 'system',
        layer: 'link',
        title: `调用记录 ${call.id}`,
        detail: `引用的模型版本 ${call.version} 未在登记表里`,
        state: 'open',
        target: '/compliance/lineage',
        commentCount: 0,
      })
    })
    workbench.training.forEach((task) => {
      const interval = Math.max(1, Math.floor((task.epochs || 1) / 3))
      const saved = new Set((task.checkpoints ?? []).map((checkpoint) => checkpoint.epoch))
      for (let index = 1; index <= (task.epoch || 0); index += 1) {
        if (index !== task.epoch && index % interval !== 0) continue
        if (saved.has(index)) continue
        list.push({
          id: `model:${task.id}:checkpoint:${index}`,
          source: 'system',
          layer: 'model',
          title: `训练任务 ${task.id}`,
          detail: `应有第 ${index} 轮的检查点，实际未保存`,
          state: 'open',
          target: '/compliance/model-internal',
          commentCount: 0,
        })
      }
    })
    // 3. 任务层：执行失败的任务。
    const taskPage = await request<{
      items: { taskId: string; name: string; status: string; errorMessage?: string }[]
    }>({ url: '/tasks', params: { page: 1, pageSize: 100 } })
    ;(taskPage.items ?? [])
      .filter((task) => task.status === 'failed')
      .forEach((task) => {
        list.push({
          id: `task:${task.taskId}:failed`,
          source: 'system',
          layer: 'task',
          title: `${task.name}（${task.taskId}）`,
          detail: task.errorMessage || '任务执行失败',
          state: 'open',
          target: '/compliance/full-chain',
          commentCount: 0,
        })
      })
    items.value = withCommentCount(reconcile(list))
  } catch (exception) {
    loadError.value = exception instanceof Error ? exception.message : '错误清单加载失败'
    items.value = []
  } finally {
    loading.value = false
  }
}
/** 读取某条错误的评论。 */
async function loadComments(errorId: string): Promise<ErrorComment[]> {
  if (COMMENT_BACKEND) return complianceApi.errorComments(errorId)
  return readLocalComments(errorId)
}
/** 新增一条评论，返回最新评论列表。 */
async function postComment(errorId: string, content: string): Promise<ErrorComment[]> {
  if (COMMENT_BACKEND) {
    await complianceApi.addErrorComment(errorId, { content }, crypto.randomUUID())
    return complianceApi.errorComments(errorId)
  }
  writeLocalComment(errorId, {
    id: crypto.randomUUID(),
    author: '张三',
    content,
    createdAt: new Date().toISOString(),
  })
  return readLocalComments(errorId)
}
async function openComments(row: AuditError) {
  active.value = row
  drawer.value = true
  commentsLoading.value = true
  draft.value = ''
  try {
    comments.value = await loadComments(row.id)
  } catch (exception) {
    loadError.value = exception instanceof Error ? exception.message : '评论加载失败'
    comments.value = []
  } finally {
    commentsLoading.value = false
  }
}
async function submit() {
  const content = draft.value.trim()
  if (!content || !active.value || posting.value) return
  posting.value = true
  try {
    const errorId = active.value.id
    comments.value = await postComment(errorId, content)
    draft.value = ''
    items.value = items.value.map((item) =>
      item.id === errorId ? { ...item, commentCount: comments.value.length } : item,
    )
  } catch (exception) {
    loadError.value = exception instanceof Error ? exception.message : '评论提交失败'
  } finally {
    posting.value = false
  }
}
function rowClass({ row }: { row: AuditError }) {
  return row.state === 'fixed' ? 'audit-error-fixed' : ''
}
function resetFilter() {
  layer.value = ''
  state.value = ''
}
onMounted(loadErrors)
</script>
<template>
  <div class="compliance-filter">
    <label
      >层级<el-select v-model="layer" aria-label="错误层级"
        ><el-option label="全部层级" value="" /><el-option label="链路层" value="link" /><el-option
          label="任务层"
          value="task" /><el-option label="模型层" value="model" /></el-select></label
    ><label
      >状态<el-select v-model="state" aria-label="错误状态"
        ><el-option label="全部状态" value="" /><el-option
          label="待处理"
          value="open" /><el-option label="已修复" value="fixed" /></el-select></label
    ><span class="compliance-muted"
      >共 {{ formatCount(rows.length) }} 条 · 待处理 {{ formatCount(openCount) }} · 已修复
      {{ formatCount(fixedCount) }}</span
    ><el-button @click="resetFilter">重置筛选</el-button
    ><el-button type="primary" :loading="loading" @click="loadErrors">重新检查</el-button>
  </div>
  <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon />
  <PanelCard title="错误清单" icon="Warning"
    ><template #extra
      ><span v-if="!COMMENT_BACKEND" class="compliance-muted"
        >评论暂存本机，后端接口就绪后自动切换</span
      ></template
    ><el-table v-loading="loading" :data="rows" stripe :row-class-name="rowClass"
      ><el-table-column label="层级" width="110"
        ><template #default="{ row }"
          ><span class="compliance-layer-tag" :class="row.layer">{{
            LAYER_LABEL[row.layer as AuditErrorLayer]
          }}</span></template
        ></el-table-column
      ><el-table-column prop="title" label="具体错误" min-width="240" /><el-table-column
        prop="detail"
        label="原因"
        min-width="220" /><el-table-column label="状态" width="110"
        ><template #default="{ row }"
          ><el-tag :type="row.state === 'open' ? 'warning' : 'info'">{{
            row.state === 'open' ? '待处理' : '已修复'
          }}</el-tag></template
        ></el-table-column
      ><el-table-column label="操作" width="220"
        ><template #default="{ row }"
          ><el-button link type="primary" @click="openComments(row)"
            >💬 评论{{ row.commentCount ? ` (${row.commentCount})` : '' }}</el-button
          ><router-link v-if="row.target" class="audit-error-link" :to="row.target"
            >查看明细 →</router-link
          ></template
        ></el-table-column
      ></el-table
    >
    <p v-if="!loading && !rows.length" class="compliance-note">当前筛选下没有错误</p></PanelCard
  >
  <el-drawer v-model="drawer" size="520px" :with-header="false">
    <template v-if="active">
      <h3 class="audit-drawer-title">评论 · {{ active.title }}</h3>
      <p class="audit-drawer-sub">
        <span class="compliance-layer-tag" :class="active.layer">{{
          LAYER_LABEL[active.layer]
        }}</span>
        <span>{{ active.detail }}</span>
      </p>
      <div v-loading="commentsLoading" class="audit-comment-list">
        <div v-for="item in comments" :key="item.id" class="audit-comment">
          <b>{{ item.author }}</b>
          <time>{{ formatTime(item.createdAt) }}</time>
          <p>{{ item.content }}</p>
        </div>
        <p v-if="!commentsLoading && !comments.length" class="compliance-note">还没有评论</p>
      </div>
      <div class="audit-comment-form">
        <el-input
          v-model="draft"
          type="textarea"
          :rows="3"
          maxlength="500"
          show-word-limit
          placeholder="写下你的判断：这条错误是什么原因、由谁处理、处理到哪一步了"
          aria-label="评论内容"
        /><el-button type="primary" :loading="posting" :disabled="!draft.trim()" @click="submit"
          >发表评论</el-button
        >
      </div>
    </template>
  </el-drawer>
</template>
<style scoped>
.audit-error-link {
  margin-left: 12px;
}
.audit-drawer-title {
  margin: 0 0 6px;
  font-size: 17px;
  color: #10275f;
}
.audit-drawer-sub {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 16px;
  font-size: 13px;
  color: #607ca5;
}
.audit-comment-list {
  min-height: 120px;
  max-height: calc(100vh - 320px);
  overflow-y: auto;
}
.audit-comment {
  padding: 10px 0;
  border-bottom: 1px solid #eaf1fa;
}
.audit-comment b {
  color: #10275f;
}
.audit-comment time {
  margin-left: 10px;
  font-size: 12px;
  color: #8ba0bd;
}
.audit-comment p {
  margin: 6px 0 0;
  font-size: 14px;
  line-height: 1.7;
  color: #36547e;
  overflow-wrap: anywhere;
}
.audit-comment-form {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-end;
}
.audit-comment-form :deep(.el-textarea) {
  width: 100%;
}
:deep(.audit-error-fixed) {
  opacity: 0.55;
}
</style>
