import { Loader2 } from 'lucide-react'

export default function Spinner({ label, full }: { label?: string; full?: boolean }) {
  return (
    <div
      className={
        full
          ? 'flex h-full min-h-[50vh] flex-col items-center justify-center gap-3'
          : 'flex items-center gap-2 text-slate-400'
      }
    >
      <Loader2 className="h-5 w-5 animate-spin text-cyber-cyan" />
      {label && <span className="text-sm text-slate-400">{label}</span>}
    </div>
  )
}
