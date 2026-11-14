<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import PanelCard from '../../../../components/PanelCard.vue'
import type { AgentInput, AgentOptions } from '../../../../types/internal-agent'
import { agentPrompts, agentTools } from '../../../../types/internal-agent'
import AgentBatchSelect from './AgentBatchSelect.vue'
const props = defineProps<{
  options?: AgentOptions
  busy: boolean
  running: boolean
  batchRefreshKey?: number
}>()
const emit = defineEmits<{ submit: [AgentInput] }>()
const form = reactive<AgentInput>({
  mode: 'privacy',
  prompt: agentPrompts.privacy,
  modelId: '',
  datasetId: 0,
  sampleLimit: 10,
  maxRounds: 6,
  maxCalls: 8,
  timeoutSeconds: 240,
})
const promptDrafts = { ...agentPrompts }
const batchMode = ref<'new' | 'existing'>('new'),
  batchName = ref(''),
  batchId = ref('')
const batchReady = computed(() =>
  batchMode.value === 'new' ? !!batchName.value.trim() : !!batchId.value,
)
function submit() {
  emit('submit', {
    ...form,
    sampleLimit: form.mode === 'policy_test' ? 1 : form.sampleLimit,
    prompt: form.prompt.trim(),
    batchMode: batchMode.value,
    ...(batchMode.value === 'new'
      ? { batchName: batchName.value.trim() }
      : { batchId: batchId.value }),
  })
}
const modeOptions = computed(() => props.options?.modes?.find((m) => m.code === form.mode))
watch(
  () => form.mode,
  (next, previous) => {
    promptDrafts[previous] = form.prompt
    form.prompt = promptDrafts[next]
  },
)
watch(
  () => props.options,
  (value) => {
    if (!value) return
    if (!value.models.some((m) => m.id === form.modelId)) form.modelId = value.models[0]?.id || ''
    if (!value.datasets.some((d) => d.id === form.datasetId))
      form.datasetId = value.datasets[0]?.id || 0
  },
)
</script>
<template>
  <PanelCard title="任务配置" icon="Setting">
    <el-form v-if="options" label-position="top" :disabled="busy || !options.canCreate">
      <el-form-item label="所属批次">
        <el-radio-group v-model="batchMode" aria-label="批次归属">
          <el-radio-button value="new">新建批次</el-radio-button>
          <el-radio-button value="existing">加入已有批次</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-show="batchMode === 'new'" label="新批次名称">
        <el-input
          v-model="batchName"
          maxlength="100"
          placeholder="例如：11月权限测试"
          aria-label="新批次名称"
        />
      </el-form-item>
      <el-form-item v-show="batchMode === 'existing'" label="选择批次">
        <AgentBatchSelect
          v-model="batchId"
          :disabled="busy || !options.canCreate"
          :refresh-key="batchRefreshKey"
        />
      </el-form-item>
      <el-form-item label="任务模式">
        <el-select v-model="form.mode" aria-label="任务模式">
          <el-option
            v-for="mode in options.modes"
            :key="mode.code"
            :value="mode.code"
            :label="mode.label"
          />
        </el-select>
      </el-form-item>
      <el-alert
        v-if="modeOptions"
        :title="modeOptions.description"
        :type="form.mode === 'policy_test' ? 'warning' : 'info'"
        :closable="false"
        class="mode-description"
      />
      <el-form-item label="任务要求"
        ><el-input v-model="form.prompt" type="textarea" :rows="5" maxlength="1000" show-word-limit
      /></el-form-item>
      <el-form-item label="执行模型"
        ><el-select v-model="form.modelId" placeholder="选择已登记的 DeepSeek"
          ><el-option
            v-for="m in options?.models"
            :key="m.id"
            :value="m.id"
            :label="m.name" /></el-select
      ></el-form-item>
      <el-form-item label="测试数据集"
        ><el-select v-model="form.datasetId" placeholder="选择小型测试数据集"
          ><el-option
            v-for="d in options?.datasets"
            :key="d.id"
            :value="d.id"
            :label="`${d.name} · ${d.recordCount} 条 · ${d.version}`" /></el-select
      ></el-form-item>
      <p v-if="options && !options.datasets.length" class="hint">
        暂无符合条件的测试数据集。仅开放实际入库 1～100
        条、名称含“测试/test”或已由后端指定的数据集；待检测文本每条不超过 1500 字。
      </p>
      <div class="limits">
        <el-form-item v-if="form.mode === 'privacy'" label="检测样本上限"
          ><el-input-number v-model="form.sampleLimit" :min="1" :max="10"
        /></el-form-item>
        <el-form-item label="模型轮数上限"
          ><el-input-number v-model="form.maxRounds" :min="1" :max="8"
        /></el-form-item>
        <el-form-item label="工具调用上限"
          ><el-input-number v-model="form.maxCalls" :min="1" :max="12"
        /></el-form-item>
        <el-form-item label="总时限（秒）"
          ><el-input-number v-model="form.timeoutSeconds" :min="30" :max="300" :step="30"
        /></el-form-item>
      </div>
      <div class="tool-note">
        <b>{{ form.mode === 'policy_test' ? '查询工具与受限测试入口' : '本次可用工具' }}</b>
        <p v-for="name in modeOptions?.tools || options.tools" :key="name">
          {{ agentTools[name] || name }}
        </p>
        <small v-if="form.mode === 'policy_test'"
          >导出和外发请求由后端拒绝。只有模型实际发起的请求才进入审计；未请求的动作不会补造记录。</small
        >
        <small v-else
          >检测会创建真实任务并调用模型；同一次运行最多提交一次检测，重复请求复用原编号。</small
        >
      </div>
      <el-button
        type="primary"
        :loading="busy"
        :disabled="
          !options?.canCreate ||
          running ||
          !form.prompt.trim() ||
          !form.modelId ||
          !form.datasetId ||
          !batchReady
        "
        @click="submit"
        >发起智能体任务</el-button
      >
      <p v-if="running" class="hint">当前有任务正在运行，结束或停止后可发起下一次。</p>
    </el-form>
  </PanelCard>
</template>
<style scoped>
.el-select {
  width: 100%;
}
.mode-description {
  margin-bottom: 18px;
}
.limits {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 10px;
}
.limits :deep(.el-input-number) {
  width: 100%;
}
.hint {
  font-size: 12px;
  color: #8a6540;
  line-height: 1.7;
}
.tool-note {
  background: #f4f8ff;
  border: 1px dashed #c9daf2;
  padding: 12px;
  margin-bottom: 18px;
  color: #476890;
  font-size: 13px;
  line-height: 1.6;
}
.tool-note p {
  margin: 4px 0;
}
.tool-note small {
  display: block;
  margin-top: 10px;
}
</style>
