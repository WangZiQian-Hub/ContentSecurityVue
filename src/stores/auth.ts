import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { login as apiLogin, type AuthUser } from '../api/auth'

const TOKEN_KEY = 'accessToken'
const USER_KEY = 'authUser'

function readStoredUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(readStoredUser())
  const loggedIn = ref(Boolean(sessionStorage.getItem(TOKEN_KEY)))
  const isReader = computed(() => user.value?.tier === 'reader')

  async function login(username: string, password: string) {
    const result = await apiLogin(username, password)
    sessionStorage.setItem(TOKEN_KEY, result.token)
    sessionStorage.setItem(USER_KEY, JSON.stringify(result.user))
    user.value = result.user
    loggedIn.value = true
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(USER_KEY)
    user.value = null
    loggedIn.value = false
  }

  return { user, loggedIn, isReader, login, logout }
})
