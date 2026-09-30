import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Shield, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { apiError } from '../api/client'

export default function Register() {
  const { register, enterDemo } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    orgName: '',
    orgDomain: '',
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setSubmitting(true)
    try {
      await register({
        email: form.email,
        password: form.password,
        full_name: form.full_name,
        organization: { name: form.orgName, domain: form.orgDomain },
      })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(apiError(err, 'Registration failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyber-blue/15">
            <Shield className="h-8 w-8 text-cyber-blue" />
          </div>
          <h1 className="text-2xl font-bold text-white">Create your organisation</h1>
          <p className="mt-1 text-sm text-slate-400">
            You'll be the admin of a new PhishGuard workspace
          </p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-cyber-red/30 bg-cyber-red/10 px-3 py-2 text-sm text-cyber-red">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Your full name</label>
              <input
                className="input"
                placeholder="Jane Doe"
                value={form.full_name}
                onChange={(e) => set('full_name', e.target.value)}
                required
                minLength={2}
              />
            </div>
            <div>
              <label className="label">Organisation</label>
              <input
                className="input"
                placeholder="Acme Inc"
                value={form.orgName}
                onChange={(e) => set('orgName', e.target.value)}
                required
                minLength={2}
              />
            </div>
            <div>
              <label className="label">Domain</label>
              <input
                className="input"
                placeholder="acme.com"
                value={form.orgDomain}
                onChange={(e) => set('orgDomain', e.target.value)}
                required
                minLength={3}
              />
            </div>
            <div className="col-span-2">
              <label className="label">Work email</label>
              <input
                type="email"
                className="input"
                placeholder="jane@acme.com"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                required
              />
            </div>
            <div className="col-span-2">
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                placeholder="At least 8 characters"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                required
                minLength={8}
              />
            </div>
          </div>

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create organisation'}
          </button>

          <div className="flex items-center gap-3 pt-1 text-xs text-slate-500">
            <span className="h-px flex-1 bg-navy-700" /> or <span className="h-px flex-1 bg-navy-700" />
          </div>
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={() => {
              enterDemo()
              navigate('/dashboard', { replace: true })
            }}
          >
            Explore the demo (no backend needed)
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-cyber-cyan hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
