import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { MailOpen, MousePointerClick, Send, Flag } from 'lucide-react'
import { campaignsApi, Campaign, CampaignStats } from '../api/campaigns'
import PageHeader from '../components/PageHeader'
import MetricCard from '../components/MetricCard'
import Spinner from '../components/Spinner'
import { apiError } from '../api/client'
import { formatPercent, formatDateShort } from '../lib/format'

interface Row {
  campaign: Campaign
  stats: CampaignStats
}

async function loadAll(): Promise<Row[]> {
  const campaigns = await campaignsApi.list()
  const withStats = await Promise.all(
    campaigns.map(async (c) => ({ campaign: c, stats: await campaignsApi.stats(c.id) })),
  )
  return withStats
}

export default function AnalyticsPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['analytics-overview'], queryFn: loadAll })
  const rows = data ?? []

  const totals = useMemo(() => {
    const sum = rows.reduce(
      (acc, r) => ({
        sent: acc.sent + r.stats.emails_sent,
        opened: acc.opened + r.stats.opened,
        clicked: acc.clicked + r.stats.clicked,
        submitted: acc.submitted + r.stats.credentials_submitted,
        reported: acc.reported + r.stats.reported,
      }),
      { sent: 0, opened: 0, clicked: 0, submitted: 0, reported: 0 },
    )
    const rate = (n: number) => (sum.sent ? n / sum.sent : null)
    return { ...sum, openRate: rate(sum.opened), clickRate: rate(sum.clicked), submitRate: rate(sum.submitted), reportRate: rate(sum.reported) }
  }, [rows])

  const comparison = useMemo(
    () =>
      rows
        .filter((r) => r.stats.emails_sent > 0)
        .map((r) => ({
          name: r.campaign.name.length > 16 ? `${r.campaign.name.slice(0, 16)}…` : r.campaign.name,
          click: Math.round(r.stats.click_rate * 100),
          report: Math.round((r.stats.reported / Math.max(1, r.stats.emails_sent)) * 100),
        })),
    [rows],
  )

  const trend = useMemo(
    () =>
      [...rows]
        .filter((r) => r.campaign.completed_at)
        .sort((a, b) => new Date(a.campaign.completed_at!).getTime() - new Date(b.campaign.completed_at!).getTime())
        .map((r) => ({
          label: formatDateShort(r.campaign.completed_at),
          click: Math.round(r.stats.click_rate * 100),
          report: Math.round((r.stats.reported / Math.max(1, r.stats.emails_sent)) * 100),
        })),
    [rows],
  )

  if (isLoading) return <Spinner full label="Loading analytics…" />
  if (error) return <div className="card text-cyber-red">{apiError(error, 'Failed to load analytics')}</div>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Organisation-wide outcomes across every campaign that has sent at least one email."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Open rate" value={formatPercent(totals.openRate)} detail={`${totals.opened} of ${totals.sent} emails`} icon={MailOpen} />
        <MetricCard label="Click rate" value={formatPercent(totals.clickRate)} detail={`${totals.clicked} interactions`} icon={MousePointerClick} tone="risk" />
        <MetricCard label="Submit rate" value={formatPercent(totals.submitRate)} detail={`${totals.submitted} submissions`} icon={Send} tone="risk" />
        <MetricCard label="Report rate" value={formatPercent(totals.reportRate)} detail={`${totals.reported} reports`} icon={Flag} tone="good" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-4 font-semibold text-foreground">Completion trend</h3>
          {trend.length > 1 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e6eb" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e3e6eb', borderRadius: 8 }} />
                <Line type="monotone" dataKey="click" stroke="#d97706" strokeWidth={2} name="Click %" />
                <Line type="monotone" dataKey="report" stroke="#0f766e" strokeWidth={2} name="Report %" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
              Not enough completed campaigns to plot a trend yet.
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="mb-4 font-semibold text-foreground">Campaign comparison</h3>
          {comparison.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={comparison}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3e6eb" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e3e6eb', borderRadius: 8 }} />
                <Bar dataKey="click" fill="#d97706" radius={[3, 3, 0, 0]} name="Click %" />
                <Bar dataKey="report" fill="#0f766e" radius={[3, 3, 0, 0]} name="Report %" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
              No campaigns with sent emails yet.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
