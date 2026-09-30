import { FormEvent, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, AlertCircle } from 'lucide-react'
import { campaignsApi, Campaign, CampaignCreate, CampaignState } from '../api/campaigns'
import StateBadge from '../components/StateBadge'
import Spinner from '../components/Spinner'
import Modal from '../components/Modal'
import { formatDateShort, formatScore } from '../lib/format'
import { apiError } from '../api/client'

type Filter = 'all' | 'active' | 'done' | 'escalated'

const FILTERS: { key: Filter; label: string; match: (s: CampaignState) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  {
    key: 'active',
    label: 'Active',
    match: (s) => ['GENERATING', 'READY', 'SCHEDULED', 'RUNNING', 'PAUSED'].includes(s),
  },
  { key: 'done', label: 'Done', match: (s) => s === 'DONE' },
  { key: 'escalated', label: 'Escalated', match: (s) => s === 'ESCALATED' },
]

export default function CampaignList() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const [modalOpen, setModalOpen] = useState(false)

  const { data: campaigns, isLoading, error } = useQuery({
    queryKey: ['campaigns'],
    queryFn: campaignsApi.list,
  })

  const filtered = useMemo(() => {
    const matcher = FILTERS.find((f) => f.key === filter)!.match
    return (campaigns ?? []).filter((c) => matcher(c.state))
  }, [campaigns, filter])

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Campaigns</h1>
          <p className="text-sm text-slate-400">Create and manage phishing-simulation campaigns</p>
        </div>
        <button className="btn-primary" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" /> New campaign
        </button>
      </header>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key
                ? 'bg-cyber-blue/15 text-cyber-blue'
                : 'text-slate-400 hover:bg-navy-800/60 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Spinner full label="Loading campaigns…" />
      ) : error ? (
        <div className="card text-cyber-red">{apiError(error, 'Failed to load campaigns')}</div>
      ) : filtered.length === 0 ? (
        <div className="card py-14 text-center text-slate-500">
          No campaigns in this view.
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead>
              <tr className="bg-navy-950/40">
                <th className="table-th">Name</th>
                <th className="table-th">State</th>
                <th className="table-th">Vector</th>
                <th className="table-th">Urgency</th>
                <th className="table-th">RAGAS</th>
                <th className="table-th">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <Row key={c.id} c={c} onClick={() => navigate(`/campaigns/${c.id}`)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateCampaignModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}

function Row({ c, onClick }: { c: Campaign; onClick: () => void }) {
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer transition-colors hover:bg-navy-800/40"
    >
      <td className="table-td">
        <div className="font-medium text-white">{c.name}</div>
        {c.target_department && (
          <div className="text-xs text-slate-500">{c.target_department}</div>
        )}
      </td>
      <td className="table-td"><StateBadge state={c.state} /></td>
      <td className="table-td text-slate-400">{c.attack_vector ?? '—'}</td>
      <td className="table-td text-slate-400 capitalize">{c.urgency_level ?? '—'}</td>
      <td className="table-td font-mono">{formatScore(c.ragas_score)}</td>
      <td className="table-td text-slate-400">{formatDateShort(c.created_at)}</td>
    </tr>
  )
}

const EMPTY: CampaignCreate = {
  name: '',
  description: '',
  target_department: '',
  attack_vector: 'credential harvesting',
  urgency_level: 'medium',
}

function CreateCampaignModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [form, setForm] = useState<CampaignCreate>(EMPTY)
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: (payload: CampaignCreate) => campaignsApi.create(payload),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      setForm(EMPTY)
      onClose()
      navigate(`/campaigns/${created.id}`)
    },
    onError: (err) => setError(apiError(err, 'Could not create campaign')),
  })

  function set<K extends keyof CampaignCreate>(key: K, value: CampaignCreate[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    // Strip empty optional strings so backend validation stays happy.
    const payload: CampaignCreate = {
      name: form.name.trim(),
      description: form.description?.trim() || null,
      target_department: form.target_department?.trim() || null,
      attack_vector: form.attack_vector?.trim() || null,
      urgency_level: form.urgency_level || null,
    }
    mutation.mutate(payload)
  }

  return (
    <Modal
      open={open}
      title="New campaign"
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn-primary"
            form="create-campaign-form"
            type="submit"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Creating…' : 'Create campaign'}
          </button>
        </>
      }
    >
      <form id="create-campaign-form" onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-cyber-red/30 bg-cyber-red/10 px-3 py-2 text-sm text-cyber-red">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="label">Campaign name</label>
          <input
            className="input"
            placeholder="Q3 Finance credential test"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
            minLength={2}
          />
        </div>

        <div>
          <label className="label">Description</label>
          <textarea
            className="input min-h-[70px] resize-y"
            placeholder="Optional context for your team"
            value={form.description ?? ''}
            onChange={(e) => set('description', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Target department</label>
            <input
              className="input"
              placeholder="Finance"
              value={form.target_department ?? ''}
              onChange={(e) => set('target_department', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Urgency</label>
            <select
              className="input"
              value={form.urgency_level ?? 'medium'}
              onChange={(e) => set('urgency_level', e.target.value as CampaignCreate['urgency_level'])}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="label">Attack vector</label>
            <input
              className="input"
              placeholder="credential harvesting"
              value={form.attack_vector ?? ''}
              onChange={(e) => set('attack_vector', e.target.value)}
            />
          </div>
        </div>
      </form>
    </Modal>
  )
}
