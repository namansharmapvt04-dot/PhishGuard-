import { api } from './client'
import { isDemo, demoApi } from '../lib/demo'

export type CampaignState =
  | 'DRAFT'
  | 'GENERATING'
  | 'READY'
  | 'ESCALATED'
  | 'SCHEDULED'
  | 'RUNNING'
  | 'PAUSED'
  | 'DONE'

export interface AgentMetadata {
  plan_reasoning?: string
  fear_factor?: string
  urgency_trigger?: string
  eval_feedback?: string
  rag_pattern_count?: number
  // Insight-analyst fields (present only once post-campaign analysis is wired up)
  risk_level?: 'low' | 'medium' | 'high' | 'critical'
  vulnerability_summary?: string
  top_vulnerabilities?: string[]
  recommended_training?: { topic: string; priority: string; rationale: string }[]
  departments_at_risk?: string[]
  immediate_actions?: string[]
  [key: string]: unknown
}

export interface Campaign {
  id: string
  name: string
  description: string | null
  state: CampaignState
  sender_persona: string | null
  attack_vector: string | null
  target_department: string | null
  urgency_level: string | null
  email_subject: string | null
  email_body: string | null
  email_from_name: string | null
  email_from_address: string | null
  ragas_score: number | null
  retry_count: number
  agent_metadata: AgentMetadata | null
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  organization_id: string
}

export interface CampaignCreate {
  name: string
  description?: string | null
  target_department?: string | null
  urgency_level?: 'low' | 'medium' | 'high' | null
  attack_vector?: string | null
  scheduled_at?: string | null
}

export interface CampaignUpdate {
  name?: string
  description?: string | null
  scheduled_at?: string | null
}

export interface CampaignStats {
  campaign_id: string
  total_targets: number
  emails_sent: number
  opened: number
  clicked: number
  credentials_submitted: number
  reported: number
  open_rate: number
  click_rate: number
  compromise_rate: number
}

export const campaignsApi = {
  async list(): Promise<Campaign[]> {
    if (isDemo()) return demoApi.listCampaigns()
    const { data } = await api.get<Campaign[]>('/campaigns')
    return data
  },
  async get(id: string): Promise<Campaign> {
    if (isDemo()) return demoApi.getCampaign(id)
    const { data } = await api.get<Campaign>(`/campaigns/${id}`)
    return data
  },
  async create(payload: CampaignCreate): Promise<Campaign> {
    if (isDemo()) return demoApi.createCampaign(payload)
    const { data } = await api.post<Campaign>('/campaigns', payload)
    return data
  },
  async update(id: string, payload: CampaignUpdate): Promise<Campaign> {
    if (isDemo()) return demoApi.updateCampaign(id, payload)
    const { data } = await api.patch<Campaign>(`/campaigns/${id}`, payload)
    return data
  },
  async remove(id: string): Promise<void> {
    if (isDemo()) {
      await demoApi.removeCampaign(id)
      return
    }
    await api.delete(`/campaigns/${id}`)
  },
  async pause(id: string): Promise<Campaign> {
    if (isDemo()) return demoApi.setState(id, 'PAUSED')
    const { data } = await api.post<Campaign>(`/campaigns/${id}/pause`)
    return data
  },
  async resume(id: string): Promise<Campaign> {
    if (isDemo()) return demoApi.setState(id, 'RUNNING')
    const { data } = await api.post<Campaign>(`/campaigns/${id}/resume`)
    return data
  },
  async stats(id: string): Promise<CampaignStats> {
    if (isDemo()) return demoApi.stats(id)
    const { data } = await api.get<CampaignStats>(`/campaigns/${id}/stats`)
    return data
  },
}
