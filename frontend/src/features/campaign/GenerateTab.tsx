import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Sparkles, CheckCircle2, XCircle, Loader2, RotateCcw, AlertCircle } from 'lucide-react'
import { Campaign } from '../../api/campaigns'
import { targetsApi } from '../../api/targets'
import { streamGeneration, streamGenerationProgress, SSEMessage } from '../../lib/sse'
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
  // Lazy-initialised: if this component mounts (or remounts, e.g. after a
  // page reload) while a generation run is already in progress, start in
  // the "running" view immediately instead of flashing the "only available
  // from DRAFT/ESCALATED" warning for a frame before the reconnect effect
  // below catches up.
  const [running, setRunning] = useState(() => campaign.state === 'GENERATING')
  const [steps, setSteps] = useState<Record<string, StepStatus>>({})
  const [log, setLog] = useState<LogEntry[]>([])
  const [error, setError] = useState('')
  const [finished, setFinished] = useState<null | 'completed' | 'failed'>(null)
  // The real exception text from a `pipeline_failed` SSE event, if any. A
  // genuine max-retries escalation (state_changed → ESCALATED, no crash)
  // never sets this — only an unhandled exception in the pipeline does, so
  // its presence is what distinguishes "the evaluator gave up" from "the
  // app threw an error partway through", which otherwise look identical
  // from the DB's point of view (both just end up in ESCALATED state).
  const [errorDetail, setErrorDetail] = useState('')
  const logId = useRef(0)
  // Only for demo mode's timer-based simulation — cleared on unmount so a
  // left-running set of setTimeouts doesn't keep firing into state after
  // the component is gone. The real streams (streamGeneration /
  // streamGenerationProgress) manage their own lifetime and must NOT be
  // tied to this component's mount/unmount — see the reconnect effect
  // below for why.
  const demoCancelRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    return () => demoCancelRef.current?.()
  }, [])
  // True while `start()`'s own POST stream is live in this tab — tells the
  // reconnect effect below not to also attach, which would double up on
  // every event.
  const localRunRef = useRef(false)

  const { data: targets } = useQuery({
    queryKey: ['targets', campaign.id],
    queryFn: () => targetsApi.list(campaign.id),
  })

  const canGenerate =
    ['DRAFT', 'ESCALATED'].includes(campaign.state) && (targets?.length ?? 0) > 0

  // Auto-reconnect to a run already in progress — covers both a fresh
  // mount while campaign.state is GENERATING (page reload) and the
  // CampaignDetail tab panel being torn down and rebuilt (if it's ever not
  // kept mounted). The real pipeline runs independently of this view: it's
  // driven by the original POST /generate request server-side, so this
  // only replays/tails that run's progress log — reconnecting never starts
  // a second run.
  const attachedRef = useRef(false)
  useEffect(() => {
    if (campaign.state !== 'GENERATING') {
      attachedRef.current = false
      return
    }
    // Already watching this exact run via the POST stream `start()` kicked
    // off in this same tab — e.g. a stale query refetch landed mid-run and
    // flipped campaign.state to GENERATING while that stream is still
    // live. Attaching the reconnect GET here too would replay the same
    // events a second time, producing duplicate log/step entries.
    if (attachedRef.current || localRunRef.current) return
    attachedRef.current = true

    setRunning(true)
    setFinished(null)

    if (isDemo()) return

    const controller = streamGenerationProgress(campaign.id, {
      onMessage: handleMessage,
      onError: (err) => {
        setError(err.message)
        setRunning(false)
      },
      onDone: () => {
        setRunning(false)
        qc.invalidateQueries({ queryKey: ['campaign', campaign.id] })
        qc.invalidateQueries({ queryKey: ['campaigns'] })
      },
    })

    // Safe to abort here — this is only a read-only view of the run, not
    // what drives it. If the tab unmounts, the pipeline keeps going
    // server-side; reconnecting again later just replays from where this
    // left off.
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id, campaign.state])

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

        if (node === 'escalate') {
          // 'escalate' isn't a step shown in the Pipeline list (PIPELINE_ORDER
          // only covers the happy path) — the evaluator's own node_completed
          // already speculatively advanced the *next* happy-path step
          // (personalise) to 'active' before the graph's conditional edge
          // actually routed here instead. Without this, that step is left
          // spinning forever even after the run has finished.
          setSteps((s) => {
            const next = { ...s }
            for (const key of Object.keys(next)) {
              if (next[key] === 'active') next[key] = 'failed'
            }
            return next
          })
          break
        }

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
        addLog(`State → ${d.state}`, d.state === 'ESCALATED' ? 'bad' : 'info')
        if (d.state === 'ESCALATED') {
          // Backend sends state_changed but no pipeline_completed/failed on
          // this path — treat it as terminal here too so the UI can't be
          // left showing a spinner with no explanation.
          setFinished('failed')
        }
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
      case 'pipeline_failed': {
        const message = String(d.error ?? 'unknown error')
        addLog(`Pipeline failed: ${message}`, 'bad')
        // An unhandled exception can land mid-step — e.g. a crash inside
        // Personalisation Agent after Realism Evaluator already passed
        // leaves that step pre-marked 'active' with no node_completed ever
        // arriving to resolve it. Don't wait for the stream to fully close
        // (onDone) to stop the spinner; react to this event immediately.
        setSteps((s) => {
          const next = { ...s }
          for (const key of Object.keys(next)) {
            if (next[key] === 'active') next[key] = 'failed'
          }
          return next
        })
        setErrorDetail(message)
        setRunning(false)
        setFinished('failed')
        break
      }
      default:
        break
    }
  }

  function start() {
    setError('')
    setLog([])
    setSteps({})
    setFinished(null)
    setErrorDetail('')
    setRunning(true)
    localRunRef.current = true

    const onDone = () => {
      localRunRef.current = false
      setRunning(false)
      qc.invalidateQueries({ queryKey: ['campaign', campaign.id] })
      qc.invalidateQueries({ queryKey: ['campaigns'] })
    }

    if (isDemo()) {
      demoCancelRef.current = simulateGeneration(campaign.id, { onMessage: handleMessage, onDone })
      return
    }

    // Deliberately not stored for cancel-on-unmount: this request drives
    // the pipeline itself. If the user switches tabs mid-generation, the
    // run must keep going server-side — the reconnect effect above is what
    // picks the view back up, not this controller.
    streamGeneration(campaign.id, {
      onMessage: handleMessage,
      onError: (err) => {
        localRunRef.current = false
        setError(err.message)
        setRunning(false)
        qc.invalidateQueries({ queryKey: ['campaign', campaign.id] })
      },
      onDone,
    })
  }

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
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
            Subject: <span className="text-foreground">{campaign.email_subject}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">See the “Email Preview” tab for the full body.</p>
        </div>
      )}

      {finished === 'failed' && (
        <div className="card border-cyber-red/30">
          <div className="mb-2 flex items-center gap-2 text-cyber-red">
            <XCircle className="h-4 w-4" />
            <span className="font-semibold">
              {errorDetail ? 'Generation failed' : 'Escalated — all retries failed'}
            </span>
          </div>
          <p className="text-sm text-slate-400">
            {errorDetail ? (
              // A real exception, not a legitimate max-retries escalation —
              // show what actually went wrong instead of guessing based on
              // campaign.state (both cases land in the same ESCALATED state,
              // so that alone can't tell them apart).
              <>Error: <span className="text-foreground">{errorDetail}</span></>
            ) : (
              "The Realism Evaluator couldn't get a passing draft after the configured retry limit. This campaign needs manual review — edit the template yourself or hit “Re-generate” to try again from scratch."
            )}
          </p>
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
              ? 'text-sm font-medium text-foreground'
              : 'text-sm text-foreground/80'
        }
      >
        {label}
      </span>
    </li>
  )
}
