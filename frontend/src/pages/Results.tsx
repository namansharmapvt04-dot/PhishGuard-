import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
} from 'recharts'
import { ArrowLeft, Download, ShieldAlert, GraduationCap, Info } from 'lucide-react'
import { campaignsApi } from '../api/campaigns'
import { targetsApi, TargetActivity } from '../api/targets'
import Spinner from '../components/Spinner'
import { apiError } from '../api/client'
import { formatDate, formatPercent } from '../lib/format'

const OUTCOME_COLORS = {
  opened: '#06b6d4',
  clicked: '#f59e0b',
  submitted: '#ef4444',
  reported: '#10b981',
  none: '#475569',
}

const RISK_BADGE: Record<string, string> = {
  low: 'badge-green',
  medium: 'badge-amber',
  high: 'badge-red',
  critical: 'badge-red',
}

export default function Results() {
  const { id = '' } = useParams()

  const campaignQ = useQuery({ queryKey: ['campaign', id], queryFn: () => campaignsApi.get(id) })
  const statsQ = useQuery({ queryKey: ['stats', id], queryFn: () => campaignsApi.stats(id) })
  const activityQ = useQuery({
    queryKey: ['activity', id],
    queryFn: () => targetsApi.activity(id),
  })

  const outcomeData = useMemo(() => {
    const s = statsQ.data
    const acts = activityQ.data ?? []
    const interacted = acts.filter(
      (a) => a.opened || a.clicked || a.credentials_submitted || a.reported,
    ).length
    const total = s?.total_targets ?? acts.length
    return [
      { name: 'Opened', value: s?.opened ?? 0, key: 'opened' },
      { name: 'Clicked', value: s?.clicked ?? 0, key: 'clicked' },
      { name: 'Submitted', value: s?.credentials_submitted ?? 0, key: 'submitted' },
      { name: 'Reported', value: s?.reported ?? 0, key: 'reported' },
      { name: 'No interaction', value: Math.max(0, total - interacted), key: 'none' },
    ]
  }, [statsQ.data, activityQ.data])

  const timeline = useMemo(() => buildTimeline(activityQ.data ?? []), [activityQ.data])

  if (campaignQ.isLoading || statsQ.isLoading) return <Spinner full label="Loading results…" />
  if (campaignQ.error || !campaignQ.data)
    return <div className="card text-cyber-red">{apiError(campaignQ.error, 'Not found')}</div>

  const campaign = campaignQ.data
  const stats = statsQ.data
  const meta = campaign.agent_metadata
  const risk = meta?.risk_level

  return (
    <div className="space-y-6">
      <Link
        to={`/campaigns/${id}`}
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Back to campaign
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{campaign.name} — Results</h1>
          <p className="text-sm text-slate-400">Completed {formatDate(campaign.completed_at)}</p>
        </div>
        <button
          className="btn-ghost"
          onClick={() => exportCsv(campaign.name, activityQ.data ?? [])}
          disabled={!activityQ.data?.length}
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </header>

      {/* Rate tiles */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Emails sent" value={String(stats?.emails_sent ?? 0)} />
        <Tile label="Open rate" value={formatPercent(stats?.open_rate)} tone="cyan" />
        <Tile label="Click rate" value={formatPercent(stats?.click_rate)} tone="amber" />
        <Tile label="Compromise rate" value={formatPercent(stats?.compromise_rate)} tone="red" />
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-4 font-semibold text-white">Outcomes by target</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={outcomeData} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#162d57" />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  background: '#0a1628',
                  border: '1px solid #162d57',
                  borderRadius: 8,
                  color: '#e2e8f0',
                }}
                cursor={{ fill: 'rgba(59,130,246,0.08)' }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {outcomeData.map((d) => (
                  <Cell key={d.key} fill={OUTCOME_COLORS[d.key as keyof typeof OUTCOME_COLORS]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="mb-4 font-semibold text-white">First interactions over time</h3>
          {timeline.length > 1 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={timeline} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#162d57" />
                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    background: '#0a1628',
                    border: '1px solid #162d57',
                    borderRadius: 8,
                    color: '#e2e8f0',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#3b82f6' }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[280px] items-center justify-center text-sm text-slate-500">
              Not enough time-series data to plot.
            </div>
          )}
        </div>
      </section>

      {/* Insight analyst output (only present once post-campaign analysis is wired to the API) */}
      {risk ? (
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="card">
            <div className="mb-3 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-cyber-red" />
              <h3 className="font-semibold text-white">Risk assessment</h3>
              <span className={`${RISK_BADGE[risk] ?? 'badge-gray'} ml-auto capitalize`}>{risk}</span>
            </div>
            {meta?.vulnerability_summary && (
              <p className="mb-3 text-sm text-slate-300">{meta.vulnerability_summary}</p>
            )}
            {meta?.top_vulnerabilities?.length ? (
              <ul className="list-inside list-disc space-y-1 text-sm text-slate-400">
                {meta.top_vulnerabilities.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="card">
            <div className="mb-3 flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-cyber-cyan" />
              <h3 className="font-semibold text-white">Recommended training</h3>
            </div>
            {meta?.recommended_training?.length ? (
              <ul className="space-y-2">
                {meta.recommended_training.map((t, i) => (
                  <li key={i} className="rounded-lg border border-navy-700 bg-navy-950/40 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">{t.topic}</span>
                      <span className="badge-gray capitalize">{t.priority}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{t.rationale}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No recommendations available.</p>
            )}
          </div>
        </section>
      ) : (
        <div className="card flex items-center gap-2 text-sm text-slate-400">
          <Info className="h-4 w-4 shrink-0 text-slate-500" />
          Insight-analyst report not available for this campaign yet.
        </div>
      )}

      {/* Per-target activity */}
      <section className="card overflow-hidden p-0">
        <div className="border-b border-navy-800 px-4 py-3">
          <h3 className="font-semibold text-white">Target activity</h3>
        </div>
        {activityQ.isLoading ? (
          <div className="p-6">
            <Spinner label="Loading activity…" />
          </div>
        ) : (activityQ.data?.length ?? 0) === 0 ? (
          <div className="p-10 text-center text-slate-500">No tracking activity recorded.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-navy-950/40">
                <th className="table-th">Target</th>
                <th className="table-th text-center">Opened</th>
                <th className="table-th text-center">Clicked</th>
                <th className="table-th text-center">Submitted</th>
                <th className="table-th text-center">Reported</th>
                <th className="table-th">First event</th>
              </tr>
            </thead>
            <tbody>
              {activityQ.data!.map((a) => (
                <tr key={a.target_id} className="hover:bg-navy-800/40">
                  <td className="table-td">
                    <div className="font-medium text-white">{a.full_name}</div>
                    <div className="text-xs text-slate-500">{a.email}</div>
                  </td>
                  <Check on={a.opened} />
                  <Check on={a.clicked} />
                  <Check on={a.credentials_submitted} danger />
                  <Check on={a.reported} good />
                  <td className="table-td text-slate-400">{formatDate(a.first_event_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function Tile({
  label,
  value,
  tone = 'blue',
}: {
  label: string
  value: string
  tone?: 'blue' | 'cyan' | 'amber' | 'red'
}) {
  const color = {
    blue: 'text-white',
    cyan: 'text-cyber-cyan',
    amber: 'text-cyber-amber',
    red: 'text-cyber-red',
  }[tone]
  return (
    <div className="stat-card">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  )
}

function Check({ on, good, danger }: { on: boolean; good?: boolean; danger?: boolean }) {
  const color = on ? (danger ? 'text-cyber-red' : good ? 'text-cyber-green' : 'text-cyber-amber') : 'text-slate-600'
  return <td className={`table-td text-center font-semibold ${color}`}>{on ? '✓' : '—'}</td>
}

function buildTimeline(acts: TargetActivity[]): { label: string; cumulative: number }[] {
  const times = acts
    .map((a) => a.first_event_at)
    .filter((t): t is string => !!t)
    .map((t) => new Date(t).getTime())
    .sort((a, b) => a - b)
  if (times.length < 2) return []

  let count = 0
  return times.map((t) => {
    count += 1
    return {
      label: new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      cumulative: count,
    }
  })
}

function exportCsv(campaignName: string, acts: TargetActivity[]) {
  const header = ['email', 'full_name', 'opened', 'clicked', 'credentials_submitted', 'reported', 'first_event_at']
  const rows = acts.map((a) =>
    [
      a.email,
      a.full_name,
      a.opened,
      a.clicked,
      a.credentials_submitted,
      a.reported,
      a.first_event_at ?? '',
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  )
  const csv = [header.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${campaignName.replace(/\s+/g, '_')}_results.csv`
  a.click()
  URL.revokeObjectURL(url)
}
