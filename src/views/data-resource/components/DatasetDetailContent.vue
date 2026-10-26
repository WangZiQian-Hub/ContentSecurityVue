<script setup lang="ts">
import { ref, watch } from 'vue'
import { languageName } from '../../../utils/governance-language'
import { getDatasetVersions, type DatasetVersionInfo } from '../../../api/data-resource'
import type { ResourceDataset } from '../../../types/data-resource'
const props = defineProps<{ dataset: ResourceDataset }>()
const tab = ref('basic')
const versions = ref<DatasetVersionInfo[]>([])
watch(
  () => props.dataset.id,
  (id) => {
    tab.value = 'basic'
    versions.value = []
    void getDatasetVersions(id)
      .then((rows) => (versions.value = rows))
      .catch(() => (versions.value = []))
  },
  { immediate: true },
)
</script>
<template>
  <div class="resource-detail-metrics">
    <div>
      <span>数据量</span><b>{{ dataset.rowCount.toLocaleString() }}</b>
    </div>
    <div>
      <span>存储量</span><b>{{ dataset.storageGb }} GB</b>
    </div>
    <div>
      <span>质量评分</span><b>{{ dataset.qualityScore }}</b>
    </div>
  </div>
  <el-tabs v-model="tab">
    <el-tab-pane label="基本信息" name="basic"
      ><h4>数据集描述</h4>
      <p class="resource-description">{{ dataset.description }}</p>
      <el-descriptions :column="1">
        <el-descriptions-item label="数据模态">{{
          dataset.modalities.join(' / ')
        }}</el-descriptions-item>
        <el-descriptions-item label="数据语言">{{
          dataset.languages.map(languageName).join(' / ')
        }}</el-descriptions-item>
        <el-descriptions-item label="数据所有者">{{ dataset.owner }}</el-descriptions-item>
        <el-descriptions-item label="数据来源">{{ dataset.sourceName }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{
          new Date(dataset.createdAt).toLocaleString('zh-CN')
        }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{
          new Date(dataset.updatedAt).toLocaleString('zh-CN')
        }}</el-descriptions-item>
        <el-descriptions-item label="当前版本">{{ dataset.versionId }}</el-descriptions-item>
      </el-descriptions>
      <h4>版本清单</h4>
      <el-table :data="versions" border size="small" empty-text="暂无版本记录">
        <el-table-column prop="label" label="版本" width="90" />
        <el-table-column prop="sampleCount" label="样本数" width="90">
          <template #default="{ row }">{{ row.sampleCount.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="changeSummary" label="说明" min-width="150" show-overflow-tooltip />
        <el-table-column label="来源任务" width="120" show-overflow-tooltip>
          <template #default="{ row }">{{ row.producingTaskId || '—' }}</template>
        </el-table-column>
        <el-table-column label="清单哈希" width="110">
          <template #default="{ row }">
            <code :title="row.manifestHash">{{ String(row.manifestHash).slice(0, 10) }}…</code>
          </template>
        </el-table-column>
        <el-table-column label="登记时间" width="150">
          <template #default="{ row }">{{
            row.createdAt ? new Date(row.createdAt).toLocaleString('zh-CN') : '—'
          }}</template>
        </el-table-column>
      </el-table>
      <p class="resource-hint">
        版本=对样本行的不可变引用清单（#13）：清洗派生新版本只增清单不复制内容，哈希用于核对分析样本集。
      </p>
    </el-tab-pane>
    <el-tab-pane label="元数据" name="metadata">
      <pre class="resource-json">{{ JSON.stringify(dataset, null, 2) }}</pre>
    </el-tab-pane>
    <el-tab-pane label="质量报告" name="quality"
      ><el-progress type="dashboard" :percentage="dataset.qualityScore" />
      <p>当前质量评分；详细检测报告待质量服务接入。</p></el-tab-pane
    >
  </el-tabs>
</template>
