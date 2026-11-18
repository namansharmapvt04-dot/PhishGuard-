import { FormEvent, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ShieldAlert, GraduationCap } from 'lucide-react'

// Not proxied through the versioned `api` client (see api/client.ts) —
// tracking routes live at the backend origin directly, same as the pixel
// and click-redirect links embedded in the email. Empty string in dev
// falls through to Vite's own /track proxy (vite.config.ts); in production
// VITE_API_BASE_URL points at the deployed backend's origin.
const API_ORIGIN = import.meta.env.VITE_API_BASE_URL ?? ''

const INDICATORS = [
  'A false sense of urgency ("act now", a deadline, a threat of consequences)',
  "A request to enter your password or credentials outside your normal login flow",
  'A sender name or domain that looks almost right, but is not',
  'A generic greeting instead of your actual name',
  'A link whose visible text does not match where it actually goes',
]

export default function SimLanding() {
  const { token = '' } = useParams()
  const [submitted, setSubmitted] = useState(false)
  const [sending, setSending] = useState(false)

  // Deliberately uncontrolled — nothing typed into these fields is ever
  // read, held in state, or sent anywhere. Only the fact that the form was
  // submitted gets recorded.
  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSending(true)
    try {
      await fetch(`${API_ORIGIN}/track/submit/${token}`, { method: 'POST' })
    } catch {
      // Best-effort — the debrief still shows even if the request fails.
    } finally {
      setSending(false)
      setSubmitted(true)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-950 p-4">
      <div className="w-full max-w-md">
        <div className="card space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-cyber-amber/30 bg-cyber-amber/10 px-3 py-2 text-sm text-cyber-amber">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This was a simulated phishing email from your organisation&apos;s security
              awareness programme. No real credentials are collected on this page.
            </span>
          </div>

          {!submitted ? (
            <form onSubmit={onSubmit} className="space-y-4">
              <h1 className="text-lg font-semibold text-foreground">Sign in to continue</h1>
              <div>
                <label className="label">Email or username</label>
                <input type="text" className="input" placeholder="you@company.com" autoComplete="off" />
              </div>
              <div>
                <label className="label">Password</label>
                <input type="password" className="input" placeholder="••••••••" autoComplete="off" />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={sending}>
                {sending ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-cyber-cyan" />
                <h1 className="text-lg font-semibold text-foreground">
                  This was a PhishGuard security simulation
                </h1>
              </div>
              <p className="text-sm text-foreground/90">
                Nothing you typed was submitted or stored — this page never reads what's
                entered into its form. If this had been a real phishing email, you would
                have just handed your credentials to an attacker.
              </p>
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">
                  Signs this was a phishing attempt:
                </p>
                <ul className="list-inside list-disc space-y-1 text-sm text-slate-400">
                  {INDICATORS.map((indicator) => (
                    <li key={indicator}>{indicator}</li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-slate-500">
                If you receive a real email like this, report it to your security team
                instead of interacting with it.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
