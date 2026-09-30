import { api } from './client'

export type TargetStatus = 'PENDING' | 'SENT' | 'FAILED'

export interface Target {
  id: string
  email: string
  full_name: string
  department: string | null
  job_title: string | null
  manager_name: string | null
  status: TargetStatus
  sent_at: string | null
  campaign_id: string
  created_at: string
}

export interface TargetCreate {
  email: string
  full_name: string
  department?: string | null
  job_title?: string | null
  manager_name?: string | null
}

export interface TargetActivity {
  target_id: string
  email: string
  full_name: string
  opened: boolean
  clicked: boolean
  credentials_submitted: boolean
  reported: boolean
  first_event_at: string | null
}

export const targetsApi = {
  async list(campaignId: string): Promise<Target[]> {
    const { data } = await api.get<Target[]>(`/campaigns/${campaignId}/targets`)
    return data
  },
  async add(campaignId: string, payload: TargetCreate): Promise<Target> {
    const { data } = await api.post<Target>(`/campaigns/${campaignId}/targets`, payload)
    return data
  },
  async bulkAdd(campaignId: string, targets: TargetCreate[]): Promise<Target[]> {
    const { data } = await api.post<Target[]>(`/campaigns/${campaignId}/targets/bulk`, {
      targets,
    })
    return data
  },
  async remove(campaignId: string, targetId: string): Promise<void> {
    await api.delete(`/campaigns/${campaignId}/targets/${targetId}`)
  },
  async activity(campaignId: string): Promise<TargetActivity[]> {
    const { data } = await api.get<TargetActivity[]>(`/campaigns/${campaignId}/targets/activity`)
    return data
  },
}
