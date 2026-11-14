<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { agentApi } from '../../../../api/internal-agent'
import type { AgentBatch } from '../../../../types/internal-agent'
const props = defineProps<{ modelValue: string; disabled: boolean; refreshKey?: number }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()
const rows = ref<AgentBatch[]>([]),
  selected = ref<AgentBatch>(),
  loading = ref(false),
  error = ref('')
const page = ref(1),
  totalPages = ref(0),
  search = ref('')
const items = computed(() => [
  ...new Map(
    [...(selected.value ? [selected.value] : []), ...rows.value].map((b) => [b.batchId, b]),
  ).values(),
])
let version = 0,
  controller: AbortController | undefined
async function load(q = search.value, nextPage = 1) {
  controller?.abort()
  controller = new AbortController()
  const signal = controller.signal,
    current = ++version
  loading.value = true
  error.value = ''
  search.value = q
  try {
    const result = await agentApi.batches(q, nextPage, signal)
    if (current !== version) return
    rows.value = nextPage > 1 ? [...rows.value, ...result.items] : result.items
    page.value = result.page
    totalPages.value = result.totalPages
    const currentBatch = result.items.find((b) => b.batchId === props.modelValue)
    if (currentBatch) selected.value = currentBatch
  } catch (e) {
    if (current === version && !signal.aborted) {
      error.value =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (e instanceof Error ? e.message : '批次加载失败，请重试')
    }
  } finally {
    if (current === version) loading.value = false
  }
}
function choose(id: string) {
  selected.value = items.value.find((b) => b.batchId === id)
  emit('update:modelValue', id || '')
}
function searchBatches(q: string) {
  void load(q)
}
watch(
  () => props.modelValue,
  (id) => {
    if (!id) selected.value = undefined
  },
)
watch(
  () => props.refreshKey,
  () => void load(),
)
onMounted(() => void load())
onUnmounted(() => {
  version++
  controller?.abort()
})
</script>
<template>
  <div class="agent-batch-select">
    <el-select
      :model-value="modelValue"
      :disabled="disabled"
      :loading="loading"
      filterable
      remote
      clearable
      :remote-method="searchBatches"
      placeholder="选择或搜索批次"
      aria-label="选择已有批次"
      @update:model-value="choose"
    >
      <el-option
        v-for="batch in items"
        :key="`${batch.batchId}:${batch.traceCount}:${batch.name}`"
        :value="batch.batchId"
        :label="`${batch.name}（${batch.displayId}）· ${batch.traceCount} 条轨迹`"
      />
      <template #empty
        ><div class="batch-empty">
          {{
            loading
              ? '正在加载…'
              : error
                ? '批次加载失败，请重试'
                : search
                  ? '没有找到符合条件的批次'
                  : '还没有可加入的批次，请先新建'
          }}
        </div></template
      >
      <template v-if="page < totalPages" #footer
        ><el-button link type="primary" :loading="loading" @click="load(search, page + 1)"
          >加载更多批次</el-button
        ></template
      >
    </el-select>
    <p v-if="error" class="batch-error" role="alert">
      {{ error }} <el-button link type="primary" @click="load()">重试</el-button>
    </p>
    <small>可加入自己创建的内部智能体批次，任务结束后会自动加入轨迹。</small>
  </div>
</template>
<style scoped>
.agent-batch-select,
.el-select {
  width: 100%;
}
.agent-batch-select small {
  display: block;
  color: #6c7e96;
  font-size: 12px;
  line-height: 1.6;
  margin-top: 6px;
}
.batch-error {
  color: #ce3b42;
  font-size: 12px;
  margin: 6px 0;
}
.batch-empty {
  padding: 12px;
  text-align: center;
  color: #75849b;
  font-size: 13px;
}
</style>
