// “数据接入” 子页面
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { UploadFile, UploadFiles } from 'element-plus'
import PanelCard from '../../components/PanelCard.vue'
import AppIcon from '../../components/AppIcon.vue'
import IngestTaskTable from './components/IngestTaskTable.vue'
import { useDataResourceStore } from '../../stores/data-resource'
import { isMock } from '../../api/request'
import type { IngestTask } from '../../types/data-resource'
const store = useDataResourceStore()
const route = useRoute()
const source = ref('file')
const sourceOptions = [
  { value: 'file', label: '本地文件', icon: 'Document' },
  { value: 'database', label: '数据库', icon: 'Coin' },
  { value: 'api', label: 'API接口', icon: 'Connection' },
  { value: 'object_storage', label: '对象存储', icon: 'UploadFilled' },
  { value: 'queue', label: '消息队列', icon: 'ChatDotSquare' },
  { value: 'web', label: '网络采集', icon: 'Location' },
]
const form = reactive({
  name: '',
  datasetId: Number(route.query.dataset) || (undefined as number | undefined),
  language: 'zh',
  modality: '文本',
  sourceName: '',
  sourceAddress: '',
  owner: '',
  removeEmpty: true,
  deduplicate: true,
  normalize: false,
  detectLanguage: true,
  qualityCheck: true,
})
const files = ref<UploadFiles>([])
const busy = ref(false)
const current = ref<IngestTask>()
const tableKey = ref(0)
const activeTask = computed(
  () => current.value ?? store.tasks.find((task) => task.status === 'running') ?? store.tasks[0],
)
const stage = computed(() =>
  !activeTask.value
    ? 0
    : activeTask.value.status === 'succeeded'
      ? 5
      : activeTask.value.progress < 30
        ? 1
        : activeTask.value.progress < 60
          ? 2
          : activeTask.value.progress < 85
            ? 3
            : 4,
)
const stageNames = ['等待执行', '正在采集', '正在清洗', '正在检测', '接入完成']
function validateFile(file: UploadFile) {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (
    !['txt', 'csv', 'json', 'xlsx', 'pdf'].includes(extension ?? '') ||
    (file.size ?? 0) > 2 * 1024 ** 3
  ) {
    files.value = files.value.filter((item) => item.uid !== file.uid)
    ElMessage.warning('请选择 TXT、CSV、JSON、XLSX 或 PDF 文件，单个文件不超过 2GB')
  }
}
async function submit() {
  if (!form.name.trim() || !form.datasetId) {
    ElMessage.warning('请填写任务名称并选择目标数据集')
    return
  }
  if (source.value === 'file' && !files.value.length) {
    ElMessage.warning('请选择待接入文件')
    return
  }
  if (source.value !== 'file' && !form.sourceAddress.trim()) {
    ElMessage.warning('请填写数据来源地址')
    return
  }
  if (isMock) {
    ElMessage.info('当前为示例模式。文件尚未上传，任务执行需连接真实后端。')
    return
  }
  busy.value = true
  try {
    const fileIds: string[] = []
    if (source.value === 'file')
      for (const file of files.value) {
        if (file.raw) fileIds.push((await store.uploadFile(file.raw)).fileId)
      }
    const dataset = store.datasets.find((item) => item.id === form.datasetId)
    const result = await store.startIngest({
      capabilityCode: 'data_ingest',
      name: form.name.trim(),
      input: {
        datasetId: form.datasetId,
        datasetName: dataset?.name,
        sourceType: dataset?.sourceType,
        connectorType: source.value,
        languages: [form.language],
        modalities: [form.modality],
        files: fileIds,
        sourceName: form.sourceName,
        sourceAddress: form.sourceAddress || null,
        owner: form.owner,
      },
      config: {
        removeEmpty: form.removeEmpty,
        deduplicate: form.deduplicate,
        normalize: form.normalize,
        detectLanguage: form.detectLanguage,
        qualityCheck: form.qualityCheck,
      },
    })
    ElMessage.success(`任务已提交：${result.taskId}`)
    current.value = undefined
    tableKey.value++
    await store.loadSummary('ingest')
  } catch {
    /* 请求层统一显示错误，保留表单以便重试。 */
  } finally {
    busy.value = false
  }
}
onMounted(() => store.loadDatasets({ page: 1, pageSize: 100 }).catch(() => undefined))
</script>
<template>
  <div class="resource-ingest-grid">
    <PanelCard title="选择数据来源" icon="Document"
      ><div class="resource-source-grid">
        <button
          v-for="item in sourceOptions"
          :key="item.value"
          :class="{ selected: source === item.value }"
          :aria-pressed="source === item.value"
          @click="source = item.value"
        >
          <AppIcon :name="item.icon" /><span>{{ item.label }}</span
          ><b v-if="source === item.value">✓</b>
        </button>
      </div></PanelCard
    >
    <PanelCard title="新建数据接入任务" icon="Document">
      <el-form label-position="top" class="resource-ingest-form" @submit.prevent="submit">
        <div class="resource-form-grid">
          <el-form-item label="任务名称" required
            ><el-input
              v-model="form.name"
              maxlength="255"
              placeholder="请输入任务名称，如：社交媒体数据接入" /></el-form-item
          ><el-form-item label="目标数据集" required
            ><el-select v-model="form.datasetId" filterable placeholder="请选择目标数据集"
              ><el-option
                v-for="item in store.datasets"
                :key="item.id"
                :label="item.name"
                :value="item.id" /></el-select></el-form-item
          ><el-form-item label="数据语言"
            ><el-select v-model="form.language"
              ><el-option label="中文" value="zh" /><el-option label="英文" value="en" /><el-option
                label="日文"
                value="ja" /><el-option label="阿拉伯文" value="ar" /></el-select></el-form-item
          ><el-form-item label="数据模态"
            ><el-select v-model="form.modality"
              ><el-option
                v-for="name in ['文本', '图片', '视频', '音频']"
                :key="name"
                :label="name"
                :value="name" /></el-select
          ></el-form-item>
        </div>
        <div class="resource-upload-grid">
          <div>
            <el-upload
              v-if="source === 'file'"
              v-model:file-list="files"
              drag
              multiple
              :auto-upload="false"
              accept=".txt,.csv,.json,.xlsx,.pdf"
              :on-change="validateFile"
              ><AppIcon name="UploadFilled" /><b>点击或拖拽文件到此处</b>
              <p>支持 TXT、CSV、JSON、XLSX、PDF<br />单个文件不超过 2GB</p></el-upload
            >
            <div v-else class="resource-source-hint">
              <AppIcon :name="sourceOptions.find((item) => item.value === source)?.icon" /><b
                >{{ sourceOptions.find((item) => item.value === source)?.label }}接入</b
              >
              <p>填写数据来源地址，提交后由后端连接器执行采集。</p>
            </div>
            <div class="resource-switches">
              <label><el-switch v-model="form.removeEmpty" />去除空数据</label
              ><label><el-switch v-model="form.detectLanguage" />自动识别语言</label
              ><label><el-switch v-model="form.deduplicate" />去除重复数据</label
              ><label><el-switch v-model="form.qualityCheck" />基础质量检测</label
              ><label><el-switch v-model="form.normalize" />格式统一</label>
            </div>
          </div>
          <div>
            <el-form-item label="来源名称"
              ><el-input v-model="form.sourceName" placeholder="请输入来源名称" /></el-form-item
            ><el-form-item label="来源地址" :required="source !== 'file'"
              ><el-input
                v-model="form.sourceAddress"
                placeholder="URL、IP 或存储地址" /></el-form-item
            ><el-form-item label="数据所有者"
              ><el-input v-model="form.owner" placeholder="请输入数据所有者"
            /></el-form-item>
          </div>
        </div>
        <div class="resource-submit">
          <small v-if="isMock">示例模式 · 上传和执行需接入后端</small
          ><el-button type="primary" native-type="submit" :loading="busy">▶ 开始接入</el-button>
        </div>
      </el-form>
    </PanelCard>
    <PanelCard title="任务执行进度" icon="PieChart"
      ><div v-if="activeTask" class="resource-task-progress">
        <el-progress
          type="circle"
          :percentage="activeTask.progress"
          :width="155"
          :stroke-width="15"
          :status="activeTask.status === 'failed' ? 'exception' : undefined"
          ><b>{{ activeTask.progress }}%</b>
          <p>
            {{ activeTask.status === 'failed' ? '接入失败' : stageNames[Math.min(stage, 4)] }}
          </p></el-progress
        ><el-steps direction="vertical" :active="stage" :space="42"
          ><el-step v-for="name in stageNames" :key="name" :title="name"
        /></el-steps>
      </div>
      <el-empty v-else description="暂无接入任务" :image-size="80" />
      <p class="resource-task-name">{{ activeTask?.name }}</p>
      <h4>接入结果统计</h4>
      <div class="resource-result-grid">
        <div>
          <span>成功</span><b>{{ activeTask?.successCount.toLocaleString() ?? '—' }}</b>
        </div>
        <div>
          <span>重复</span><b>{{ activeTask?.duplicateCount.toLocaleString() ?? '—' }}</b>
        </div>
        <div>
          <span>异常</span><b>{{ activeTask?.anomalyCount.toLocaleString() ?? '—' }}</b>
        </div>
      </div></PanelCard
    >
  </div>
  <PanelCard title="接入任务记录" icon="List"
    ><IngestTaskTable :key="tableKey" @select="current = $event"
  /></PanelCard>
</template>
