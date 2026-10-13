import { ReactNode } from 'react'
import { FlaskConical, Search } from 'lucide-react'
import Sidebar from './Sidebar'
import { useAuth } from '../context/AuthContext'
import { initials } from '../lib/format'

export default function Layout({ children }: { children: ReactNode }) {
  const { user, demo, logout } = useAuth()
  return (
    <div className="flex h-screen overflow-hidden bg-navy-950">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-navy-700 bg-navy-900 px-6">
          <div className="hidden w-64 items-center gap-2 rounded-lg border border-navy-700 bg-navy-950 px-3 py-2 text-sm text-muted-foreground md:flex">
            <Search className="h-4 w-4" />
            <span>Search workspace</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyber-blue/10 text-xs font-semibold text-cyber-blue">
              {user ? initials(user.full_name) : '?'}
            </div>
            <div className="hidden text-left sm:block">
              <div className="text-sm font-medium text-foreground">{user?.full_name}</div>
              <div className="text-xs text-muted-foreground">{user?.role}</div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          {demo && (
            <div className="flex items-center justify-center gap-2 bg-cyber-amber/15 px-4 py-1.5 text-xs font-medium text-cyber-amber">
              <FlaskConical className="h-3.5 w-3.5" />
              Demo mode — sample data, no backend. Changes aren't saved.
              <button onClick={() => logout()} className="ml-2 underline hover:text-foreground">
                Exit
              </button>
            </div>
          )}
          <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
