import { ReactNode } from 'react'
import { FlaskConical } from 'lucide-react'
import Sidebar from './Sidebar'
import { useAuth } from '../context/AuthContext'

export default function Layout({ children }: { children: ReactNode }) {
  const { demo, logout } = useAuth()
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {demo && (
          <div className="flex items-center justify-center gap-2 bg-cyber-amber/15 px-4 py-1.5 text-xs font-medium text-cyber-amber">
            <FlaskConical className="h-3.5 w-3.5" />
            Demo mode — sample data, no backend. Changes aren't saved.
            <button onClick={() => logout()} className="ml-2 underline hover:text-white">
              Exit
            </button>
          </div>
        )}
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
    </div>
  )
}
