<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAgentTraceStatisticsStore } from '../../../../stores/agent-trace-statistics'
const emit = defineEmits<{ closed: [] }>()
import {
  jsonLineTokens,
  statisticNumber as num,
  statisticSeconds as seconds,
  statisticStatus as status,
  statisticStatusType as statusType,
} from '../../../../utils/agent-trace-statistics'
const store = useAgentTraceStatisticsStore(),
  tab = ref('sample'),
  copyMessage = ref('')
const d = computed(() => store.detail)
watch(
  () => store.selectedId,
  () => {
    tab.value = 'sample'
    copyMessage.value = ''
  },
)
const text = computed(() =>
  tab.value === 'raw' ? d.value?.rawPreview.rawText || '' : d.value?.sampleJson.jsonText || '',
)
const lines = computed(() => text.value.split('\n').map(jsonLineTokens))
const full = computed(() => !!d.value?.sampleJson.complete && !d.value.sampleJson.truncated)
const canCopy = computed(
  () =>
    !!d.value?.permissions.copyJson &&
    !!d.value.sampleJson.isValidJson &&
    d.value.sampleJson.loadedBytes <= 1048576,
)
async function copy() {
  if (!canCopy.value || !d.value) return
  try {
    await navigator.clipboard.writeText(d.value.sampleJson.jsonText)
    copyMessage.value = full.value ? '已复制完整 JSON' : '已复制预览 JSON'
  } catch {
    copyMessage.value = '无法访问剪贴板，请选中代码手动复制'
  }
}
</script>
<template>
  <el-drawer
    :model-value="store.opened"
    title="样本详情"
    direction="rtl"
    size="44vw"
    append-to-body
    class="ats-json-drawer"
    :close-on-click-modal="true"
    @close="store.close"
    @closed="emit('closed')"
  >
    <template #header
      ><div class="ats-drawer-heading">
        <strong>样本详情</strong><el-tag v-if="d" size="small">{{ d.displayId }}</el-tag>
      </div></template
    >
    <div v-if="store.detailLoading && !d" class="ats-drawer-loading" role="status">
      正在加载样本 JSON…
    </div>
    <el-alert
      v-if="store.detailError"
      :title="store.detailError"
      type="error"
      :closable="false"
    /><el-button v-if="store.detailError" @click="store.select(store.selectedId)"
      >重试当前样本</el-button
    >
    <template v-if="d">
      <div class="ats-drawer-meta">批次 {{ d.batchId }} · 来源 {{ d.summary.filename }}</div>
      <div class="ats-drawer-tags">
        <el-tag size="small">{{
          d.summary.language === 'zh'
            ? '中文'
            : d.summary.language === 'en'
              ? 'English'
              : d.summary.language
        }}</el-tag
        ><el-tag type="info" size="small">测试集类别：{{ d.summary.testCategoryLabel }}</el-tag
        ><el-tag :type="statusType(d.summary.taskStatus)" size="small"
          >任务状态：{{ status(d.summary.taskStatus) }}</el-tag
        ><el-tag :type="d.audit.decision === 'risk_found' ? 'danger' : 'info'" size="small"
          >审计结论：{{
            {
              risk_found: '检出风险',
              no_risk_found: '未检出风险',
              pending: '待审计',
              error: '审计失败',
              unknown: '未知',
            }[d.audit.decision] || '未知'
          }}</el-tag
        >
      </div>
      <div class="ats-drawer-summary">
        <div>
          <small>运行概览</small
          ><b>{{ num(d.summary.eventCount) }} 步 / {{ num(d.summary.callCount) }} 次工具调用</b>
        </div>
        <div>
          <small>运行时长</small><b>{{ seconds(d.summary.durationMs) }}</b>
        </div>
        <footer>
          <span
            >输入 <b>{{ num(d.summary.tokenUsage.input) }}</b></span
          ><span
            >已记录推理 <b>{{ num(d.summary.tokenUsage.reasoningRecorded) }}</b></span
          ><span
            >输出 <b>{{ num(d.summary.tokenUsage.finalOutput) }}</b></span
          ><span
            >合计 <b>{{ num(d.summary.tokenUsage.totalRecorded) }}</b></span
          >
        </footer>
      </div>
      <el-tabs v-model="tab" class="ats-drawer-tabs"
        ><el-tab-pane label="样本 JSON" name="sample" /><el-tab-pane
          label="原始文件"
          name="raw"
          :disabled="!d.permissions.viewRaw" /><el-tab-pane label="字段映射" name="mapping"
      /></el-tabs>
      <div v-if="tab === 'sample'" class="ats-code-toolbar">
        <strong>样本 JSON · {{ full ? '完整结构' : '预览 / 未完整加载' }} · 只读</strong>
        <div>
          <el-button size="small" :disabled="!canCopy" @click="copy">{{
            full ? '复制 JSON' : '复制预览 JSON'
          }}</el-button
          ><el-button
            size="small"
            type="primary"
            :disabled="
              !d.permissions.exportJson || !store.exportAllowed('sample_json') || store.exportBusy
            "
            @click="store.exportResult('sample_json')"
            >导出 JSON</el-button
          >
        </div>
      </div>
      <div v-if="tab === 'raw'" class="ats-code-toolbar">
        <strong
          >原始{{ d.rawPreview.kind === 'file' ? '文件' : '记录片段' }} ·
          {{ d.rawPreview.truncated ? '已截断' : '当前授权范围' }}</strong
        ><span>第 {{ d.rawPreview.lineStart }}—{{ d.rawPreview.lineEnd }} 行</span>
      </div>
      <small v-if="tab === 'sample' && !full"
        >事件 {{ d.sampleJson.previewScope.eventsShown }} /
        {{ d.sampleJson.previewScope.eventsTotal ?? '未知' }}；{{
          d.sampleJson.reason || '预览不是完整轨迹，可通过导出获取完整授权数据'
        }}</small
      >
      <small v-if="copyMessage" role="status">{{ copyMessage }}</small>
      <div v-if="tab === 'mapping'" class="ats-code-scroll">
        <p>{{ d.mapping.formatLabel }} · 映射版本 {{ d.mapping.mappingVersion }}</p>
        <el-table :data="d.mapping.rows" border size="small"
          ><el-table-column prop="sourcePath" label="原始字段" /><el-table-column
            prop="targetPath"
            label="标准字段"
          /><el-table-column prop="description" label="说明" /><el-table-column
            label="状态"
            width="90"
            ><template #default="{ row }">{{
              {
                mapped: '已映射',
                generated: '系统生成',
                unmapped: '未映射',
                not_applicable: '不适用',
              }[row.state as string] || row.state
            }}</template></el-table-column
          ></el-table
        >
        <p v-if="d.mapping.truncated">仅展示部分映射，共 {{ d.mapping.totalRows }} 行。</p>
      </div>
      <div
        v-else-if="
          (tab === 'raw' && d.rawPreview.availability === 'unavailable') ||
          (tab === 'sample' && d.sampleJson.availability === 'unavailable')
        "
        class="ats-code-scroll"
      >
        <el-empty
          :description="(tab === 'raw' ? d.rawPreview.reason : d.sampleJson.reason) || '内容未提供'"
        />
      </div>
      <div v-else class="ats-code-scroll" tabindex="0" aria-label="只读 JSON 代码">
        <pre><code><span v-for="(line,i) in lines" :key="i" class="ats-code-line"><i aria-hidden="true">{{ i+1 }}</i><span v-for="(token,j) in line" :key="j" :class="`ats-syntax-${token.kind}`">{{ token.text }}</span>{{ '\n' }}</span></code></pre>
      </div>
      <el-button
        v-if="
          (tab === 'sample' && d.sampleJson.nextCursor) ||
          (tab === 'raw' && d.rawPreview.nextCursor)
        "
        :loading="store.detailLoading"
        @click="store.more(tab === 'raw' ? 'raw' : 'sample')"
        >加载更多（最多预览 1 MiB）</el-button
      >
      <div class="ats-drawer-footer">
        <span>第 {{ d.navigation.position }} 条 / 当前筛选结果 {{ d.navigation.total }} 条</span>
        <div>
          <el-button
            size="small"
            :disabled="!d.navigation.previous || store.detailLoading"
            @click="store.select(d.navigation.previous!.traceId)"
            >上一条</el-button
          ><el-button
            size="small"
            type="primary"
            :disabled="!d.navigation.next || store.detailLoading"
            @click="store.select(d.navigation.next!.traceId)"
            >下一条</el-button
          >
        </div>
      </div>
      <small class="ats-drawer-note">敏感字段按权限脱敏；关闭后保留列表范围与页码。</small>
    </template>
  </el-drawer>
</template>
