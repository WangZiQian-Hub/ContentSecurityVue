<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import PanelCard from '../../components/PanelCard.vue'
import WorkbenchKpis from './WorkbenchKpis.vue'
import { useModelWorkbench } from '../../stores/model-workbench'
import {
  modelSources,
  modelTypes,
  formatModelTime,
  type ModelAsset,
} from '../../types/model-workbench'
const store = useModelWorkbench()
const route = useRoute()
const keyword = ref(''),
  type = ref(''),
  source = ref('')
const selectedId = ref(String(route.query.modelId || store.data.models[0]?.id || ''))
const selected = computed(() => store.data.models.find((m) => m.id === selectedId.value))
const rowClass = ({ row }: { row: ModelAsset }) =>
  row.id === selectedId.value ? 'mw-selected-row' : ''
const rows = computed(() =>
  store.data.models.filter(
    (m) =>
      m.name.includes(keyword.value) &&
      (!type.value || m.type === type.value) &&
      (!source.value || m.source === source.value),
  ),
)
const services = computed(() => store.data.services.filter((s) => s.modelId === selectedId.value))
const kpis = computed(() => [
  { label: '在管模型', value: store.data.models.length, icon: 'Box', unit: '个' },
  ...Object.entries(modelSources).map(([key, label]) => ({
    label,
    value: store.data.models.filter((m) => m.source === key).length,
    icon: 'Document',
    unit: '个',
  })),
  {
    label: '已关联服务',
    value: store.data.models.filter((m) => store.data.services.some((s) => s.modelId === m.id))
      .length,
    icon: 'Link',
    unit: '个模型',
  },
])
const dialog = ref(false)
const form = reactive({
  name: '',
  type: '生成式',
  source: 'self' as ModelAsset['source'],
  version: '',
  description: '',
})
async function submit() {
  if (!form.name.trim() || !/^v?\d+\.\d+\.\d+$/.test(form.version))
    return void ElMessage.warning(
      '版本号只能是三个数字，前面可以加一个 v，例如 v1.0.0。不能包含字母或中文。',
    )
  if (store.data.models.some((m) => m.name === form.name.trim()))
    return void ElMessage.warning('同名模型已存在，请查看现有模型档案')
  try {
    const model = await store.addModel({ ...form, name: form.name.trim() })
    selectedId.value = model.id
    dialog.value = false
    ElMessage.success('模型已注册')
    form.name = ''
    form.version = ''
    form.description = ''
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '注册失败')
  }
}
</script>
<template>
  <WorkbenchKpis :items="kpis" />
  <div class="mw-grid mw-wide-left">
    <PanelCard title="模型资产" icon="Box">
      <div class="mw-toolbar">
        <el-input
          v-model="keyword"
          placeholder="搜索模型名称"
          clearable
          aria-label="搜索模型名称"
        /><el-select v-model="type" placeholder="全部类型" clearable aria-label="模型类型"
          ><el-option v-for="t in modelTypes" :key="t" :value="t" /></el-select
        ><el-select v-model="source" placeholder="全部来源" clearable aria-label="模型来源"
          ><el-option
            v-for="(label, key) in modelSources"
            :key="key"
            :value="key"
            :label="label" /></el-select
        ><el-button type="primary" :icon="Plus" @click="dialog = true">注册模型</el-button>
      </div>
      <el-table
        :data="rows"
        border
        highlight-current-row
        :row-class-name="rowClass"
        empty-text="暂无匹配模型"
        @row-click="(row: ModelAsset) => (selectedId = row.id)"
        ><el-table-column prop="name" label="模型名称" min-width="175" /><el-table-column
          prop="type"
          label="类型"
          min-width="95"
        /><el-table-column label="来源" min-width="95"
          ><template #default="{ row }">{{
            modelSources[row.source as keyof typeof modelSources]
          }}</template></el-table-column
        ><el-table-column prop="version" label="当前版本" min-width="95" /><el-table-column
          label="服务关联"
          min-width="100"
          ><template #default="{ row }"
            ><el-tag
              :type="store.data.services.some((s) => s.modelId === row.id) ? 'success' : 'info'"
              >{{
                store.data.services.some((s) => s.modelId === row.id) ? '已关联' : '未关联'
              }}</el-tag
            ></template
          ></el-table-column
        ><el-table-column label="操作" width="95"
          ><template #default="{ row }"
            ><el-button link type="primary" @click="selectedId = row.id"
              >查看版本</el-button
            ></template
          ></el-table-column
        ></el-table
      > </PanelCard
    ><PanelCard title="模型档案" icon="Box"
      ><template v-if="selected"
        ><h3 class="mw-asset-title">{{ selected.name }}</h3>
        <div class="mw-tags">
          <el-tag>{{ selected.type }}</el-tag
          ><el-tag type="success">{{ modelSources[selected.source] }}</el-tag>
        </div>
        <el-descriptions :column="1" border
          ><el-descriptions-item label="当前版本">{{ selected.version }}</el-descriptions-item
          ><el-descriptions-item label="创建人">{{ selected.creator }}</el-descriptions-item
          ><el-descriptions-item label="更新时间">{{
            formatModelTime(selected.updatedAt)
          }}</el-descriptions-item
          ><el-descriptions-item label="模型说明">{{
            selected.description || '暂无说明'
          }}</el-descriptions-item
          ><el-descriptions-item label="训练数据">{{
            selected.dataset || '未关联训练数据'
          }}</el-descriptions-item
          ><el-descriptions-item label="关联服务">{{
            services.map((s) => s.name).join('、') || '尚未关联'
          }}</el-descriptions-item></el-descriptions
        >
        <div class="mw-actions">
          <router-link :to="{ path: '/model-train/evaluation', query: { modelId: selected.id } }"
            ><el-button>前往模型评估</el-button></router-link
          ><router-link :to="{ path: '/model-train/deploy', query: { modelId: selected.id } }"
            ><el-button type="primary">查看部署服务</el-button></router-link
          >
        </div></template
      ><el-empty v-else description="请选择模型"
    /></PanelCard>
  </div>
  <PanelCard title="版本记录" icon="Clock"
    ><el-table :data="selected?.versions || []" border empty-text="暂无版本记录"
      ><el-table-column prop="version" label="版本号" width="120" /><el-table-column
        label="发布时间"
        min-width="170"
        ><template #default="{ row }">{{
          formatModelTime(row.createdAt)
        }}</template></el-table-column
      ><el-table-column prop="description" label="更新说明" min-width="180" /><el-table-column
        label="产物来源"
        min-width="150"
        ><template #default="{ row }">{{ row.taskId || '外部注册' }}</template></el-table-column
      ><el-table-column label="状态" width="120"
        ><template #default="{ row }"
          ><el-tag :type="row.version === selected?.version ? 'success' : 'info'">{{
            row.version === selected?.version ? '当前版本' : '其他版本'
          }}</el-tag></template
        ></el-table-column
      ></el-table
    ></PanelCard
  >
  <el-dialog v-model="dialog" title="注册模型" width="520px" class="mw-dialog"
    ><el-form label-width="90px" @submit.prevent="submit"
      ><el-form-item label="模型名称" required
        ><el-input v-model="form.name" maxlength="80" /></el-form-item
      ><el-form-item label="模型类型"
        ><el-select v-model="form.type"
          ><el-option v-for="t in modelTypes" :key="t" :value="t" /></el-select></el-form-item
      ><el-form-item label="模型来源"
        ><el-select v-model="form.source"
          ><el-option
            v-for="(label, key) in modelSources"
            :key="key"
            :value="key"
            :label="label" /></el-select></el-form-item
      ><el-form-item label="版本号" required
        ><el-input
          v-model="form.version"
          placeholder="三个数字，如 v1.0.0（可有可无 v，不能有其他字母）" /></el-form-item
      ><el-form-item label="模型说明"
        ><el-input
          v-model="form.description"
          type="textarea"
          :rows="3"
          maxlength="500" /></el-form-item></el-form
    ><template #footer
      ><el-button @click="dialog = false">取消</el-button
      ><el-button type="primary" :loading="store.busy" @click="submit"
        >注册模型</el-button
      ></template
    ></el-dialog
  >
</template>
