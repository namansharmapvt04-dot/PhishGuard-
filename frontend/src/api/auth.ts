import { api, tokenStore } from './client'

export interface Organization {
  id: string
  name: string
  domain: string
  is_active: boolean
}

export interface User {
  id: string
  email: string
  full_name: string
  role: string
  is_active: boolean
  organization: Organization
}

export interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface RegisterPayload {
  email: string
  password: string
  full_name: string
  organization: { name: string; domain: string }
}

export const authApi = {
  async login(email: string, password: string): Promise<TokenPair> {
    const { data } = await api.post<TokenPair>('/auth/login', { email, password })
    tokenStore.set(data.access_token, data.refresh_token)
    return data
  },

  async register(payload: RegisterPayload): Promise<User> {
    const { data } = await api.post<User>('/auth/register', payload)
    return data
  },

  async me(): Promise<User> {
    const { data } = await api.get<User>('/auth/me')
    return data
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout')
    } finally {
      tokenStore.clear()
    }
  },
}
