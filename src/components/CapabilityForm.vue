<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePlatformStore } from '../stores/platform'
import { getTaskCategory } from '../utils/enums'
import type { Task } from '../types'
const props = withDefaults(
  defineProps<{
    capability?: string
    title?: string
    textInput?: boolean
    scenarioCode?: string
  }>(),
  {
    capability: 'anomaly_detect',
    title: '开始处理',
    textInput: false,
    scenarioCode: 'public_opinion',
  },
)
const store = usePlatformStore()
const content = ref(
  props.capability === 'data_ingest' ? '新建业务语料数据集' : '今天天气很好，适合出去旅游。',
)
const datasetId = ref(1)
const modelId = ref(1)
const threshold = ref(0.7)
const result = ref<Task>()
const error = ref('')
const canRun = computed(() => !props.textInput || content.value.trim().length > 0)
async function handleSubmit() {
  error.value = ''
  const input: Record<string, unknown> = { datasetId: datasetId.value }
  if (props.capability === 'model_risk_governance')
    Object.assign(input, {
      modelId: modelId.value,
      prompt: content.value,
      params: { temp: threshold.value, maxLen: 1024 },
    })
  else if (props.capability === 'evaluation')
    Object.assign(input, { modelId: modelId.value, metricCodes: ['data_accuracy', 'risk_recall'] })
  else if (props.capability === 'scenario_governance')
    Object.assign(input, {
      scenarioCode: props.scenarioCode || 'public_opinion',
      content: content.value,
    })
  else if (props.capability === 'data_ingest')
    Object.assign(input, { datasetName: content.value, sourceType: 'business', languages: ['zh'] })
  else if (props.capability === 'training_monitor')
    Object.assign(input, { trainingTaskId: 'demo-training-001' })
  else if (props.capability === 'semantic_risk')
    Object.assign(input, { content: content.value, language: 'zh' })
  else Object.assign(input, { threshold: threshold.value })
  try {
    result.value = await store.runTask({
      capabilityCode: props.capability,
      name: props.title,
      taskCategory: getTaskCategory(props.capability),
      input,
    })
  } catch {
    error.value = '调用失败，请检查接口配置后重试。'
  }
}
</script>
<template>
  <el-form label-position="top" @submit.prevent="handleSubmit"
    ><el-form-item v-if="capability === 'model_risk_governance'" label="选择模型"
      ><el-select v-model="modelId"
        ><el-option label="内容安全识别模型 v2.0.1" :value="1" /><el-option
          label="多模态审核模型 v1.3.0"
          :value="2" /></el-select></el-form-item
    ><el-form-item v-else label="选择数据集"
      ><el-select v-model="datasetId"
        ><el-option label="内容安全多模态数据集" :value="1" /><el-option
          label="跨文化交流高价值语料"
          :value="2" /></el-select></el-form-item
    ><el-form-item
      v-if="textInput"
      :label="capability === 'data_ingest' ? '数据集名称' : '输入内容'"
      ><el-input
        v-model="content"
        type="textarea"
        :rows="4"
        maxlength="2000"
        show-word-limit /></el-form-item
    ><template v-else
      ><el-form-item label="数据类型"
        ><el-select v-model="modelId"
          ><el-option label="全部类型" :value="1" /><el-option
            label="文本数据"
            :value="2" /></el-select></el-form-item
      ><el-form-item label="识别阈值"
        ><el-slider v-model="threshold" :min="0" :max="1" :step="0.05" /></el-form-item></template
    ><el-button
      class="full-width"
      type="primary"
      :loading="store.isBusy"
      :disabled="!canRun"
      native-type="submit"
      >{{ title }}</el-button
    ></el-form
  ><el-alert v-if="error" :title="error" type="error" :closable="false" />
  <div v-if="result" class="result-box">
    <b>✓ {{ result.result?.isMock ? '模拟调用完成' : '调用完成' }}</b>
    <p>{{ result.result?.summary || result.status }}</p>
    <details>
      <summary>查看接口返回结果</summary>
      <pre>{{ result }}</pre>
    </details>
  </div>
</template>
