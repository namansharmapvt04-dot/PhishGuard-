/**
 * Demo / UI-preview mode.
 *
 * When enabled (a flag in localStorage), the API layer returns the mock data
 * below instead of hitting the backend, and auth is bypassed with a fake admin
 * user. This lets the whole UI be explored with no server running. None of it
 * is persisted beyond the current tab session.
 */
import type { User } from '../api/auth'
import type { Campaign, CampaignCreate, CampaignStats } from '../api/campaigns'
import type { Target, TargetActivity, TargetCreate } from '../api/targets'
import type { SSEMessage } from './sse'

const DEMO_KEY = 'pg_demo_mode'

export function isDemo(): boolean {
  try {
    return localStorage.getItem(DEMO_KEY) === '1'
  } catch {
    return false
  }
}
export function enableDemo() {
  try {
    localStorage.setItem(DEMO_KEY, '1')
  } catch {
    /* ignore */
  }
}
export function disableDemo() {
  try {
    localStorage.removeItem(DEMO_KEY)
  } catch {
    /* ignore */
  }
}

/** Simulate a little network latency so the UI's loading states show. */
export const demoDelay = <T>(value: T, ms = 350): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms))

// ── Mock user / org ───────────────────────────────────────────────────────────
export const demoUser: User = {
  id: 'demo-user',
  email: 'demo@acme-security.com',
  full_name: 'Demo Admin',
  role: 'ADMIN',
  is_active: true,
  organization: {
    id: 'demo-org',
    name: 'Acme Security',
    domain: 'acme-security.com',
    is_active: true,
  },
}

const now = Date.now()
const iso = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString()

function makeCampaign(p: Partial<Campaign> & Pick<Campaign, 'id' | 'name' | 'state'>): Campaign {
  return {
    description: null,
    sender_persona: null,
    attack_vector: null,
    target_department: null,
    urgency_level: null,
    email_subject: null,
    email_body: null,
    email_from_name: null,
    email_from_address: null,
    ragas_score: null,
    retry_count: 0,
    agent_metadata: null,
    scheduled_at: null,
    started_at: null,
    completed_at: null,
    created_at: iso(3),
    updated_at: iso(1),
    organization_id: 'demo-org',
    ...p,
  }
}

const SAMPLE_BODY = `
<div style="max-width:560px">
  <p>Hi {first_name},</p>
  <p>Our records show your <strong>{company}</strong> account password will expire in
  <strong>24 hours</strong>. To avoid being locked out of email and payroll, please
  confirm your credentials using the secure portal below.</p>
  <p style="text-align:center;margin:28px 0">
    <a href="#" style="background:#2563eb;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none">
      Verify my account
    </a>
  </p>
  <p>If you do not complete this within 24 hours, IT will suspend access as a security precaution.</p>
  <p>Regards,<br/>IT Security Team<br/>{company}</p>
</div>`

// ── Mock campaigns ────────────────────────────────────────────────────────────
const campaigns: Campaign[] = [
  makeCampaign({
    id: 'c-done',
    name: 'Q3 Finance Credential Test',
    state: 'DONE',
    description: 'Quarterly credential-harvesting simulation for the Finance team.',
    target_department: 'Finance',
    attack_vector: 'credential harvesting',
    urgency_level: 'high',
    sender_persona: 'IT Security Team',
    email_subject: 'Action required: your password expires in 24 hours',
    email_body: SAMPLE_BODY,
    email_from_name: 'Acme IT Security',
    email_from_address: 'it-security@acme-security.com',
    ragas_score: 0.86,
    completed_at: iso(1),
    started_at: iso(4),
    agent_metadata: {
      plan_reasoning:
        'Finance staff respond to authority and compliance pressure; an IT password-expiry lure exploits routine urgency.',
      fear_factor: 'account suspension / payroll lockout',
      urgency_trigger: '24-hour password expiry',
      eval_feedback: 'Strong authority cue and believable CTA.',
      rag_pattern_count: 5,
      risk_level: 'high',
      vulnerability_summary:
        'A large share of Finance clicked the link and a third submitted credentials, indicating weak resilience to authority-based urgency lures.',
      top_vulnerabilities: [
        'Credentials submitted without verifying sender domain',
        'Low reporting rate — most users did not flag the email',
        'Urgency cues bypassed normal caution',
      ],
      recommended_training: [
        { topic: 'Spotting credential-harvesting pages', priority: 'high', rationale: 'Directly addresses the submitted-credentials failure.' },
        { topic: 'Verifying sender domains', priority: 'medium', rationale: 'Reduces trust in spoofed internal senders.' },
        { topic: 'Using the report-phish button', priority: 'medium', rationale: 'Raises detection and response speed.' },
      ],
      departments_at_risk: ['Finance'],
      immediate_actions: ['Enforce MFA for Finance', 'Run a follow-up simulation in 30 days'],
    },
  }),
  makeCampaign({
    id: 'c-ready',
    name: 'IT Password Reset Drill',
    state: 'READY',
    description: 'Company-wide password reset lure, ready to schedule.',
    target_department: 'All employees',
    attack_vector: 'credential harvesting',
    urgency_level: 'medium',
    sender_persona: 'IT Helpdesk',
    email_subject: 'Scheduled password reset — confirm access',
    email_body: SAMPLE_BODY,
    email_from_name: 'Acme Helpdesk',
    email_from_address: 'helpdesk@acme-security.com',
    ragas_score: 0.79,
    agent_metadata: {
      plan_reasoning: 'A neutral helpdesk persona lowers suspicion for a broad audience.',
      fear_factor: 'loss of access',
      urgency_trigger: 'scheduled reset window',
      eval_feedback: 'Clear and professional; CTA could be subtler.',
      rag_pattern_count: 5,
    },
  }),
  makeCampaign({
    id: 'c-generating',
    name: 'HR Onboarding Lure',
    state: 'GENERATING',
    description: 'New-hire document request targeting HR.',
    target_department: 'Human Resources',
    attack_vector: 'attachment',
    urgency_level: 'low',
  }),
  makeCampaign({
    id: 'c-escalated',
    name: 'Executive Wire Transfer',
    state: 'ESCALATED',
    description: 'CEO-fraud style wire request — flagged for human review.',
    target_department: 'Executive',
    attack_vector: 'business email compromise',
    urgency_level: 'high',
    ragas_score: 0.62,
    retry_count: 3,
    agent_metadata: {
      eval_feedback: 'Tone too aggressive; urgency felt unrealistic after 3 attempts.',
      fear_factor: 'missing a deadline',
      urgency_trigger: 'same-day wire',
      rag_pattern_count: 5,
    },
  }),
  makeCampaign({
    id: 'c-draft',
    name: 'New Vendor Invoice',
    state: 'DRAFT',
    description: 'Draft invoice-payment lure for Accounts Payable.',
    target_department: 'Accounts Payable',
    attack_vector: 'invoice fraud',
    urgency_level: 'medium',
    created_at: iso(0),
  }),
]

function makeTarget(campaignId: string, p: Pick<Target, 'id' | 'email' | 'full_name'> & Partial<Target>): Target {
  return {
    department: 'Finance',
    job_title: 'Analyst',
    manager_name: 'Dana Wells',
    status: 'SENT',
    sent_at: iso(4),
    campaign_id: campaignId,
    created_at: iso(4),
    ...p,
  }
}

const targetsByCampaign: Record<string, Target[]> = {
  'c-done': [
    makeTarget('c-done', { id: 't1', full_name: 'Alice Nguyen', email: 'alice@acme-security.com', job_title: 'AP Clerk' }),
    makeTarget('c-done', { id: 't2', full_name: 'Bob Martins', email: 'bob@acme-security.com', job_title: 'Controller' }),
    makeTarget('c-done', { id: 't3', full_name: 'Carla Diaz', email: 'carla@acme-security.com', job_title: 'Analyst' }),
    makeTarget('c-done', { id: 't4', full_name: 'David Osei', email: 'david@acme-security.com', job_title: 'Treasurer' }),
    makeTarget('c-done', { id: 't5', full_name: 'Emma Fischer', email: 'emma@acme-security.com', job_title: 'Bookkeeper' }),
  ],
  'c-ready': [
    makeTarget('c-ready', { id: 't6', full_name: 'Frank Li', email: 'frank@acme-security.com', department: 'Engineering', status: 'PENDING', sent_at: null }),
    makeTarget('c-ready', { id: 't7', full_name: 'Grace Park', email: 'grace@acme-security.com', department: 'Sales', status: 'PENDING', sent_at: null }),
  ],
  'c-draft': [],
}

const statsByCampaign: Record<string, CampaignStats> = {
  'c-done': {
    campaign_id: 'c-done',
    total_targets: 5,
    emails_sent: 5,
    opened: 4,
    clicked: 3,
    credentials_submitted: 2,
    reported: 1,
    open_rate: 0.8,
    click_rate: 0.6,
    compromise_rate: 0.4,
  },
}

const activityByCampaign: Record<string, TargetActivity[]> = {
  'c-done': [
    { target_id: 't1', full_name: 'Alice Nguyen', email: 'alice@acme-security.com', opened: true, clicked: true, credentials_submitted: true, reported: false, first_event_at: iso(3) },
    { target_id: 't2', full_name: 'Bob Martins', email: 'bob@acme-security.com', opened: true, clicked: true, credentials_submitted: false, reported: false, first_event_at: iso(3) },
    { target_id: 't3', full_name: 'Carla Diaz', email: 'carla@acme-security.com', opened: true, clicked: false, credentials_submitted: false, reported: true, first_event_at: iso(2) },
    { target_id: 't4', full_name: 'David Osei', email: 'david@acme-security.com', opened: true, clicked: true, credentials_submitted: true, reported: false, first_event_at: iso(2) },
    { target_id: 't5', full_name: 'Emma Fischer', email: 'emma@acme-security.com', opened: false, clicked: false, credentials_submitted: false, reported: false, first_event_at: null },
  ],
}

// ── In-memory API surface (mutable within the session) ────────────────────────
export const demoApi = {
  listCampaigns: () => demoDelay([...campaigns]),
  getCampaign: (id: string) =>
    demoDelay(campaigns.find((c) => c.id === id) ?? campaigns[0]),
  createCampaign: (payload: CampaignCreate) => {
    const c = makeCampaign({
      id: `c-${Math.random().toString(36).slice(2, 8)}`,
      name: payload.name,
      state: 'DRAFT',
      description: payload.description ?? null,
      target_department: payload.target_department ?? null,
      attack_vector: payload.attack_vector ?? null,
      urgency_level: payload.urgency_level ?? null,
      created_at: new Date().toISOString(),
    })
    campaigns.unshift(c)
    return demoDelay(c)
  },
  updateCampaign: (id: string, patch: Partial<Campaign>) => {
    const c = campaigns.find((x) => x.id === id)
    if (c) Object.assign(c, patch)
    return demoDelay(c ?? campaigns[0])
  },
  removeCampaign: (id: string) => {
    const i = campaigns.findIndex((x) => x.id === id)
    if (i !== -1) campaigns.splice(i, 1)
    return demoDelay(undefined)
  },
  setState: (id: string, state: Campaign['state']) => {
    const c = campaigns.find((x) => x.id === id)
    if (c) c.state = state
    return demoDelay(c ?? campaigns[0])
  },
  stats: (id: string) =>
    demoDelay(
      statsByCampaign[id] ?? {
        campaign_id: id,
        total_targets: targetsByCampaign[id]?.length ?? 0,
        emails_sent: 0,
        opened: 0,
        clicked: 0,
        credentials_submitted: 0,
        reported: 0,
        open_rate: 0,
        click_rate: 0,
        compromise_rate: 0,
      },
    ),
  listTargets: (id: string) => demoDelay([...(targetsByCampaign[id] ?? [])]),
  addTarget: (id: string, payload: TargetCreate) => {
    const t = makeTarget(id, {
      id: `t-${Math.random().toString(36).slice(2, 8)}`,
      full_name: payload.full_name,
      email: payload.email,
      department: payload.department ?? null,
      job_title: payload.job_title ?? null,
      manager_name: payload.manager_name ?? null,
      status: 'PENDING',
      sent_at: null,
      created_at: new Date().toISOString(),
    })
    ;(targetsByCampaign[id] ??= []).push(t)
    return demoDelay(t)
  },
  bulkAddTargets: (id: string, rows: TargetCreate[]) => {
    const created = rows.map((r) =>
      makeTarget(id, {
        id: `t-${Math.random().toString(36).slice(2, 8)}`,
        full_name: r.full_name,
        email: r.email,
        department: r.department ?? null,
        job_title: r.job_title ?? null,
        manager_name: r.manager_name ?? null,
        status: 'PENDING',
        sent_at: null,
        created_at: new Date().toISOString(),
      }),
    )
    ;(targetsByCampaign[id] ??= []).push(...created)
    return demoDelay(created)
  },
  removeTarget: (id: string, targetId: string) => {
    const arr = targetsByCampaign[id]
    if (arr) {
      const i = arr.findIndex((t) => t.id === targetId)
      if (i !== -1) arr.splice(i, 1)
    }
    return demoDelay(undefined)
  },
  activity: (id: string) => demoDelay([...(activityByCampaign[id] ?? [])]),
}

/**
 * Fake the SSE generation stream with timers so the Generate tab animates
 * end-to-end in demo mode. Returns a cancel function.
 */
export function simulateGeneration(
  campaignId: string,
  handlers: { onMessage: (m: SSEMessage) => void; onDone?: () => void },
): () => void {
  const frames: { delay: number; msg: SSEMessage }[] = [
    { delay: 300, msg: { event: 'pipeline_started', data: { campaign_id: campaignId } } },
    { delay: 900, msg: { event: 'node_completed', data: { node: 'plan' } } },
    { delay: 1000, msg: { event: 'node_completed', data: { node: 'generate' } } },
    { delay: 1100, msg: { event: 'node_completed', data: { node: 'evaluate', ragas_score: 0.68, retry_count: 0, eval_passed: false } } },
    { delay: 700, msg: { event: 'node_completed', data: { node: 'increment_retry', retry_count: 1 } } },
    { delay: 1000, msg: { event: 'node_completed', data: { node: 'generate' } } },
    { delay: 1100, msg: { event: 'node_completed', data: { node: 'evaluate', ragas_score: 0.83, retry_count: 1, eval_passed: true } } },
    { delay: 800, msg: { event: 'node_completed', data: { node: 'personalise' } } },
    { delay: 500, msg: { event: 'state_changed', data: { state: 'READY' } } },
    { delay: 400, msg: { event: 'pipeline_completed', data: { ragas_score: 0.83, subject: 'Scheduled password reset — confirm access' } } },
  ]

  let cancelled = false
  let elapsed = 0
  const timers: ReturnType<typeof setTimeout>[] = []
  for (const f of frames) {
    elapsed += f.delay
    timers.push(
      setTimeout(() => {
        if (cancelled) return
        handlers.onMessage(f.msg)
        if (f.msg.event === 'pipeline_completed') {
          demoApi.setState(campaignId, 'READY')
          handlers.onDone?.()
        }
      }, elapsed),
    )
  }
  return () => {
    cancelled = true
    timers.forEach(clearTimeout)
  }
}
