import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, RefreshCw, ShieldAlert, GraduationCap, ListChecks } from 'lucide-react'
import { campaignsApi } from '../api/campaigns'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import { apiError } from '../api/client'

const RISK_BADGE: Record<string, string> = {
  low: 'badge-green',
  medium: 'badge-amber',
  high: 'badge-red',
  critical: 'badge-red',
}

export default function InsightsPage() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<string>('')

  const { data: campaigns, isLoading } = useQuery({ queryKey: ['campaigns'], queryFn: campaignsApi.list })
  const done = useMemo(() => (campaigns ?? []).filter((c) => c.state === 'DONE'), [campaigns])
  const campaignId = selected || done[0]?.id || ''
  const campaign = done.find((c) => c.id === campaignId)

  const analyse = useMutation({
    mutationFn: (id: string) => campaignsApi.analyse(id),
    onSuccess: (updated) => {
      qc.setQueryData(['campaigns'], (prev: typeof campaigns) =>
        prev?.map((c) => (c.id === updated.id ? updated : c)),
      )
    },
  })

  const meta = campaign?.agent_metadata
  const risk = meta?.risk_level

  if (isLoading) return <Spinner full label="Loading insights…" />

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI security analyst"
        title="Organisation risk briefing"
        description="Run the insight-analyst agent over a completed campaign's results to get a risk assessment and training recommendations."
        actions={
          campaign && (
            <button
              className="btn-primary"
              disabled={analyse.isPending}
              onClick={() => analyse.mutate(campaign.id)}
            >
              {analyse.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {risk ? 'Regenerate report' : 'Generate report'}
            </button>
          )
        }
      />

      {done.length === 0 ? (
        <div className="card py-12 text-center text-muted-foreground">
          No completed campaigns yet — insights become available once a campaign reaches DONE.
        </div>
      ) : (
        <>
          <div className="card">
            <label className="label">Campaign</label>
            <select
              className="input max-w-md"
              value={campaignId}
              onChange={(e) => setSelected(e.target.value)}
            >
              {done.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {analyse.isError && (
            <div className="card text-cyber-red">{apiError(analyse.error, 'Could not generate report')}</div>
          )}

          {!risk && !analyse.isPending && (
            <div className="card flex items-center gap-3 text-muted-foreground">
              <Bot className="h-5 w-5 shrink-0" />
              No report generated yet for this campaign. Click "Generate report" above.
            </div>
          )}

          {analyse.isPending && (
            <div className="card">
              <Spinner label="Running insight-analyst agent…" />
            </div>
          )}

          {risk && (
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="card">
                <div className="mb-3 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-cyber-red" />
                  <h3 className="font-semibold text-foreground">Risk assessment</h3>
                  <span className={`${RISK_BADGE[risk] ?? 'badge-gray'} ml-auto capitalize`}>{risk}</span>
                </div>
                {meta?.vulnerability_summary && (
                  <p className="mb-3 text-sm text-foreground/90">{meta.vulnerability_summary}</p>
                )}
                {meta?.top_vulnerabilities?.length ? (
                  <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                    {meta.top_vulnerabilities.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                ) : null}
                {meta?.departments_at_risk?.length ? (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {meta.departments_at_risk.map((d) => (
                      <span key={d} className="badge-amber">
                        {d}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="card">
                <div className="mb-3 flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-cyber-cyan" />
                  <h3 className="font-semibold text-foreground">Recommended training</h3>
                </div>
                {meta?.recommended_training?.length ? (
                  <ul className="space-y-2">
                    {meta.recommended_training.map((t, i) => (
                      <li key={i} className="rounded-lg border border-navy-700 bg-navy-950 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-foreground">{t.topic}</span>
                          <span className="badge-gray capitalize">{t.priority}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{t.rationale}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No recommendations available.</p>
                )}
              </div>

              {meta?.immediate_actions?.length ? (
                <div className="card lg:col-span-2">
                  <div className="mb-3 flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-cyber-blue" />
                    <h3 className="font-semibold text-foreground">Immediate actions</h3>
                  </div>
                  <ul className="list-inside list-disc space-y-1 text-sm text-foreground/90">
                    {meta.immediate_actions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  )
}
