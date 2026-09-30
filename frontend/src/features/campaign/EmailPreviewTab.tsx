import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Mail, Info } from 'lucide-react'
import { Campaign } from '../../api/campaigns'
import { targetsApi, Target } from '../../api/targets'

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
  const [targetId, setTargetId] = useState<string>('')

  const { data: targets } = useQuery({
    queryKey: ['targets', campaign.id],
    queryFn: () => targetsApi.list(campaign.id),
  })

  const selected = useMemo(
    () => targets?.find((t) => t.id === targetId) ?? null,
    [targets, targetId],
  )

  if (!campaign.email_body) {
    return (
      <div className="card flex flex-col items-center gap-3 py-14 text-center text-slate-400">
        <Mail className="h-10 w-10 text-slate-600" />
        <div>
          <p className="font-medium text-white">No email generated yet</p>
          <p className="text-sm text-slate-500">
            Run the pipeline in the “Generate” tab to produce a template.
          </p>
        </div>
      </div>
    )
  }

  const company = campaign.email_from_name || 'the company'
  const subject = personalise(campaign.email_subject ?? '', selected, company)
  const body = personalise(campaign.email_body, selected, company)

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8">
    <style>body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;margin:0;padding:20px;line-height:1.5}a{color:#2563eb}</style>
    </head><body>${body}</body></html>`

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-slate-500">From</div>
            <div className="text-sm text-slate-200">
              {campaign.email_from_name || 'Unknown'}{' '}
              <span className="text-slate-500">
                &lt;{campaign.email_from_address || 'unknown@example.com'}&gt;
              </span>
            </div>
          </div>
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
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Subject</div>
          <div className="text-base font-semibold text-white">{subject}</div>
        </div>
      </div>

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
    </div>
  )
}
