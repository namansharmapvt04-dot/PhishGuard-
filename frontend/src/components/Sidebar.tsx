import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Target, Shield, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { initials } from '../lib/format'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/campaigns', label: 'Campaigns', icon: Target },
]

export default function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-navy-800 bg-navy-900/60 backdrop-blur-sm">
      <div className="flex items-center gap-2 px-6 py-5">
        <Shield className="h-7 w-7 text-cyber-blue" />
        <div>
          <div className="text-lg font-bold leading-none text-white">PhishGuard</div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500">
            Security Awareness
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-cyber-blue/15 text-cyber-blue'
                  : 'text-slate-400 hover:bg-navy-800/60 hover:text-white'
              }`
            }
          >
            <Icon className="h-4.5 w-4.5" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-navy-800 p-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cyber-blue/20 text-sm font-semibold text-cyber-blue">
            {user ? initials(user.full_name) : '?'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{user?.full_name}</div>
            <div className="truncate text-xs text-slate-500">{user?.organization?.name}</div>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-navy-800/60 hover:text-cyber-red"
        >
          <LogOut className="h-4.5 w-4.5" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
