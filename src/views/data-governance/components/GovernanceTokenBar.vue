<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import PanelCard from '../../../components/PanelCard.vue'
import {
  clearLlmToken,
  getLlmToken,
  isGovernanceLlm,
  saveLlmToken,
} from '../../../api/governance-llm'
// 令牌存在 sessionStorage 里，读取结果不是响应式的；用本地状态记录，保存或清除后右上角标签立即更新。
const input = ref('')
const configured = ref(!!getLlmToken())
function save() {
  if (!input.value.trim()) return
  saveLlmToken(input.value)
  input.value = ''
  configured.value = true
  ElMessage.success('模型访问令牌已保存')
}
function clear() {
  clearLlmToken()
  input.value = ''
  configured.value = false
  ElMessage.success('模型访问令牌已清除')
}
</script>
<template>
  <PanelCard v-if="isGovernanceLlm" class="governance-token-panel" title="模型服务访问令牌" icon="Key">
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
