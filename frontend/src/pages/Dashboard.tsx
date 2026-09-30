import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Target as TargetIcon, Activity, AlertTriangle, Gauge, Plus, ArrowRight } from 'lucide-react'
import { campaignsApi, Campaign } from '../api/campaigns'
import StateBadge from '../components/StateBadge'
import Spinner from '../components/Spinner'
import { formatDateShort, formatScore } from '../lib/format'
import { apiError } from '../api/client'

const ACTIVE_STATES = new Set(['GENERATING', 'SCHEDULED', 'RUNNING', 'PAUSED'])

export default function Dashboard() {
  const { data: campaigns, isLoading, error } = useQuery({
    queryKey: ['campaigns'],
    queryFn: campaignsApi.list,
  })

  const stats = useMemo(() => {
    const list = campaigns ?? []
    const scored = list.filter((c) => c.ragas_score != null)
    const avg = scored.length
      ? scored.reduce((s, c) => s + (c.ragas_score ?? 0), 0) / scored.length
      : null
    return {
      total: list.length,
      active: list.filter((c) => ACTIVE_STATES.has(c.state)).length,
      escalated: list.filter((c) => c.state === 'ESCALATED').length,
      avgRagas: avg,
    }
  }, [campaigns])

  const recent = useMemo(
    () => [...(campaigns ?? [])].slice(0, 6),
    [campaigns],
  )

  if (isLoading) return <Spinner full label="Loading dashboard…" />
  if (error)
    return <div className="card text-cyber-red">{apiError(error, 'Failed to load campaigns')}</div>

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-slate-400">Your organisation's phishing-simulation overview</p>
        </div>
        <Link to="/campaigns" className="btn-primary">
          <Plus className="h-4 w-4" /> New campaign
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={TargetIcon} label="Total campaigns" value={stats.total} tone="blue" />
        <StatCard icon={Activity} label="Active" value={stats.active} tone="green" />
        <StatCard icon={AlertTriangle} label="Escalated" value={stats.escalated} tone="red" />
        <StatCard
          icon={Gauge}
          label="Avg RAGAS"
          value={stats.avgRagas != null ? formatScore(stats.avgRagas) : '—'}
          tone="cyan"
        />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Recent campaigns</h2>
          <Link to="/campaigns" className="flex items-center gap-1 text-sm text-cyber-cyan hover:underline">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {recent.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="card overflow-hidden p-0">
            <table className="w-full">
              <thead>
                <tr className="bg-navy-950/40">
                  <th className="table-th">Campaign</th>
                  <th className="table-th">State</th>
                  <th className="table-th">RAGAS</th>
                  <th className="table-th">Created</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((c) => (
                  <RecentRow key={c.id} c={c} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof TargetIcon
  label: string
  value: number | string
  tone: 'blue' | 'green' | 'red' | 'cyan'
}) {
  const tones = {
    blue: 'text-cyber-blue bg-cyber-blue/10',
    green: 'text-cyber-green bg-cyber-green/10',
    red: 'text-cyber-red bg-cyber-red/10',
    cyan: 'text-cyber-cyan bg-cyber-cyan/10',
  }
  return (
    <div className="stat-card">
      <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  )
}

function RecentRow({ c }: { c: Campaign }) {
  return (
    <tr className="transition-colors hover:bg-navy-800/40">
      <td className="table-td">
        <Link to={`/campaigns/${c.id}`} className="font-medium text-white hover:text-cyber-cyan">
          {c.name}
        </Link>
        {c.target_department && (
          <span className="ml-2 text-xs text-slate-500">{c.target_department}</span>
        )}
      </td>
      <td className="table-td"><StateBadge state={c.state} /></td>
      <td className="table-td font-mono">{formatScore(c.ragas_score)}</td>
      <td className="table-td text-slate-400">{formatDateShort(c.created_at)}</td>
    </tr>
  )
}

function EmptyState() {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 py-14 text-center">
      <TargetIcon className="h-10 w-10 text-slate-600" />
      <div>
        <p className="font-medium text-white">No campaigns yet</p>
        <p className="text-sm text-slate-500">Create your first phishing-simulation campaign.</p>
      </div>
      <Link to="/campaigns" className="btn-primary">
        <Plus className="h-4 w-4" /> New campaign
      </Link>
    </div>
  )
}
