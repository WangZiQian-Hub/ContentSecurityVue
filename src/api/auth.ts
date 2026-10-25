import { request } from './request'

export interface AuthUser {
  username: string
  displayName: string
  role: string
  // reader：只读账号，写操作由后端统一拦截；operator：可操作。
  tier: 'reader' | 'operator'
}

export async function login(username: string, password: string): Promise<{ token: string; user: AuthUser }> {
  return request<{ token: string; user: AuthUser }>({
    url: '/auth/login',
    method: 'POST',
    data: { username, password },
  })
}
