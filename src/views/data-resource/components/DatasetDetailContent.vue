<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ResourceDataset } from '../../../types/data-resource'
const props = defineProps<{ dataset: ResourceDataset }>()
const tab = ref('basic')
const languageNames: Record<string, string> = { zh: '中文', en: '英文', ja: '日文', ar: '阿拉伯文' }
watch(
  () => props.dataset.id,
  () => {
    tab.value = 'basic'
  },
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
          dataset.languages.map((code) => languageNames[code] ?? code).join(' / ')
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
