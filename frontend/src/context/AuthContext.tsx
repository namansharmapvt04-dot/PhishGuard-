import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { authApi, User, RegisterPayload } from '../api/auth'
import { tokenStore } from '../api/client'
import { isDemo, enableDemo, disableDemo, demoUser } from '../lib/demo'

interface AuthContextValue {
  user: User | null
  loading: boolean
  isAuthenticated: boolean
  demo: boolean
  login: (email: string, password: string) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  logout: () => Promise<void>
  enterDemo: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // On mount, if a token exists, resolve the current user.
  useEffect(() => {
    let active = true
    async function bootstrap() {
      if (isDemo()) {
        setUser(demoUser)
        setLoading(false)
        return
      }
      if (!tokenStore.access) {
        setLoading(false)
        return
      }
      try {
        const me = await authApi.me()
        if (active) setUser(me)
      } catch {
        tokenStore.clear()
      } finally {
        if (active) setLoading(false)
      }
    }
    bootstrap()
    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    await authApi.login(email, password)
    setUser(await authApi.me())
  }, [])

  const register = useCallback(async (payload: RegisterPayload) => {
    await authApi.register(payload)
    // Backend returns the user but no tokens on register → log in right after.
    await authApi.login(payload.email, payload.password)
    setUser(await authApi.me())
  }, [])

  const logout = useCallback(async () => {
    if (isDemo()) {
      disableDemo()
      setUser(null)
      return
    }
    await authApi.logout()
    setUser(null)
  }, [])

  const enterDemo = useCallback(() => {
    enableDemo()
    setUser(demoUser)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        demo: isDemo(),
        login,
        register,
        logout,
        enterDemo,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
