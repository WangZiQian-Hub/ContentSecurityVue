<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useComplianceStore } from '../../stores/compliance'
import PanelCard from '../../components/PanelCard.vue'
import StateBadge from './components/StateBadge.vue'
import EvidenceLinks from './components/EvidenceLinks.vue'
import AlertActionDialog from './components/AlertActionDialog.vue'
import { formatTime } from './presentation'
const store = useComplianceStore(),
  route = useRoute(),
  page = ref(1),
  riskLevel = ref(''),
  status = ref('pending,processing'),
  stage = ref(''),
  dialog = ref(false),
  action = ref<'claim' | 'evidence' | 'resolve'>('claim')
const total = ref(0)
const selectedAlertId = ref('')
watch(
  () => store.alerts,
  (value) => {
    if (value) total.value = value.total
  },
)
function load() {
  store.loadAlerts(
    {
      page: page.value,
      pageSize: 5,
      riskLevel: riskLevel.value || undefined,
      status: status.value || undefined,
      stage: stage.value || undefined,
    },
    selectedAlertId.value || undefined,
  )
}
function filter() {
  selectedAlertId.value = ''
  page.value = 1
  load()
}
function inbound() {
  selectedAlertId.value = route.query.alertId ? String(route.query.alertId) : ''
  page.value = 1
  load()
}
function pageChanged() {
  selectedAlertId.value = ''
  load()
}
function selectId(id: string) {
  selectedAlertId.value = id
  store.selectAlert(id)
}
function open(value: typeof action.value) {
  action.value = value
  dialog.value = true
}
onMounted(inbound)
watch(() => route.query, inbound)
function rowClass({ row }: { row: { id: string } }) {
  return row.id === store.alert?.id ? 'compliance-selected-row' : ''
}
function selectRow(row: { id: string }) {
  selectId(row.id)
}
</script>
<template>
  <div class="compliance-filter">
    <label
      >风险等级<el-select v-model="riskLevel" aria-label="风险等级" @change="filter"
        ><el-option label="全部" value="" /><el-option label="高风险" value="high" /><el-option
          label="中风险"
          value="medium" /><el-option label="低风险" value="low" /><el-option
          label="提示"
          value="advisory" /></el-select></label
    ><label
      >状态<el-select v-model="status" aria-label="事件状态" @change="filter"
        ><el-option label="待处理 / 处理中" value="pending,processing" /><el-option
          label="待处理"
          value="pending" /><el-option label="处理中" value="processing" /><el-option
          label="已关闭"
          value="resolved" /><el-option label="全部" value="" /></el-select></label
    ><label
      >来源阶段<el-select v-model="stage" aria-label="来源阶段" @change="filter"
        ><el-option label="全部" value="" /><el-option label="训练" value="training" /><el-option
          label="推理"
          value="inference" /><el-option label="场景应用" value="application" /></el-select></label
    ><span class="compliance-muted">当前筛选 {{ store.alerts?.total ?? '—' }} 条</span
    ><el-button type="primary" :loading="store.loading" @click="load">查询</el-button>
  </div>
  <div class="compliance-split">
    <PanelCard title="风险事件队列" icon="Warning"
      ><el-table
        :data="store.alerts?.items || []"
        stripe
        :row-class-name="rowClass"
        @row-click="selectRow"
        ><el-table-column label="事件 ID" min-width="115"
          ><template #default="{ row }"
            ><el-button type="primary" link @click.stop="selectId(row.id)">{{
              row.displayId
            }}</el-button></template
          ></el-table-column
        ><el-table-column label="来源对象" min-width="140"
          ><template #default="{ row }">{{ row.subjectRef.displayId }}</template></el-table-column
        ><el-table-column prop="description" label="触发摘要" min-width="200" /><el-table-column
          label="等级"
          width="95"
          ><template #default="{ row }"
            ><StateBadge :state="row.riskLevel" /></template></el-table-column
        ><el-table-column label="状态" width="100"
          ><template #default="{ row }"
            ><StateBadge
              :state="row.currentStatus"
              domain="alert"
              :text="
                row.currentStatus === 'pending' ? '待处理' : undefined
              " /></template></el-table-column
      ></el-table>
      <p class="compliance-note">
        选中一条事件查看证据与处置记录。列表数量来自服务端筛选，不以当前页推断全局风险。
      </p>
      <el-pagination
        v-model:current-page="page"
        :total="total"
        :page-size="5"
        layout="total, prev, pager, next"
        @current-change="pageChanged"
    /></PanelCard>
    <PanelCard :title="`事件详情${store.alert ? ' · ' + store.alert.displayId : ''}`" icon="Shield"
      ><template v-if="store.alert"
        ><div class="compliance-actions">
          <StateBadge :state="store.alert.riskLevel" /><StateBadge
            :state="store.alert.currentStatus"
            domain="alert"
            :text="store.alert.currentStatus === 'pending' ? '待处理' : undefined"
          /><small>版本 {{ store.alert.version }}</small>
        </div>
        <dl class="compliance-details">
          <dt>关联对象</dt>
          <dd>{{ store.alert.subjectRef.displayId }}</dd>
          <dt>规则</dt>
          <dd>{{ store.alert.ruleRef }}</dd>
          <dt>风险依据</dt>
          <dd>{{ store.alert.description }}</dd>
          <dt>责任人</dt>
          <dd>{{ store.alert.assigneeId || '尚未认领' }}</dd>
        </dl>
        <h3>处置记录</h3>
        <div v-for="event in store.alert.events" :key="event.id" class="compliance-event">
          <b>{{ event.description }}</b>
          <p>{{ formatTime(event.occurredAt) }} · {{ event.actorId }}</p>
        </div>
        <el-alert
          v-if="store.alert.resolveBlockers.length"
          :title="store.alert.resolveBlockers.join('；')"
          type="warning"
          :closable="false"
        />
        <div class="compliance-actions">
          <EvidenceLinks :refs="store.alert.evidenceRefs" /><router-link
            v-if="store.alert.traceId"
            :to="{ path: '/compliance/full-chain', query: { traceId: store.alert.traceId } }"
            >查看关联链路</router-link
          ><el-button
            v-if="store.alert.currentStatus === 'pending'"
            type="primary"
            :disabled="!store.alert.allowedActions.includes('claim')"
            @click="open('claim')"
            >认领事件</el-button
          ><template v-if="store.alert.currentStatus === 'processing'"
            ><el-button
              :disabled="!store.alert.allowedActions.includes('evidence')"
              @click="open('evidence')"
              >追加补证</el-button
            ><el-button
              type="primary"
              :disabled="!store.alert.allowedActions.includes('resolve')"
              @click="open('resolve')"
              >提交复核</el-button
            ></template
          >
        </div>
        <p v-if="!store.alert.allowedActions.length" class="compliance-warning">
          当前无处置权限或事件已关闭。
        </p></template
      ><el-empty v-else description="选择事件查看详情" :image-size="85"
    /></PanelCard>
  </div>
  <AlertActionDialog v-model="dialog" :action="action" />
</template>
