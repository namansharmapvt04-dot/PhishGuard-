import { FormEvent, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2, Upload, UserPlus, AlertCircle } from 'lucide-react'
import { targetsApi, Target, TargetCreate } from '../../api/targets'
import { CampaignState } from '../../api/campaigns'
import Spinner from '../../components/Spinner'
import { apiError } from '../../api/client'

const CAN_EDIT = new Set<CampaignState>(['DRAFT', 'READY', 'SCHEDULED'])

export default function TargetsTab({
  campaignId,
  state,
}: {
  campaignId: string
  state: CampaignState
}) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const editable = CAN_EDIT.has(state)

  const { data: targets, isLoading } = useQuery({
    queryKey: ['targets', campaignId],
    queryFn: () => targetsApi.list(campaignId),
  })

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['targets', campaignId] })
  }

  const addOne = useMutation({
    mutationFn: (payload: TargetCreate) => targetsApi.add(campaignId, payload),
    onSuccess: invalidate,
    onError: (e) => setError(apiError(e, 'Could not add target')),
  })
  const bulkAdd = useMutation({
    mutationFn: (rows: TargetCreate[]) => targetsApi.bulkAdd(campaignId, rows),
    onSuccess: invalidate,
    onError: (e) => setError(apiError(e, 'Bulk import failed')),
  })
  const remove = useMutation({
    mutationFn: (targetId: string) => targetsApi.remove(campaignId, targetId),
    onSuccess: invalidate,
    onError: (e) => setError(apiError(e, 'Could not remove target')),
  })

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError('')
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const rows = parseCsv(await file.text())
      if (!rows.length) throw new Error('No valid rows found (need at least email and full_name).')
      bulkAdd.mutate(rows)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-cyber-red/30 bg-cyber-red/10 px-3 py-2 text-sm text-cyber-red">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {editable ? (
        <AddTargetForm onAdd={(p) => addOne.mutate(p)} pending={addOne.isPending}>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onFile}
          />
          <button
            type="button"
            className="btn-ghost"
            onClick={() => fileRef.current?.click()}
            disabled={bulkAdd.isPending}
          >
            <Upload className="h-4 w-4" /> {bulkAdd.isPending ? 'Importing…' : 'Import CSV'}
          </button>
        </AddTargetForm>
      ) : (
        <p className="rounded-lg border border-navy-700 bg-navy-900/40 px-3 py-2 text-sm text-slate-400">
          Targets can only be modified while the campaign is DRAFT, READY or SCHEDULED.
        </p>
      )}

      {isLoading ? (
        <Spinner label="Loading targets…" />
      ) : !targets || targets.length === 0 ? (
        <div className="card py-12 text-center text-slate-500">No targets yet.</div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead>
              <tr className="bg-navy-950/40">
                <th className="table-th">Name</th>
                <th className="table-th">Email</th>
                <th className="table-th">Department</th>
                <th className="table-th">Job title</th>
                <th className="table-th">Status</th>
                {editable && <th className="table-th" />}
              </tr>
            </thead>
            <tbody>
              {targets.map((t: Target) => (
                <tr key={t.id} className="hover:bg-navy-800/40">
                  <td className="table-td font-medium text-white">{t.full_name}</td>
                  <td className="table-td text-slate-300">{t.email}</td>
                  <td className="table-td text-slate-400">{t.department ?? '—'}</td>
                  <td className="table-td text-slate-400">{t.job_title ?? '—'}</td>
                  <td className="table-td">
                    <span className={t.status === 'SENT' ? 'badge-green' : 'badge-gray'}>
                      {t.status}
                    </span>
                  </td>
                  {editable && (
                    <td className="table-td text-right">
                      <button
                        className="text-slate-500 hover:text-cyber-red"
                        onClick={() => remove.mutate(t.id)}
                        aria-label="Remove target"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {targets && targets.length > 0 && (
        <p className="text-xs text-slate-500">{targets.length} target(s)</p>
      )}
    </div>
  )
}

const EMPTY: TargetCreate = { email: '', full_name: '', department: '', job_title: '', manager_name: '' }

function AddTargetForm({
  onAdd,
  pending,
  children,
}: {
  onAdd: (p: TargetCreate) => void
  pending: boolean
  children: React.ReactNode
}) {
  const [form, setForm] = useState<TargetCreate>(EMPTY)

  function set<K extends keyof TargetCreate>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    onAdd({
      email: form.email.trim(),
      full_name: form.full_name.trim(),
      department: form.department?.trim() || null,
      job_title: form.job_title?.trim() || null,
      manager_name: form.manager_name?.trim() || null,
    })
    setForm(EMPTY)
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          className="input"
          placeholder="Full name *"
          value={form.full_name}
          onChange={(e) => set('full_name', e.target.value)}
          required
        />
        <input
          className="input"
          type="email"
          placeholder="Email *"
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          required
        />
        <input
          className="input"
          placeholder="Department"
          value={form.department ?? ''}
          onChange={(e) => set('department', e.target.value)}
        />
        <input
          className="input"
          placeholder="Job title"
          value={form.job_title ?? ''}
          onChange={(e) => set('job_title', e.target.value)}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          CSV columns: <code className="text-slate-400">email, full_name, department, job_title, manager_name</code>
        </p>
        <div className="flex gap-2">
          {children}
          <button type="submit" className="btn-primary" disabled={pending}>
            <UserPlus className="h-4 w-4" /> Add target
          </button>
        </div>
      </div>
    </form>
  )
}

/** Minimal CSV parser: header row + comma-separated values, quote-aware. */
function parseCsv(text: string): TargetCreate[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim())
  if (lines.length < 2) return []

  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
  const idx = (name: string) => header.indexOf(name)
  const iEmail = idx('email')
  const iName = idx('full_name') !== -1 ? idx('full_name') : idx('name')
  if (iEmail === -1 || iName === -1) {
    throw new Error('CSV must have "email" and "full_name" columns.')
  }
  const iDept = idx('department')
  const iJob = idx('job_title')
  const iMgr = idx('manager_name')

  const rows: TargetCreate[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i])
    const email = cols[iEmail]?.trim()
    const full_name = cols[iName]?.trim()
    if (!email || !full_name) continue
    rows.push({
      email,
      full_name,
      department: iDept !== -1 ? cols[iDept]?.trim() || null : null,
      job_title: iJob !== -1 ? cols[iJob]?.trim() || null : null,
      manager_name: iMgr !== -1 ? cols[iMgr]?.trim() || null : null,
    })
  }
  return rows
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}
