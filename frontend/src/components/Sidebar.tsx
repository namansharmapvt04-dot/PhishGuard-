import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Target, Users, BarChart3, Bot, Shield, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { initials } from '../lib/format'

const NAV = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/campaigns', label: 'Campaigns', icon: Target },
  { to: '/targets', label: 'Targets', icon: Users },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/insights', label: 'AI Insights', icon: Bot },
]

export default function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <div className="font-display text-lg font-semibold leading-none">PhishGuard</div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-sidebar-foreground/55">
            AI Simulation Platform
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-sidebar-accent text-white'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white'
              }`
            }
          >
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-md bg-sidebar-accent/60 px-2.5 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
            {user ? initials(user.full_name) : '?'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{user?.full_name}</div>
            <div className="truncate text-xs text-sidebar-foreground/50">{user?.organization?.name}</div>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
