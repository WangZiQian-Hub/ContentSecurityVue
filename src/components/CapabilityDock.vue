<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { CAPABILITIES } from '../api/capability'
import { usePlatformStore } from '../stores/platform'
import { isMock } from '../api/request'
import { getTaskCategory } from '../utils/enums'
import PanelCard from './PanelCard.vue'
import type { Task } from '../types'
const route = useRoute()
const store = usePlatformStore()
const isOpen = ref(false)
const selected = ref(CAPABILITIES[0]!)
const payload = ref('')
const result = ref<Task>()
const error = ref('')
const actions = computed(() =>
  CAPABILITIES.filter((item) => {
    if (route.path.startsWith('/model-training')) return item.code === 'training_monitor'
    return item.route.split('/')[1] === route.path.split('/')[1]
  }),
)
function openAction(item: (typeof CAPABILITIES)[number]) {
  selected.value = item
  payload.value = JSON.stringify(item.input, null, 2)
  result.value = undefined
  error.value = ''
  isOpen.value = true
}
async function runAction() {
  error.value = ''
  try {
    const input: unknown = JSON.parse(payload.value)
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      error.value = '输入必须为 JSON 对象'
      return
    }
    result.value = await store.runTask({
      capabilityCode: selected.value.code,
      name: selected.value.label,
      taskCategory: getTaskCategory(selected.value.code),
      input: input as Record<string, unknown>,
    })
  } catch (exception) {
    error.value =
      exception instanceof SyntaxError
        ? 'JSON 格式不正确，请检查输入。'
        : '调用失败，请检查输入与后端配置。'
  }
}
</script>
<template>
  <PanelCard v-if="actions.length" title="业务能力入口" icon="Connection"
    ><div class="capability-actions">
      <el-button
        v-for="action in actions"
        :key="action.code"
        plain
        type="primary"
        @click="openAction(action)"
        >{{ action.label }}</el-button
      >
    </div></PanelCard
  ><el-drawer v-model="isOpen" :title="selected.label" size="540px"
    ><el-alert
      v-if="isMock"
      title="原型演示：此入口返回模拟结果，不会调用真实算法。"
      type="info"
      :closable="false"
    />
    <p class="action-help">此入口已预留调用函数，可通过输入参数联调对应业务能力。</p>
    <details open>
      <summary>高级参数（JSON）</summary>
      <el-input v-model="payload" type="textarea" :rows="12" aria-label="能力输入参数" />
    </details>
    <el-button class="action-submit" type="primary" :loading="store.isBusy" @click="runAction">{{
      isMock ? '模拟执行' : '执行任务'
    }}</el-button
    ><el-alert v-if="error" :title="error" type="error" :closable="false" />
    <pre v-if="result" class="result-box">{{ result }}</pre>
  </el-drawer>
</template>
