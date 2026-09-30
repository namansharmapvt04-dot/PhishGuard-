import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

// All versioned endpoints live under /api/v1; the dev server proxies /api → backend.
export const API_PREFIX = '/api/v1'

const ACCESS_KEY = 'pg_access_token'
const REFRESH_KEY = 'pg_refresh_token'

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY)
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY)
  },
  set(access: string, refresh?: string) {
    localStorage.setItem(ACCESS_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

export const api = axios.create({
  baseURL: API_PREFIX,
  headers: { 'Content-Type': 'application/json' },
})

// ── Attach Bearer token ───────────────────────────────────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.access
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Refresh-on-401 (single-flight) ────────────────────────────────────────────
let refreshing: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refresh = tokenStore.refresh
  if (!refresh) return null
  try {
    // Bare axios call so we don't recurse through this interceptor.
    const { data } = await axios.post(`${API_PREFIX}/auth/refresh`, {
      refresh_token: refresh,
    })
    tokenStore.set(data.access_token)
    return data.access_token as string
  } catch {
    tokenStore.clear()
    return null
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean }
    const status = error.response?.status

    if (status === 401 && original && !original._retried && tokenStore.refresh) {
      original._retried = true
      refreshing = refreshing ?? refreshAccessToken()
      const newToken = await refreshing
      refreshing = null

      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      }
      // Refresh failed → bounce to login
      tokenStore.clear()
      if (!location.pathname.startsWith('/login')) {
        location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

/** Extracts a human-readable message from a FastAPI error response. */
export function apiError(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail.length) {
      const first = detail[0] as { msg?: string; loc?: string[] }
      return first.msg ? `${first.loc?.slice(-1)[0] ?? ''} ${first.msg}`.trim() : fallback
    }
    if (err.code === 'ERR_NETWORK') return 'Cannot reach the server. Is the backend running?'
  }
  return fallback
}
