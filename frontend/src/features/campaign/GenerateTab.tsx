import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles, CheckCircle2, XCircle, Loader2, RotateCcw, AlertCircle } from 'lucide-react'
import { Campaign } from '../../api/campaigns'
import { targetsApi } from '../../api/targets'
import { streamGeneration, SSEMessage } from '../../lib/sse'
import { RAGAS_THRESHOLD } from '../../lib/constants'
import { isDemo, simulateGeneration } from '../../lib/demo'

// LangGraph node keys → friendly labels (order matches the pipeline).
const NODE_LABELS: Record<string, string> = {
  plan: 'Campaign Planner',
  generate: 'Template Generator',
  evaluate: 'Realism Evaluator',
  increment_retry: 'Retrying',
  personalise: 'Personalisation Agent',
  escalate: 'Escalated',
}

const PIPELINE_ORDER = ['plan', 'generate', 'evaluate', 'personalise']

type StepStatus = 'pending' | 'active' | 'done' | 'failed'

interface LogEntry {
  id: number
  text: string
  tone: 'info' | 'good' | 'bad' | 'warn'
}

export default function GenerateTab({ campaign }: { campaign: Campaign }) {
  const qc = useQueryClient()
  const [running, setRunning] = useState(false)
  const [steps, setSteps] = useState<Record<string, StepStatus>>({})
  const [log, setLog] = useState<LogEntry[]>([])
  const [error, setError] = useState('')
  const [finished, setFinished] = useState<null | 'completed' | 'failed'>(null)
  const cancelRef = useRef<(() => void) | null>(null)
  const logId = useRef(0)

  const { data: targets } = useQuery({
    queryKey: ['targets', campaign.id],
    queryFn: () => targetsApi.list(campaign.id),
  })

  const canGenerate =
    ['DRAFT', 'ESCALATED'].includes(campaign.state) && (targets?.length ?? 0) > 0

  useEffect(() => {
    return () => cancelRef.current?.()
  }, [])

  function addLog(text: string, tone: LogEntry['tone'] = 'info') {
    setLog((l) => [...l, { id: logId.current++, text, tone }])
  }

  function handleMessage(msg: SSEMessage) {
    const d = msg.data as Record<string, unknown>
    switch (msg.event) {
      case 'pipeline_started':
        addLog('Pipeline started', 'info')
        setSteps({ plan: 'active' })
        break
      case 'node_completed': {
        const node = String(d.node ?? '')
        const label = NODE_LABELS[node] ?? node
        const score = d.ragas_score as number | null | undefined
        const retry = (d.retry_count as number) ?? 0
        setSteps((s) => {
          const next = { ...s, [node]: 'done' as StepStatus }
          const orderIdx = PIPELINE_ORDER.indexOf(node)
          if (orderIdx !== -1 && PIPELINE_ORDER[orderIdx + 1]) {
            next[PIPELINE_ORDER[orderIdx + 1]] = 'active'
          }
          return next
        })
        if (node === 'evaluate' && score != null) {
          const passed = score >= RAGAS_THRESHOLD
          addLog(
            `Realism Evaluator → RAGAS ${score.toFixed(2)} ${
              passed ? '✓ passed' : `✗ below ${RAGAS_THRESHOLD} (retry ${retry}/3)`
            }`,
            passed ? 'good' : 'warn',
          )
        } else if (node === 'increment_retry') {
          addLog(`Regenerating (attempt ${retry + 1})…`, 'warn')
        } else {
          addLog(`${label} complete`, 'info')
        }
        break
      }
      case 'state_changed':
        addLog(`State → ${d.state}`, 'info')
        break
      case 'pipeline_completed':
        addLog(
          `Generation complete — RAGAS ${
            d.ragas_score != null ? Number(d.ragas_score).toFixed(2) : '—'
          }`,
          'good',
        )
        setFinished('completed')
        break
      case 'pipeline_failed':
        addLog(`Pipeline failed: ${d.error ?? 'unknown error'}`, 'bad')
        setSteps((s) => ({ ...s, escalate: 'failed' }))
        setFinished('failed')
        break
      default:
        break
    }
  }

  function start() {
    setError('')
    setLog([])
    setSteps({})
    setFinished(null)
    setRunning(true)

    const onDone = () => {
      setRunning(false)
      qc.invalidateQueries({ queryKey: ['campaign', campaign.id] })
      qc.invalidateQueries({ queryKey: ['campaigns'] })
    }

    if (isDemo()) {
      cancelRef.current = simulateGeneration(campaign.id, { onMessage: handleMessage, onDone })
      return
    }

    const controller = streamGeneration(campaign.id, {
      onMessage: handleMessage,
      onError: (err) => {
        setError(err.message)
        setRunning(false)
        qc.invalidateQueries({ queryKey: ['campaign', campaign.id] })
      },
      onDone,
    })
    cancelRef.current = () => controller.abort()
  }

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-white">
            <Sparkles className="h-4 w-4 text-cyber-cyan" /> AI email generation
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Runs the 5-node LangGraph pipeline and streams live progress.
          </p>
        </div>
        <button className="btn-primary" onClick={start} disabled={!canGenerate || running}>
          {running ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Generating…
            </>
          ) : campaign.state === 'ESCALATED' ? (
            <>
              <RotateCcw className="h-4 w-4" /> Re-generate
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Generate emails
            </>
          )}
        </button>
      </div>

      {!canGenerate && !running && (
        <p className="rounded-lg border border-navy-700 bg-navy-900/40 px-3 py-2 text-sm text-slate-400">
          {(targets?.length ?? 0) === 0
            ? 'Add at least one target before generating.'
            : `Generation is only available from DRAFT or ESCALATED (current: ${campaign.state}).`}
        </p>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-cyber-red/30 bg-cyber-red/10 px-3 py-2 text-sm text-cyber-red">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {(running || log.length > 0) && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="card">
            <h4 className="mb-4 text-sm font-semibold text-slate-300">Pipeline</h4>
            <ol className="space-y-3">
              {PIPELINE_ORDER.map((node) => (
                <StepRow key={node} label={NODE_LABELS[node]} status={steps[node] ?? 'pending'} />
              ))}
            </ol>
          </div>

          <div className="card">
            <h4 className="mb-4 text-sm font-semibold text-slate-300">Live log</h4>
            <div className="max-h-72 space-y-1.5 overflow-y-auto font-mono text-xs">
              {log.map((entry) => (
                <div
                  key={entry.id}
                  className={
                    entry.tone === 'good'
                      ? 'text-cyber-green'
                      : entry.tone === 'bad'
                        ? 'text-cyber-red'
                        : entry.tone === 'warn'
                          ? 'text-cyber-amber'
                          : 'text-slate-400'
                  }
                >
                  <span className="text-slate-600">›</span> {entry.text}
                </div>
              ))}
              {running && <div className="text-slate-500">▍</div>}
            </div>
          </div>
        </div>
      )}

      {finished === 'completed' && campaign.email_subject && (
        <div className="card border-cyber-green/30">
          <div className="mb-2 flex items-center gap-2 text-cyber-green">
            <CheckCircle2 className="h-4 w-4" /> <span className="font-semibold">Draft ready</span>
          </div>
          <p className="text-sm text-slate-400">
            Subject: <span className="text-slate-200">{campaign.email_subject}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">See the “Email Preview” tab for the full body.</p>
        </div>
      )}
    </div>
  )
}

function StepRow({ label, status }: { label: string; status: StepStatus }) {
  const icon =
    status === 'done' ? (
      <CheckCircle2 className="h-5 w-5 text-cyber-green" />
    ) : status === 'active' ? (
      <Loader2 className="h-5 w-5 animate-spin text-cyber-cyan" />
    ) : status === 'failed' ? (
      <XCircle className="h-5 w-5 text-cyber-red" />
    ) : (
      <div className="h-5 w-5 rounded-full border-2 border-navy-600" />
    )

  return (
    <li className="flex items-center gap-3">
      {icon}
      <span
        className={
          status === 'pending'
            ? 'text-sm text-slate-500'
            : status === 'active'
              ? 'text-sm font-medium text-white'
              : 'text-sm text-slate-300'
        }
      >
        {label}
      </span>
    </li>
  )
}
