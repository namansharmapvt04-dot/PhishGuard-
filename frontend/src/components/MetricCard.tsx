type Tone = 'default' | 'risk' | 'good'

const TONE_CLS: Record<Tone, string> = {
  default: 'bg-navy-800 text-muted-foreground',
  risk: 'bg-cyber-red/10 text-cyber-red',
  good: 'bg-cyber-green/10 text-cyber-green',
}

export default function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'default',
}: {
  label: string
  value: string
  detail?: string
  icon: React.ComponentType<{ className?: string }>
  tone?: Tone
}) {
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 font-display text-2xl font-semibold text-foreground">{value}</p>
        </div>
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${TONE_CLS[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {detail && <p className="mt-2 text-xs text-muted-foreground">{detail}</p>}
    </div>
  )
}
