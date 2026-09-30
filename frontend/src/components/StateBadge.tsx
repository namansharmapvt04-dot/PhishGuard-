import { CampaignState } from '../api/campaigns'

const MAP: Record<CampaignState, { cls: string; label: string }> = {
  DRAFT: { cls: 'badge-gray', label: 'Draft' },
  GENERATING: { cls: 'badge-cyan', label: 'Generating' },
  READY: { cls: 'badge-blue', label: 'Ready' },
  ESCALATED: { cls: 'badge-red', label: 'Escalated' },
  SCHEDULED: { cls: 'badge-amber', label: 'Scheduled' },
  RUNNING: { cls: 'badge-green', label: 'Running' },
  PAUSED: { cls: 'badge-amber', label: 'Paused' },
  DONE: { cls: 'badge-blue', label: 'Done' },
}

export default function StateBadge({ state }: { state: CampaignState }) {
  const { cls, label } = MAP[state] ?? { cls: 'badge-gray', label: state }
  return <span className={cls}>{label}</span>
}
