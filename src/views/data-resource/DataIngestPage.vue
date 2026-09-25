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
import { getDataset, listDatasets } from '../../api/data-resource'
import type { IngestTask, ResourceDataset } from '../../types/data-resource'
const store = useDataResourceStore()
const route = useRoute()
const source = ref('file')
const sourceOptions = [
  {
    value: 'file',
    label: '本地文件',
    icon: 'Document',
    hint: '',
    addressLabel: '',
    addressPlaceholder: '',
    addressHelp: '',
  },
  {
    value: 'database',
    label: '数据库',
    icon: 'Coin',
    hint: '连接数据库，由后端读取指定的表或查询结果，无需上传数据库文件。',
    addressLabel: '数据库连接地址',
    addressPlaceholder: '例如 mysql://主机:3306/数据库名',
    addressHelp: '账号、密码和采集范围需在后端连接器中配置。',
  },
  {
    value: 'api',
    label: 'API接口',
    icon: 'Connection',
    hint: '填写接口地址，由后端请求接口并接收返回的数据。',
    addressLabel: '接口 URL',
    addressPlaceholder: '例如 https://example.com/api/data',
    addressHelp: '如需鉴权，请在后端连接器中配置。',
  },
  {
    value: 'object_storage',
    label: '对象存储',
    icon: 'UploadFilled',
    hint: '填写存储桶或目录地址，由后端读取其中的文件。',
    addressLabel: '存储桶或目录地址',
    addressPlaceholder: '例如 s3://bucket/path/',
    addressHelp: '访问密钥需在后端连接器中配置。',
  },
  {
    value: 'queue',
    label: '消息队列',
    icon: 'ChatDotSquare',
    hint: '连接消息队列，由后端订阅主题并接收消息。',
    addressLabel: '消息队列地址',
    addressPlaceholder: '例如 broker.example.com:9092',
    addressHelp: '主题、消费组和访问凭证需在后端连接器中配置。',
  },
  {
    value: 'web',
    label: '网络采集',
    icon: 'Location',
    hint: '填写起始网页，由后端采集器抓取页面内容。',
    addressLabel: '起始网页 URL',
    addressPlaceholder: '例如 https://example.com/articles',
    addressHelp: '采集范围和频率需在后端连接器中配置。',
  },
]
const selectedSource = computed(() => sourceOptions.find((item) => item.value === source.value)!)
const form = reactive({
  name: '',
  datasetTarget: Number(route.query.dataset) || (undefined as number | 'new' | undefined),
  newDatasetName: '',
  newDatasetSourceType: 'business' as 'internet' | 'industry' | 'business' | 'synthetic',
  languages: ['zh'],
  modalities: ['文本'],
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
const datasetOptions = ref<ResourceDataset[]>([])
const selectedDataset = ref<ResourceDataset>()
const visibleDatasetOptions = computed(() =>
  selectedDataset.value &&
  !datasetOptions.value.some((item) => item.id === selectedDataset.value?.id)
    ? [selectedDataset.value, ...datasetOptions.value]
    : datasetOptions.value,
)
const datasetLoading = ref(false)
const datasetTotal = ref(0)
let datasetSearchSeq = 0
let datasetSearchTimer: ReturnType<typeof setTimeout> | undefined
const busy = ref(false)
const current = ref<IngestTask>()
const tableKey = ref(0)
function selectSource(value: string) {
  if (source.value === value) return
  source.value = value
  form.sourceAddress = ''
}
async function loadDatasetOptions(keyword = '', seq = ++datasetSearchSeq) {
  datasetLoading.value = true
  try {
    const result = await listDatasets({ page: 1, pageSize: 50, keyword: keyword.trim() })
    if (seq !== datasetSearchSeq) return
    datasetOptions.value = result.items
    datasetTotal.value = result.total
  } catch {
    if (seq === datasetSearchSeq) {
      datasetOptions.value = []
      datasetTotal.value = 0
    }
  } finally {
    if (seq === datasetSearchSeq) datasetLoading.value = false
  }
}
function searchDatasets(keyword: string) {
  if (datasetSearchTimer) clearTimeout(datasetSearchTimer)
  const seq = ++datasetSearchSeq
  datasetLoading.value = true
  datasetSearchTimer = setTimeout(() => void loadDatasetOptions(keyword, seq), 250)
}
function selectDataset(value: number | 'new') {
  selectedDataset.value =
    typeof value === 'number' ? datasetOptions.value.find((item) => item.id === value) : undefined
}
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
  if (!form.name.trim() || !form.datasetTarget) {
    ElMessage.warning('请填写任务名称并选择目标数据集')
    return
  }
  if (form.datasetTarget === 'new' && !form.newDatasetName.trim()) {
    ElMessage.warning('请填写新数据集名称')
    return
  }
  if (form.datasetTarget !== 'new' && selectedDataset.value?.id !== form.datasetTarget) {
    ElMessage.warning('请重新选择目标数据集')
    return
  }
  if (source.value === 'file' && !files.value.length) {
    ElMessage.warning('请选择待接入文件')
    return
  }
  if (source.value !== 'file' && !form.sourceAddress.trim()) {
    ElMessage.warning(`请填写${selectedSource.value.addressLabel}`)
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
    const creatingDataset = form.datasetTarget === 'new'
    const dataset = selectedDataset.value
    const result = await store.startIngest({
      capabilityCode: 'data_ingest',
      name: form.name.trim(),
      input: {
        datasetId: creatingDataset ? null : form.datasetTarget,
        datasetName: creatingDataset ? form.newDatasetName.trim() : dataset?.name,
        sourceType: creatingDataset ? form.newDatasetSourceType : dataset?.sourceType,
        createDataset: creatingDataset,
        connectorType: source.value,
        languages: [...form.languages],
        modalities: [...form.modalities],
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
onMounted(async () => {
  await loadDatasetOptions()
  if (typeof form.datasetTarget === 'number') {
    try {
      selectedDataset.value = await getDataset(form.datasetTarget)
    } catch {
      form.datasetTarget = undefined
    }
  } else if (!datasetTotal.value) {
    form.datasetTarget = 'new'
  }
})
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
          @click="selectSource(item.value)"
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
            ><el-select
              v-model="form.datasetTarget"
              filterable
              remote
              :remote-method="searchDatasets"
              :loading="datasetLoading"
              loading-text="正在搜索数据集"
              no-data-text="未找到数据集，请换个关键词"
              placeholder="输入关键词搜索已有数据集，或直接新建"
              @change="selectDataset"
              ><el-option label="＋ 随本次接入新建数据集" value="new" /><el-option
                v-for="item in visibleDatasetOptions"
                :key="item.id"
                :label="item.name"
                :value="item.id" /><el-option
                v-if="datasetTotal > 50"
                label="结果较多，请输入更具体的关键词"
                value="more"
                disabled /></el-select></el-form-item
          ><template v-if="form.datasetTarget === 'new'">
            <el-form-item label="新数据集名称" required
              ><el-input
                v-model="form.newDatasetName"
                maxlength="255"
                placeholder="请输入新数据集名称" /></el-form-item
            ><el-form-item label="数据来源类型"
              ><el-select v-model="form.newDatasetSourceType"
                ><el-option label="业务数据" value="business" /><el-option
                  label="互联网"
                  value="internet" /><el-option label="行业数据" value="industry" /><el-option
                  label="合成数据"
                  value="synthetic" /></el-select></el-form-item></template
          ><el-form-item label="数据语言（可多选）"
            ><el-select v-model="form.languages" multiple placeholder="请选择数据语言"
              ><el-option label="中文" value="zh" /><el-option label="英文" value="en" /><el-option
                label="日文"
                value="ja" /><el-option label="阿拉伯文" value="ar" /><el-option
                label="其它"
                value="other" /></el-select></el-form-item
          ><el-form-item label="数据模态（可多选）"
            ><el-select v-model="form.modalities" multiple placeholder="请选择数据模态"
              ><el-option
                v-for="name in ['文本', '图片', '视频', '音频', '其它']"
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
              <AppIcon :name="selectedSource.icon" /><b>{{ selectedSource.label }}接入</b>
              <p>{{ selectedSource.hint }}</p>
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
            ><el-form-item v-if="source !== 'file'" :label="selectedSource.addressLabel" required
              ><el-input
                v-model="form.sourceAddress"
                :placeholder="selectedSource.addressPlaceholder"
              />
              <small class="resource-address-help">{{
                selectedSource.addressHelp
              }}</small></el-form-item
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
