<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { clearLlmToken, getLlmToken, isGovernanceLlm, saveLlmToken } from '../../../api/governance-llm'
const input = ref('')
const configured = computed(() => !!getLlmToken())
function save() {
  if (!input.value.trim()) return
  saveLlmToken(input.value)
  input.value = ''
  ElMessage.success('模型访问令牌已保存')
}
function clear() {
  clearLlmToken()
  input.value = ''
  ElMessage.success('模型访问令牌已清除')
}
</script>
<template>
  <div v-if="isGovernanceLlm" class="governance-token-bar">
    <el-input v-model="input" type="password" autocomplete="off" placeholder="填写模型访问令牌" />
    <el-button type="primary" :disabled="!input.trim()" @click="save">保存</el-button>
    <el-button @click="clear">清除</el-button>
    <el-tag :type="configured ? 'success' : 'info'">{{ configured ? '已配置' : '未配置' }}</el-tag>
  </div>
</template>
