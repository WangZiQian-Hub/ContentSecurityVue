<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import PanelCard from './PanelCard.vue'
import { clearLlmToken, getLlmToken, isGovernanceLlm, saveLlmToken } from '../api/governance-llm'
/* 模型服务访问令牌输入条。
   令牌是模型服务签发的凭证，业务登录令牌和上游模型 API Key 都不能替代（文档第 16 行）。
   令牌只存在 sessionStorage：刷新页面仍有效，关闭标签页后需要重新填写。
   原先只挂在数据治理页面，场景应用等直连页面也需要填写入口，因此移到公共组件目录。 */
const props = withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
const input = ref('')
const configured = ref(!!getLlmToken())
const emit = defineEmits<{ (event: 'saved'): void }>()

function save() {
  if (!input.value.trim()) return
  saveLlmToken(input.value)
  input.value = ''
  configured.value = true
  ElMessage.success('模型访问令牌已保存')
  emit('saved')
}
function clear() {
  clearLlmToken()
  input.value = ''
  configured.value = false
  ElMessage.success('模型访问令牌已清除')
}
</script>
<template>
  <PanelCard
    v-if="isGovernanceLlm"
    class="governance-token-panel"
    :class="{ compact: props.compact }"
    title="模型服务访问令牌"
    icon="Key"
  >
    <template #extra>
      <el-tag :type="configured ? 'success' : 'info'" effect="plain">{{
        configured ? '已配置' : '未配置'
      }}</el-tag>
    </template>
    <div class="governance-token-bar">
      <el-input v-model="input" type="password" autocomplete="off" placeholder="填写模型访问令牌" />
      <el-button type="primary" :disabled="!input.trim()" @click="save">保存</el-button>
      <el-button @click="clear">清除</el-button>
    </div>
    <p class="governance-token-hint">
      令牌只保存在当前浏览器标签页：刷新页面仍然有效，关闭标签页后需要重新填写。
    </p>
  </PanelCard>
</template>
<style scoped>
/* 面板内一行排布；输入框限宽，避免 el-input 默认 100% 宽度把按钮挤到下一行 */
.governance-token-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}
.governance-token-panel {
  margin-top: -30px;
  margin-bottom: 40px; /* 与下方 KPI 卡片的距离；净间距 ≈ 这个值 − 30px */
}
/* compact 用于非数据治理页面：不做负外边距，直接跟在内容流里。 */
.governance-token-panel.compact {
  margin-top: 0;
  margin-bottom: 15px;
}
.governance-token-bar .el-input {
  flex: none;
  width: 320px;
}
.governance-token-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #7d91b0;
}
</style>
