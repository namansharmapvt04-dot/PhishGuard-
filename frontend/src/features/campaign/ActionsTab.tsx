import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, Pause, Play, CalendarClock, Trash2, AlertCircle, CheckCircle2, BarChart3, Flag } from 'lucide-react'
import { campaignsApi, Campaign, LaunchResult } from '../../api/campaigns'
import { apiError } from '../../api/client'
import { formatDate } from '../../lib/format'

export default function ActionsTab({ campaign }: { campaign: Campaign }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [launchResult, setLaunchResult] = useState<LaunchResult | null>(null)
  const [scheduleAt, setScheduleAt] = useState(
    campaign.scheduled_at ? campaign.scheduled_at.slice(0, 16) : '',
  )

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['campaign', campaign.id] })
    qc.invalidateQueries({ queryKey: ['campaigns'] })
  }

  const launch = useMutation({
    mutationFn: () => campaignsApi.launch(campaign.id),
    onSuccess: (result) => {
      setLaunchResult(result)
      invalidate()
    },
    onError: (e) => setError(apiError(e, 'Could not launch')),
  })
  const pause = useMutation({
    mutationFn: () => campaignsApi.pause(campaign.id),
    onSuccess: invalidate,
    onError: (e) => setError(apiError(e, 'Could not pause')),
  })
  const resume = useMutation({
    mutationFn: () => campaignsApi.resume(campaign.id),
    onSuccess: invalidate,
    onError: (e) => setError(apiError(e, 'Could not resume')),
  })
  const complete = useMutation({
    mutationFn: () => campaignsApi.complete(campaign.id),
    onSuccess: () => {
      invalidate()
      navigate(`/campaigns/${campaign.id}/results`)
    },
    onError: (e) => setError(apiError(e, 'Could not mark complete')),
  })
  const schedule = useMutation({
    mutationFn: () =>
      campaignsApi.update(campaign.id, {
        scheduled_at: scheduleAt ? new Date(scheduleAt).toISOString() : null,
      }),
    onSuccess: invalidate,
    onError: (e) => setError(apiError(e, 'Could not schedule')),
  })
  const remove = useMutation({
    mutationFn: () => campaignsApi.remove(campaign.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      navigate('/campaigns')
    },
    onError: (e) => setError(apiError(e, 'Could not delete')),
  })

  const canSchedule = ['READY', 'SCHEDULED'].includes(campaign.state)

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-cyber-red/30 bg-cyber-red/10 px-3 py-2 text-sm text-cyber-red">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-foreground">
              <Send className="h-4 w-4 text-cyber-blue" /> Launch campaign
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              Sends the generated email to every pending target via Brevo. Throttled to the
              free-tier daily cap — call again later if some targets are deferred.
            </p>
          </div>
          <button
            className="btn-primary shrink-0"
            disabled={!['READY', 'SCHEDULED', 'RUNNING'].includes(campaign.state) || launch.isPending}
            onClick={() => {
              setLaunchResult(null)
              launch.mutate()
            }}
          >
            <Send className="h-4 w-4" /> {launch.isPending ? 'Sending…' : 'Launch now'}
          </button>
        </div>
        {launchResult && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-cyber-green/30 bg-cyber-green/10 px-3 py-2 text-sm text-cyber-green">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Sent {launchResult.sent}, failed {launchResult.failed}
              {launchResult.remaining_pending > 0 && `, ${launchResult.remaining_pending} still pending`}.
              {launchResult.message && <> {launchResult.message}</>}
            </span>
          </div>
        )}
      </div>

      <div className="card flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Pause / resume</h3>
          <p className="text-sm text-slate-400">
            Only a running campaign can be paused; only a paused one can be resumed.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-ghost"
            disabled={campaign.state !== 'RUNNING' || pause.isPending}
            onClick={() => pause.mutate()}
          >
            <Pause className="h-4 w-4" /> Pause
          </button>
          <button
            className="btn-ghost"
            disabled={campaign.state !== 'PAUSED' || resume.isPending}
            onClick={() => resume.mutate()}
          >
            <Play className="h-4 w-4" /> Resume
          </button>
        </div>
      </div>

      <div className="card flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-foreground">
            <BarChart3 className="h-4 w-4 text-cyber-cyan" /> Monitoring
          </h3>
          <p className="text-sm text-slate-400">
            {['RUNNING', 'PAUSED', 'DONE'].includes(campaign.state)
              ? 'Open rate, click rate, submissions and reports update live as targets interact with the email.'
              : 'Available once the campaign is launched.'}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {['RUNNING', 'PAUSED', 'DONE'].includes(campaign.state) && (
            <button className="btn-ghost" onClick={() => navigate(`/campaigns/${campaign.id}/results`)}>
              <BarChart3 className="h-4 w-4" /> View results
            </button>
          )}
          {['RUNNING', 'PAUSED'].includes(campaign.state) && (
            <button className="btn-primary" disabled={complete.isPending} onClick={() => complete.mutate()}>
              <Flag className="h-4 w-4" /> {complete.isPending ? 'Closing…' : 'Mark complete'}
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-cyber-cyan" />
          <h3 className="font-semibold text-foreground">Schedule</h3>
        </div>
        <p className="mb-3 text-sm text-slate-400">
          Current: <span className="text-foreground">{formatDate(campaign.scheduled_at)}</span>
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Start date &amp; time</label>
            <input
              type="datetime-local"
              className="input"
              value={scheduleAt}
              disabled={!canSchedule}
              onChange={(e) => setScheduleAt(e.target.value)}
            />
          </div>
          <button
            className="btn-primary"
            disabled={!canSchedule || schedule.isPending}
            onClick={() => schedule.mutate()}
          >
            {schedule.isPending ? 'Saving…' : 'Save schedule'}
          </button>
        </div>
        {!canSchedule && (
          <p className="mt-2 text-xs text-slate-500">
            Scheduling is available once the campaign is READY.
          </p>
        )}
      </div>

      <div className="card border-cyber-red/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Delete campaign</h3>
            <p className="text-sm text-slate-400">
              Permanently removes the campaign, its targets and tracking data.
            </p>
          </div>
          {!confirmDelete ? (
            <button
              className="btn-danger"
              disabled={campaign.state === 'RUNNING'}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          ) : (
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button
                className="btn-danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                {remove.isPending ? 'Deleting…' : 'Confirm delete'}
              </button>
            </div>
          )}
        </div>
        {campaign.state === 'RUNNING' && (
          <p className="mt-2 text-xs text-slate-500">A running campaign cannot be deleted.</p>
        )}
      </div>
    </div>
  )
}
