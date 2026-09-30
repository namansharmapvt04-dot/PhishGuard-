import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Save, X } from 'lucide-react'
import { campaignsApi, Campaign, CampaignUpdate } from '../../api/campaigns'
import { formatDate, formatScore } from '../../lib/format'
import { apiError } from '../../api/client'

const EDITABLE_STATES = new Set(['DRAFT', 'READY', 'ESCALATED'])

export default function OverviewTab({ campaign }: { campaign: Campaign }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<CampaignUpdate>({
    name: campaign.name,
    description: campaign.description ?? '',
  })

  const mutation = useMutation({
    mutationFn: (payload: CampaignUpdate) => campaignsApi.update(campaign.id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign', campaign.id] })
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      setEditing(false)
    },
    onError: (err) => setError(apiError(err, 'Could not save changes')),
  })

  const canEdit = EDITABLE_STATES.has(campaign.state)
  const meta = campaign.agent_metadata

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-white">Details</h3>
          {canEdit && !editing && (
            <button className="btn-ghost" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          )}
          {editing && (
            <div className="flex gap-2">
              <button
                className="btn-ghost"
                onClick={() => {
                  setEditing(false)
                  setError('')
                  setDraft({ name: campaign.name, description: campaign.description ?? '' })
                }}
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <button
                className="btn-primary"
                disabled={mutation.isPending}
                onClick={() => {
                  setError('')
                  mutation.mutate({ name: draft.name, description: draft.description || null })
                }}
              >
                <Save className="h-3.5 w-3.5" /> Save
              </button>
            </div>
          )}
        </div>

        {error && <p className="mb-3 text-sm text-cyber-red">{error}</p>}

        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                value={draft.name ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                className="input min-h-[80px] resize-y"
                value={draft.description ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              />
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Field label="Description" value={campaign.description || '—'} span />
            <Field label="Target department" value={campaign.target_department || '—'} />
            <Field label="Attack vector" value={campaign.attack_vector || '—'} />
            <Field label="Urgency" value={campaign.urgency_level || '—'} capitalize />
            <Field label="Sender persona" value={campaign.sender_persona || '—'} />
            <Field label="RAGAS score" value={formatScore(campaign.ragas_score)} mono />
            <Field label="Retries" value={String(campaign.retry_count)} mono />
            <Field label="Scheduled" value={formatDate(campaign.scheduled_at)} />
            <Field label="Created" value={formatDate(campaign.created_at)} />
          </dl>
        )}
      </div>

      {meta && (meta.plan_reasoning || meta.fear_factor || meta.urgency_trigger) && (
        <div className="card">
          <h3 className="mb-4 font-semibold text-white">AI strategy</h3>
          <dl className="space-y-4">
            {meta.plan_reasoning && <Field label="Plan reasoning" value={meta.plan_reasoning} span />}
            <div className="grid grid-cols-2 gap-4">
              {meta.fear_factor && <Field label="Fear factor" value={meta.fear_factor} />}
              {meta.urgency_trigger && <Field label="Urgency trigger" value={meta.urgency_trigger} />}
            </div>
            {meta.eval_feedback && <Field label="Evaluator feedback" value={meta.eval_feedback} span />}
            {meta.rag_pattern_count != null && (
              <Field label="RAG patterns used" value={String(meta.rag_pattern_count)} mono />
            )}
          </dl>
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  span,
  mono,
  capitalize,
}: {
  label: string
  value: string
  span?: boolean
  mono?: boolean
  capitalize?: boolean
}) {
  return (
    <div className={span ? 'col-span-2 sm:col-span-3' : ''}>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd
        className={`mt-1 text-sm text-slate-200 ${mono ? 'font-mono' : ''} ${
          capitalize ? 'capitalize' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  )
}
