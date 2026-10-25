<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const form = reactive({ username: '', password: '' })
const busy = ref(false)

async function submit() {
  if (!form.username.trim() || !form.password) return void ElMessage.warning('请输入账号和密码')
  busy.value = true
  try {
    await auth.login(form.username.trim(), form.password)
    router.replace(String(route.query.redirect || '/dashboard'))
  } catch {
    // 请求层已弹出后端的中文错误；这里只清掉密码。
    form.password = ''
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="login-overlay">
    <form class="login-card" @submit.prevent="submit">
      <h1>内容安全治理原型平台</h1>
      <p class="login-sub">AI赋能安全治理 · 构建清朗数字空间</p>
      <label
        >账号<input v-model="form.username" autocomplete="username" maxlength="100" /></label
      >
      <label
        >密码<input
          v-model="form.password"
          type="password"
          autocomplete="current-password"
          maxlength="200"
      /></label>
      <button class="login-submit" type="submit" :disabled="busy">
        {{ busy ? '登录中…' : '登 录' }}
      </button>
      <p class="login-hint">
        演示账号：admin / admin123（操作权限）· auditor / auditor123（只读）；正式部署前必须修改全部初始口令。
      </p>
    </form>
  </div>
</template>

<style scoped>
.login-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #0b2a5b, #1256a3 55%, #0e7ac2);
}
.login-card {
  width: 380px;
  padding: 34px 36px 26px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 24px 60px rgba(4, 22, 48, 0.35);
}
.login-card h1 {
  margin: 0;
  color: #123c74;
  font-size: 22px;
}
.login-sub {
  margin: 6px 0 22px;
  color: #6b82a5;
  font-size: 13px;
}
.login-card label {
  display: block;
  margin-bottom: 14px;
  color: #1d3a66;
  font-size: 13px;
}
.login-card input {
  width: 100%;
  margin-top: 5px;
  padding: 10px 12px;
  border: 1px solid #c9d9ef;
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
}
.login-card input:focus {
  outline: none;
  border-color: #087bff;
}
.login-submit {
  width: 100%;
  margin-top: 8px;
  padding: 11px 0;
  border: none;
  border-radius: 8px;
  background: #087bff;
  color: #fff;
  font-size: 15px;
  cursor: pointer;
}
.login-submit:disabled {
  opacity: 0.6;
  cursor: default;
}
.login-hint {
  margin: 16px 0 0;
  color: #8aa0bf;
  font-size: 12px;
  line-height: 1.6;
}
</style>
