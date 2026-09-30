import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BarChart3 } from 'lucide-react'
import { campaignsApi } from '../api/campaigns'
import StateBadge from '../components/StateBadge'
import Spinner from '../components/Spinner'
import { apiError } from '../api/client'
import OverviewTab from '../features/campaign/OverviewTab'
import TargetsTab from '../features/campaign/TargetsTab'
import GenerateTab from '../features/campaign/GenerateTab'
import EmailPreviewTab from '../features/campaign/EmailPreviewTab'
import ActionsTab from '../features/campaign/ActionsTab'

type TabKey = 'overview' | 'targets' | 'generate' | 'preview' | 'actions'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'targets', label: 'Targets' },
  { key: 'generate', label: 'Generate' },
  { key: 'preview', label: 'Email Preview' },
  { key: 'actions', label: 'Actions' },
]

export default function CampaignDetail() {
  const { id = '' } = useParams()
  const [tab, setTab] = useState<TabKey>('overview')

  const { data: campaign, isLoading, error } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => campaignsApi.get(id),
    enabled: !!id,
  })

  if (isLoading) return <Spinner full label="Loading campaign…" />
  if (error || !campaign)
    return (
      <div className="card text-cyber-red">{apiError(error, 'Campaign not found')}</div>
    )

  return (
    <div className="space-y-6">
      <Link
        to="/campaigns"
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Campaigns
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">{campaign.name}</h1>
          <StateBadge state={campaign.state} />
        </div>
        {campaign.state === 'DONE' && (
          <Link to={`/campaigns/${campaign.id}/results`} className="btn-ghost">
            <BarChart3 className="h-4 w-4" /> View results
          </Link>
        )}
      </header>

      <div className="flex gap-1 border-b border-navy-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'border-cyber-blue text-cyber-blue'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'overview' && <OverviewTab campaign={campaign} />}
        {tab === 'targets' && <TargetsTab campaignId={campaign.id} state={campaign.state} />}
        {tab === 'generate' && <GenerateTab campaign={campaign} />}
        {tab === 'preview' && <EmailPreviewTab campaign={campaign} />}
        {tab === 'actions' && <ActionsTab campaign={campaign} />}
      </div>
    </div>
  )
}
