<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Connection } from '@element-plus/icons-vue'
import PanelCard from '../../components/PanelCard.vue'
import WorkbenchKpis from './WorkbenchKpis.vue'
import { useModelWorkbench } from '../../stores/model-workbench'
import {
  serviceStates,
  formatModelTime,
  percent,
  type ModelService,
} from '../../types/model-workbench'
import { isMock } from '../../api/request'
const store = useModelWorkbench(),
  route = useRoute()
const keyword = ref(''),
  type = ref(''),
  status = ref('')
const modelFilter = ref(String(route.query.modelId || ''))
const selectedId = ref(
  store.data.services.find((s) => !modelFilter.value || s.modelId === modelFilter.value)?.id,
)
const selected = computed(() => store.data.services.find((s) => s.id === selectedId.value))
const rowClass = ({ row }: { row: ModelService }) =>
  row.id === selectedId.value ? 'mw-selected-row' : ''
const modelName = (id: string) => store.data.models.find((m) => m.id === id)?.name || id
const rows = computed(() =>
  store.data.services.filter(
    (s) =>
      (!modelFilter.value || s.modelId === modelFilter.value) &&
      `${s.name}${modelName(s.modelId)}`.includes(keyword.value) &&
      (!type.value || s.type === type.value) &&
      (!status.value || s.status === status.value),
  ),
)
const pending = computed(() =>
  store.data.models.filter((m) => !store.data.services.some((s) => s.modelId === m.id)),
)
const kpis = computed(() => [
  { label: '已登记服务', value: store.data.services.length, icon: 'Coin', unit: '个' },
  {
    label: '运行中',
    value: store.data.services.filter((s) => s.status === 'running').length,
    icon: 'VideoPlay',
    unit: '个',
  },
  {
    label: '已部署',
    value: store.data.services.filter((s) => s.status === 'deployed').length,
    icon: 'Box',
    unit: '个',
  },
  { label: '待部署模型', value: pending.value.length, icon: 'Document', unit: '个' },
  {
    label: '最近检查成功率',
    value: percent(
      store.data.services.filter((s) => s.healthy === true).length,
      store.data.services.filter((s) => s.healthy !== null).length,
    ),
    icon: 'CircleCheckFilled',
  },
])
const dialog = ref(false)
const form = reactive({
  name: '',
  modelId: store.data.models[0]?.id || '',
  version: '',
  type: 'local' as ModelService['type'],
  endpoint: '',
})
const model = computed(() => store.data.models.find((m) => m.id === form.modelId))
watch(
  model,
  (m) => {
    form.version = m?.version || ''
  },
  { immediate: true },
)
function open(id?: string) {
  form.modelId = id || store.data.models[0]?.id || ''
  form.name = ''
  form.version = store.data.models.find((item) => item.id === form.modelId)?.version || ''
  form.type = 'local'
  form.endpoint = ''
  dialog.value = true
}
async function submit() {
  let url: URL
  try {
    url = new URL(form.endpoint)
  } catch {
    return void ElMessage.warning('请输入有效的服务地址')
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    return void ElMessage.warning('服务地址须为 HTTP 或 HTTPS，且不能包含密钥、查询参数或片段')
  if (!form.name.trim() || !model.value?.versions.some((v) => v.version === form.version))
    return void ElMessage.warning('请填写服务名称并选择模型版本')
  if (
    store.data.services.some(
      (service) =>
        service.name === form.name.trim() || service.endpoint.toLowerCase() === url.toString().toLowerCase(),
    )
  )
    return void ElMessage.warning('服务名称或服务地址已登记')
  try {
    const service = await store.addService({ ...form, name: form.name.trim() })
    selectedId.value = service.id
    modelFilter.value = ''
    dialog.value = false
    ElMessage.success('服务已登记，尚未检查连接')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '登记失败')
  }
}
async function check() {
  if (!selected.value) return
  try {
    await store.checkService(selected.value.id)
    ElMessage.success(isMock ? '模拟连接检查完成' : '连接检查完成')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '检查失败')
  }
}
</script>
<template>
  <WorkbenchKpis :items="kpis" />
  <div class="mw-grid mw-wide-left">
    <PanelCard title="推理服务列表" icon="Connection"
      ><template #extra
        ><el-button type="primary" :icon="Plus" @click="open()">登记服务</el-button></template
      >
      <div class="mw-toolbar">
        <el-select v-model="type" clearable placeholder="全部接入方式" aria-label="接入方式"
          ><el-option label="本地服务" value="local" /><el-option
            label="外部接口"
            value="external" /></el-select
        ><el-select v-model="status" clearable placeholder="全部状态" aria-label="服务状态"
          ><el-option
            v-for="(label, key) in serviceStates"
            :key="key"
            :label="label"
            :value="key" /></el-select
        ><el-input v-model="keyword" clearable placeholder="搜索服务或模型" aria-label="搜索服务" />
      </div>
      <el-tag v-if="modelFilter" closable @close="modelFilter = ''">{{
        modelName(modelFilter)
      }}</el-tag>
      <el-table
        :data="rows"
        border
        :row-class-name="rowClass"
        empty-text="暂无关联服务"
        @row-click="(row: ModelService) => (selectedId = row.id)"
        ><el-table-column prop="name" label="服务名称" min-width="165" /><el-table-column
          label="绑定模型版本"
          min-width="190"
          ><template #default="{ row }"
            >{{ modelName(row.modelId) }} {{ row.version }}</template
          ></el-table-column
        ><el-table-column label="接入方式" width="100"
          ><template #default="{ row }">{{
            row.type === 'local' ? '本地服务' : '外部接口'
          }}</template></el-table-column
        ><el-table-column label="状态" width="100"
          ><template #default="{ row }"
            ><el-tag
              :type="
                row.status === 'running'
                  ? 'success'
                  : row.status === 'offline'
                    ? 'danger'
                    : 'primary'
              "
              >{{ serviceStates[row.status as keyof typeof serviceStates] }}</el-tag
            ></template
          ></el-table-column
        ><el-table-column label="最近检查" width="100"
          ><template #default="{ row }">{{
            row.healthy === null ? '未检查' : row.healthy ? '正常' : '异常'
          }}</template></el-table-column
        ><el-table-column label="操作" width="75"
          ><template #default="{ row }"
            ><el-button link type="primary" @click="selectedId = row.id">查看</el-button></template
          ></el-table-column
        ></el-table
      > </PanelCard
    ><PanelCard title="服务详情" icon="Tickets"
      ><template #extra><router-link to="/system/model-config">接入配置 →</router-link></template
      ><template v-if="selected"
        ><h3 class="mw-asset-title">
          {{ selected.name }} <el-tag>{{ serviceStates[selected.status] }}</el-tag>
        </h3>
        <el-descriptions :column="1" border
          ><el-descriptions-item label="服务编号">{{ selected.id }}</el-descriptions-item
          ><el-descriptions-item label="绑定版本"
            >{{ modelName(selected.modelId) }} {{ selected.version }}</el-descriptions-item
          ><el-descriptions-item label="服务类型">{{
            selected.type === 'local' ? '本地服务' : '外部接口'
          }}</el-descriptions-item
          ><el-descriptions-item label="服务地址">{{ selected.endpoint }}</el-descriptions-item
          ><el-descriptions-item label="最近检查">{{
            formatModelTime(selected.checkedAt)
          }}</el-descriptions-item
          ><el-descriptions-item label="响应耗时">{{
            selected.latencyMs === null ? '暂无' : `${selected.latencyMs} 毫秒`
          }}</el-descriptions-item></el-descriptions
        >
        <div class="mw-actions">
          <el-button :icon="Connection" :loading="store.busy" @click="check">检查连接</el-button
          ><router-link
            :to="{
              path: '/model-train/invoke',
              query: { serviceId: selected.id, modelId: selected.modelId },
            }"
            ><el-button type="primary" :disabled="selected.status !== 'running'"
              >前往模型调用</el-button
            ></router-link
          >
        </div></template
      ><el-empty v-else description="请选择服务"
    /></PanelCard>
  </div>
  <div class="mw-grid mw-halves">
    <PanelCard title="待部署模型" icon="Box"
      ><div v-for="m in pending" :key="m.id" class="mw-pending-row">
        <div>
          <b>{{ m.name }}</b>
          <p>{{ m.version }} · 尚未关联服务</p>
        </div>
        <el-button type="primary" @click="open(m.id)">登记服务</el-button>
      </div>
      <el-empty
        v-if="!pending.length"
        description="所有模型均已关联服务"
        :image-size="70" /></PanelCard
    ><PanelCard title="最近服务变更" icon="Clock"
      ><div class="mw-changes">
        <div v-for="change in store.data.changes" :key="change.id" class="mw-pending-row">
          <span>{{ formatModelTime(change.createdAt) }}</span
          ><b>{{ change.serviceName }}</b
          ><span>{{ change.description }}</span>
        </div>
      </div>
      <el-empty v-if="!store.data.changes.length" description="暂无服务变更" :image-size="70"
    /></PanelCard>
  </div>
  <el-dialog v-model="dialog" title="登记推理服务" width="540px" class="mw-dialog"
    ><el-form label-width="100px" @submit.prevent="submit"
      ><el-form-item label="服务名称" required
        ><el-input v-model="form.name" maxlength="80" /></el-form-item
      ><el-form-item label="绑定模型" required
        ><el-select v-model="form.modelId"
          ><el-option
            v-for="m in store.data.models"
            :key="m.id"
            :label="m.name"
            :value="m.id" /></el-select></el-form-item
      ><el-form-item label="绑定版本" required
        ><el-select v-model="form.version"
          ><el-option
            v-for="v in model?.versions"
            :key="v.version"
            :value="v.version" /></el-select></el-form-item
      ><el-form-item label="接入方式"
        ><el-radio-group v-model="form.type"
          ><el-radio-button value="local">本地服务</el-radio-button
          ><el-radio-button value="external">外部接口</el-radio-button></el-radio-group
        ></el-form-item
      ><el-form-item label="服务地址" required
        ><el-input v-model="form.endpoint" placeholder="https://服务地址" /></el-form-item></el-form
    ><template #footer
      ><el-button @click="dialog = false">取消</el-button
      ><el-button type="primary" :loading="store.busy" @click="submit"
        >登记服务</el-button
      ></template
    ></el-dialog
  >
</template>
