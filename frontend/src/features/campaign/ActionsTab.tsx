import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pause, Play, CalendarClock, Trash2, AlertCircle } from 'lucide-react'
import { campaignsApi, Campaign } from '../../api/campaigns'
import { apiError } from '../../api/client'
import { formatDate } from '../../lib/format'

export default function ActionsTab({ campaign }: { campaign: Campaign }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [scheduleAt, setScheduleAt] = useState(
    campaign.scheduled_at ? campaign.scheduled_at.slice(0, 16) : '',
  )

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['campaign', campaign.id] })
    qc.invalidateQueries({ queryKey: ['campaigns'] })
  }

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

      <div className="card flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-white">Pause / resume</h3>
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

      <div className="card">
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-cyber-cyan" />
          <h3 className="font-semibold text-white">Schedule</h3>
        </div>
        <p className="mb-3 text-sm text-slate-400">
          Current: <span className="text-slate-200">{formatDate(campaign.scheduled_at)}</span>
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
            <h3 className="font-semibold text-white">Delete campaign</h3>
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
