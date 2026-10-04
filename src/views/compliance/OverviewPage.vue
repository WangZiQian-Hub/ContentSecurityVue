<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useComplianceStore } from '../../stores/compliance'
import PanelCard from '../../components/PanelCard.vue'
import StateBadge from './components/StateBadge.vue'
import { formatCount, formatTime } from './presentation'
import type { AuditSummary, Handoff } from '../../types/compliance'
import { complianceApi } from '../../api/compliance'
import { getModelWorkbench } from '../../api/model-workbench'
const store = useComplianceStore(),
  scope = ref('all'),
  dates = ref(initialDateRange()),
  gapsOnly = ref(false),
  page = ref(1)
// 真实接口模式下的交接矩阵；演示模式保持 null，继续用 mock 的 handoffs。
const matrixRows = ref<Handoff[] | null>(null)
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
const rows = computed(() => {
  // 演示模式沿用 mock 的交接矩阵；真实模式用按关系聚合出来的矩阵。
  const source = store.demo ? store.overview?.handoffs : matrixRows.value
  return (source ?? []).filter((h) => !gapsOnly.value || (h.missingCount ?? 0) > 0)
})
// 后端 /compliance/overview 的 handoffs 把同一个证据计数复制成多行，无法表达交接关系。
// 这里改问 /compliance/lineage：它按关系核验上下游引用是否已登记，再按关系聚合。
const relationLabel: Record<string, string> = {
  输入数据引用: '数据版本 → 治理任务',
  训练数据绑定: '治理版本 → 训练任务',
  训练产物登记: '训练产物 → 模型版本',
}
const relationOrder = ['输入数据引用', '训练数据绑定', '训练产物登记']
async function loadMatrix() {
  if (store.demo) {
    matrixRows.value = null
    return
  }
  try {
    // 1. 取可查询的根节点：数据集（含被引用但未登记的）与模型。
    const [datasetContext, modelContext] = await Promise.all([
      complianceApi.contexts({ sourceKind: 'dataset' }),
      complianceApi.contexts({ sourceKind: 'model' }),
    ])
    const datasetIds = [...new Set(datasetContext.candidates.map((item) => String(item.sourceId)))]
    const modelIds = [...new Set(modelContext.candidates.map((item) => String(item.sourceId)))]
    // 2. 逐个根节点查询谱系：该接口只返回起点所在的连通分量，必须查全再合并。
    const graphs = await Promise.all([
      ...datasetIds.map((id) =>
        complianceApi.lineage({ entityType: 'dataset', entityId: id, direction: 'both' }),
      ),
      ...modelIds.map((id) =>
        complianceApi.lineage({ entityType: 'model', entityId: id, direction: 'both' }),
      ),
    ])
    // 3. 合并并按边 id 去重（同一条边会在多个分量中重复出现）。
    const edges = new Map<string, (typeof graphs)[number]['edges'][number]>()
    graphs.forEach((graph) => graph.edges.forEach((edge) => edges.set(edge.id, edge)))
    // 4. 按关系种类分组统计。
    const grouped = new Map<
      string,
      { expected: number; verified: number; missing: number; reasons: Set<string> }
    >()
    edges.forEach((edge) => {
      const group =
        grouped.get(edge.relation) ??
        { expected: 0, verified: 0, missing: 0, reasons: new Set<string>() }
      group.expected += 1
      if (edge.verificationState === 'verified') group.verified += 1
      if (edge.verificationState === 'missing') {
        group.missing += 1
        if (edge.missingReason) group.reasons.add(edge.missingReason)
      }
      grouped.set(edge.relation, group)
    })
    // 5. 前三行：数据版本→治理任务、治理版本→训练任务、训练产物→模型版本。
    const list: Handoff[] = relationOrder.map((relation) => {
      const group = grouped.get(relation)
      return {
        kind: relation,
        label: relationLabel[relation] ?? relation,
        expectedCount: group?.expected ?? 0,
        verifiedCount: group?.verified ?? 0,
        missingCount: group?.missing ?? 0,
        unavailableCount: 0,
        missingReason: group?.reasons.size ? [...group.reasons].join(' / ') : null,
        target: 'lineage',
        subjectRef: null,
      }
    })
    // 6. 第四行：调用记录引用的（模型 + 版本）是否在登记表里。
    const workbench = await getModelWorkbench()
    const registered = new Set<string>()
    workbench.models.forEach((model) => {
      registered.add(`${model.id}::${model.version}`)
      model.versions.forEach((version) => registered.add(`${model.id}::${version.version}`))
    })
    const callTotal = workbench.calls.length
    const callVerified = workbench.calls.filter((call) =>
      registered.has(`${call.modelId}::${call.version}`),
    ).length
    list.push({
      kind: 'model_call_version',
      label: '模型版本 → 推理输出',
      expectedCount: callTotal,
      verifiedCount: callVerified,
      missingCount: callTotal - callVerified,
      unavailableCount: 0,
      missingReason: callTotal - callVerified > 0 ? '调用版本引用' : null,
      target: 'reasoning-audit',
      subjectRef: null,
    })
    // 7. 第五行：后端尚无场景回执数据，如实返回未知，不编造数字。
    list.push({
      kind: 'scenario_receipt',
      label: '推理输出 → 场景回执',
      expectedCount: null,
      verifiedCount: null,
      missingCount: null,
      unavailableCount: null,
      missingReason: '后端暂未提供场景回执数据',
      target: 'full-chain',
      subjectRef: null,
    })
    matrixRows.value = list
  } catch {
    // 失败时回退到 mock 分支的默认行为，不让表格空白。
    matrixRows.value = null
  }
}
function load() {
  if (dates.value?.length !== 2) {
    store.invalidate()
    return
  }
  if (dates.value?.length === 2)
    store.loadOverview(
      {
        scope: scope.value,
        from: `${dates.value[0]}T00:00:00+08:00`,
        to: `${dates.value[1]}T00:00:00+08:00`,
      },
      page.value,
    )
}
function filter() {
  page.value = 1
  load()
}
function target(item: Handoff) {
  return {
    path: `/compliance/${item.target}`,
    query: item.subjectRef
      ? {
          sourceId: String(item.subjectRef.entityId),
          entityType: item.subjectRef.entityType,
          versionId: item.subjectRef.versionId || undefined,
        }
      : {},
  }
}
function auditTarget(item: AuditSummary) {
  return {
    path: `/compliance/${{ lineage_audit: 'lineage', full_chain_audit: 'full-chain', training_monitor: 'training-monitor', reasoning_audit: 'reasoning-audit', neuron_audit: 'neuron-audit' }[item.capabilityCode]}`,
    query: {
      sourceId: String(item.subjectRef.entityId),
      sourceKind: item.subjectRef.entityType,
      entityType: item.subjectRef.entityType,
      versionId: item.subjectRef.versionId || undefined,
    },
  }
}
onMounted(() => {
  load()
  // 交接矩阵与日期筛选无关（后端未按时间过滤），只在进入页面时聚合一次。
  void loadMatrix()
})
</script>
<template>
  <div class="compliance-filter">
    <label
      >核验范围<el-select v-model="scope" aria-label="核验范围" @change="filter"
        ><el-option label="全部业务模块" value="all" /><el-option
          label="训练交接"
          value="training" /><el-option label="推理交接" value="inference" /></el-select></label
    ><label
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
      <PanelCard title="跨阶段关系缺口" icon="Share"
        ><button class="compliance-metric" @click="gapsOnly = !gapsOnly">
          <strong>{{ formatCount(store.overview.missingCount) }}</strong
          ><span>/ {{ formatCount(store.overview.expectedCount) }} 条应交接关系</span
          ><el-tag type="warning">{{ gapsOnly ? '显示全部' : '定位缺口' }}</el-tag>
        </button></PanelCard
      ><PanelCard title="审计结论待复核" icon="Shield"
        ><div class="compliance-metric">
          <strong>{{ formatCount(store.overview.pendingReviewsCount) }}</strong
          ><span>/ {{ formatCount(store.overview.completedAuditsCount) }} 份已完成审计</span>
        </div></PanelCard
      ><PanelCard title="当前核验范围" icon="Tickets"
        ><p>{{ store.overview.scopeDescription }}</p>
        <small>分母依据后端策略和登记事实；不是当前分页数量。</small></PanelCard
      >
    </div>
    <PanelCard title="跨阶段证据交接" icon="Share"
      ><template #extra><el-checkbox v-model="gapsOnly">仅查看缺口</el-checkbox></template
      ><el-table :data="rows" stripe
        ><el-table-column prop="label" label="交接关系" min-width="220" /><el-table-column
          label="应有关系"
          min-width="95"
          ><template #default="{ row }">{{
            formatCount(row.expectedCount)
          }}</template></el-table-column
        ><el-table-column label="已验证" min-width="90"
          ><template #default="{ row }">{{
            formatCount(row.verifiedCount)
          }}</template></el-table-column
        ><el-table-column label="缺口" min-width="80"
          ><template #default="{ row }"
            ><el-tag :type="row.missingCount === 0 ? 'success' : 'warning'">{{
              formatCount(row.missingCount)
            }}</el-tag></template
          ></el-table-column
        ><el-table-column label="不可用" min-width="80"
          ><template #default="{ row }">{{
            formatCount(row.unavailableCount)
          }}</template></el-table-column
        ><el-table-column
          prop="missingReason"
          label="主要缺失证据"
          min-width="160"
        /><el-table-column label="处理入口" min-width="140"
          ><template #default="{ row }"
            ><router-link :to="target(row)">查看关联证据 →</router-link></template
          ></el-table-column
        ></el-table
      >
      <p v-if="store.overview.expectedCount === 0" class="compliance-note">
        暂无可核验对象
      </p></PanelCard
    ></template
  >
  <PanelCard title="待复核审计" icon="Tickets"
    ><el-table :data="store.audits?.items || []" stripe
      ><el-table-column prop="displayId" label="审计任务" /><el-table-column label="对象"
        ><template #default="{ row }"
          >{{ row.subjectRef.displayId }} / {{ row.subjectRef.versionId || '未记录版本' }}</template
        ></el-table-column
      ><el-table-column prop="reviewReason" label="复核原因" min-width="220" /><el-table-column
        label="状态"
        ><template #default="{ row }"
          ><StateBadge :state="row.reviewStatus" /></template></el-table-column
      ><el-table-column label="操作"
        ><template #default="{ row }"
          ><router-link :to="auditTarget(row)">打开审计 →</router-link></template
        ></el-table-column
      ></el-table
    ><el-pagination
      v-if="store.audits"
      v-model:current-page="page"
      :total="store.audits.total"
      :page-size="5"
      layout="total, prev, pager, next"
      @current-change="load"
  /></PanelCard>
</template>
