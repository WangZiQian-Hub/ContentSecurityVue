<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  isGovernanceLlm,
  llmTokenConfigured,
  llmTokenInvalid,
  saveLlmToken,
} from '../api/governance-llm'
/* 模型服务访问令牌状态胶囊。
   令牌由模型服务签发，业务登录令牌和上游模型 API Key 都不能替代。
   常态只显示一枚状态胶囊（不占独立一行、不显示输入框），点击它才弹出输入框。
   令牌失效（模型服务返回 401/403）时胶囊变红，提示需要重新填写；
   保存成功后触发 saved 事件，由所在页面自行重新加载数据。 */
const emit = defineEmits<{ (event: 'saved'): void }>()
const open = ref(false)
const input = ref('')
const state = computed(() => {
  if (!llmTokenConfigured.value) return 'missing'
  return llmTokenInvalid.value ? 'invalid' : 'ready'
})
const tagType = computed(() =>
  state.value === 'ready' ? 'success' : state.value === 'invalid' ? 'danger' : 'info',
)
const label = computed(() =>
  state.value === 'ready' ? '令牌已配置' : state.value === 'invalid' ? '令牌已失效' : '令牌未配置',
)
function save() {
  if (!input.value.trim()) return
  saveLlmToken(input.value)
  input.value = ''
  open.value = false
  ElMessage.success('模型访问令牌已保存')
  emit('saved')
}
</script>
<template>
  <span v-if="isGovernanceLlm" class="governance-token-capsule">
    <el-popover
      v-model:visible="open"
      trigger="click"
      placement="bottom-end"
      :width="330"
      popper-class="governance-token-popper"
    >
      <template #reference>
        <el-tag class="governance-token-tag" :type="tagType" effect="plain" round>
          <span class="governance-token-dot" aria-hidden="true">●</span>{{ label }}
        </el-tag>
      </template>
      <div class="governance-token-form">
        <el-input
          v-model="input"
          type="password"
          autocomplete="off"
          placeholder="填写模型访问令牌"
          @keyup.enter="save"
        />
        <el-button type="primary" :disabled="!input.trim()" @click="save">保存</el-button>
      </div>
      <p class="governance-token-tip">保存后当前页面会自动重新加载数据。</p>
    </el-popover>
  </span>
</template>
<style scoped>
.governance-token-tag {
  cursor: pointer;
  white-space: nowrap;
}
.governance-token-dot {
  margin-right: 4px;
  font-size: 10px;
  vertical-align: 1px;
}
.governance-token-form {
  display: flex;
  align-items: center;
  gap: 8px;
}
.governance-token-tip {
  margin: 8px 0 0;
  font-size: 12px;
  color: #7d91b0;
}
</style>
