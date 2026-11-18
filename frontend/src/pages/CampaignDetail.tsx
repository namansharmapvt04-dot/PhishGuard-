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
    // Safety net alongside the Generate tab's own SSE stream: keeps the
    // state badge and the rest of the page in sync even if that stream
    // drops, until generation lands on a terminal state.
    refetchInterval: (query) => (query.state.data?.state === 'GENERATING' ? 3000 : false),
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
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Campaigns
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">{campaign.name}</h1>
          <StateBadge state={campaign.state} />
        </div>
        {['RUNNING', 'PAUSED', 'DONE'].includes(campaign.state) && (
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
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/*
        Kept mounted (hidden via CSS) rather than conditionally rendered —
        switching away from the Generate tab mid-run must not unmount it:
        that would drop its live SSE connection and local pipeline-progress
        state, surfacing as "Generation is only available from DRAFT or
        ESCALATED" when the user switches back despite generation still
        running server-side.
      */}
      <div>
        <div className={tab === 'overview' ? '' : 'hidden'}>
          <OverviewTab campaign={campaign} />
        </div>
        <div className={tab === 'targets' ? '' : 'hidden'}>
          <TargetsTab campaignId={campaign.id} state={campaign.state} />
        </div>
        <div className={tab === 'generate' ? '' : 'hidden'}>
          <GenerateTab campaign={campaign} />
        </div>
        <div className={tab === 'preview' ? '' : 'hidden'}>
          <EmailPreviewTab campaign={campaign} />
        </div>
        <div className={tab === 'actions' ? '' : 'hidden'}>
          <ActionsTab campaign={campaign} />
        </div>
      </div>
    </div>
  )
}
