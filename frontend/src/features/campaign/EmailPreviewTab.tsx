import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, Info, Pencil, Save, X, AlertCircle } from 'lucide-react'
import { campaignsApi, Campaign } from '../../api/campaigns'
import { targetsApi, Target } from '../../api/targets'
import { apiError } from '../../api/client'
import RichTextEditor from '../../components/RichTextEditor'

const EDITABLE_STATES = new Set(['DRAFT', 'READY', 'ESCALATED'])

// Smaller models often ignore the "HTML-safe" instruction and return plain
// text with \n line breaks — HTML collapses those, so without this the
// editor (and the sent email, fixed server-side in mailer.py) would show
// one run-on paragraph. Mirrors backend/app/core/mailer.py's _ensure_html.
function ensureHtml(body: string): string {
  if (/<(p|br|div|table)[\s/>]/i.test(body)) return body
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

// The backend template uses these placeholders (see template_generator.py).
function personalise(text: string, t: Target | null, company: string): string {
  const [first, ...rest] = (t?.full_name ?? '').split(' ')
  const map: Record<string, string> = {
    first_name: first || 'there',
    last_name: rest.join(' ') || '',
    full_name: t?.full_name ?? '',
    department: t?.department ?? '',
    job_title: t?.job_title ?? '',
    manager_name: t?.manager_name ?? '',
    company,
  }
  return text.replace(/\{(\w+)\}/g, (m, key: string) => (key in map ? map[key] : m))
}

export default function EmailPreviewTab({ campaign }: { campaign: Campaign }) {
  const qc = useQueryClient()
  const [targetId, setTargetId] = useState<string>('')
  const [editing, setEditing] = useState(false)
  const [draftSubject, setDraftSubject] = useState(campaign.email_subject ?? '')
  const [draftBody, setDraftBody] = useState(ensureHtml(campaign.email_body ?? ''))
  const [error, setError] = useState('')

  const { data: targets } = useQuery({
    queryKey: ['targets', campaign.id],
    queryFn: () => targetsApi.list(campaign.id),
  })

  const selected = useMemo(
    () => targets?.find((t) => t.id === targetId) ?? null,
    [targets, targetId],
  )

  const canEdit = EDITABLE_STATES.has(campaign.state)

  const save = useMutation({
    mutationFn: () =>
      campaignsApi.update(campaign.id, { email_subject: draftSubject, email_body: draftBody }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign', campaign.id] })
      setEditing(false)
    },
    onError: (e) => setError(apiError(e, 'Could not save changes')),
  })

  function startEditing() {
    setDraftSubject(campaign.email_subject ?? '')
    setDraftBody(ensureHtml(campaign.email_body ?? ''))
    setError('')
    setEditing(true)
  }

  async function uploadImage(file: File): Promise<string> {
    try {
      const { url } = await campaignsApi.uploadImage(campaign.id, file)
      return url
    } catch (err) {
      setError(apiError(err, 'Image upload failed'))
      throw err
    }
  }

  if (!campaign.email_body && !editing) {
    return (
      <div className="card flex flex-col items-center gap-3 py-14 text-center text-slate-400">
        <Mail className="h-10 w-10 text-slate-600" />
        <div>
          <p className="font-medium text-foreground">No email generated yet</p>
          <p className="text-sm text-slate-500">
            Run the pipeline in the “Generate” tab to produce a template.
          </p>
        </div>
      </div>
    )
  }

  const company = campaign.email_from_name || 'the company'
  const subject = personalise(campaign.email_subject ?? '', selected, company)
  const body = personalise(campaign.email_body ?? '', selected, company)

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8">
    <style>body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;margin:0;padding:20px;line-height:1.5}a{color:#2563eb}</style>
    </head><body>${body}</body></html>`

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-cyber-red/30 bg-cyber-red/10 px-3 py-2 text-sm text-cyber-red">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-slate-500">From</div>
            <div className="text-sm text-foreground">
              {campaign.email_from_name || 'Unknown'}{' '}
              <span className="text-muted-foreground">
                &lt;{campaign.email_from_address || 'unknown@example.com'}&gt;
              </span>
            </div>
          </div>
          <div className="flex items-end gap-3">
            {!editing && (
              <div>
                <label className="label">Preview as</label>
                <select
                  className="input min-w-[200px]"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                >
                  <option value="">Template (raw variables)</option>
                  {targets?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name} — {t.email}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {canEdit && !editing && (
              <button className="btn-ghost" onClick={startEditing}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            )}
          </div>
        </div>

        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="label">Subject</label>
              <input
                className="input"
                value={draftSubject}
                onChange={(e) => setDraftSubject(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Body</label>
              <RichTextEditor content={draftBody} onChange={setDraftBody} onUploadImage={uploadImage} />
              <p className="mt-1 text-xs text-slate-500">
                Type {'{first_name}'}, {'{last_name}'}, {'{department}'}, {'{job_title}'}, {'{manager_name}'}
                , or {'{company}'} anywhere and they get substituted per target when sent.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setEditing(false)} disabled={save.isPending}>
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="h-3.5 w-3.5" /> {save.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Subject</div>
            <div className="text-base font-semibold text-foreground">{subject}</div>
          </div>
        )}
      </div>

      {!editing && (
        <>
          <div className="overflow-hidden rounded-xl border border-navy-700 bg-white">
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={srcDoc}
              className="h-[520px] w-full border-0"
            />
          </div>

          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Info className="h-3.5 w-3.5" />
            Personalisation shown here is a client-side preview. Per-target rendered emails are produced
            by the backend Personalisation Agent at send time.
          </p>
        </>
      )}
    </div>
  )
}
