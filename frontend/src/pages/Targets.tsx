import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Users, Search } from 'lucide-react'
import { campaignsApi } from '../api/campaigns'
import { targetsApi, Target, TargetActivity } from '../api/targets'
import PageHeader from '../components/PageHeader'
import Spinner from '../components/Spinner'
import { apiError } from '../api/client'

interface Row {
  target: Target
  campaignName: string
  activity?: TargetActivity
}

interface DeptGroup {
  department: string
  members: number
  riskScore: number
}

async function loadAll() {
  const campaigns = await campaignsApi.list()
  const perCampaign = await Promise.all(
    campaigns.map(async (c) => {
      const [targets, activity] = await Promise.all([
        targetsApi.list(c.id),
        targetsApi.activity(c.id).catch(() => [] as TargetActivity[]),
      ])
      const activityById = new Map(activity.map((a) => [a.target_id, a]))
      const rows: Row[] = targets.map((t) => ({
        target: t,
        campaignName: c.name,
        activity: activityById.get(t.id),
      }))
      return rows
    }),
  )
  return perCampaign.flat()
}

function riskStatus(a?: TargetActivity): 'Reported' | 'Submitted' | 'Clicked' | 'No action' {
  if (!a) return 'No action'
  if (a.credentials_submitted) return 'Submitted'
  if (a.reported) return 'Reported'
  if (a.clicked) return 'Clicked'
  return 'No action'
}

const STATUS_BADGE: Record<string, string> = {
  Submitted: 'badge-red',
  Clicked: 'badge-amber',
  Reported: 'badge-green',
  'No action': 'badge-gray',
}

export default function TargetsPage() {
  const [search, setSearch] = useState('')

  const { data, isLoading, error } = useQuery({ queryKey: ['targets-overview'], queryFn: loadAll })

  const rows = data ?? []

  const departments = useMemo<DeptGroup[]>(() => {
    const byDept = new Map<string, Row[]>()
    for (const r of rows) {
      const dept = r.target.department || 'Unassigned'
      ;(byDept.get(dept) ?? byDept.set(dept, []).get(dept)!).push(r)
    }
    return [...byDept.entries()].map(([department, deptRows]) => {
      const risky = deptRows.filter(
        (r) => r.activity?.clicked || r.activity?.credentials_submitted,
      ).length
      return {
        department,
        members: deptRows.length,
        riskScore: deptRows.length ? Math.round((risky / deptRows.length) * 100) : 0,
      }
    })
  }, [rows])

  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        `${r.target.full_name} ${r.target.department ?? ''} ${r.target.email}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [rows, search],
  )

  if (isLoading) return <Spinner full label="Loading targets…" />
  if (error) return <div className="card text-cyber-red">{apiError(error, 'Failed to load targets')}</div>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Targets"
        description="Employees added across your campaigns and how they've responded to simulations."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {departments.map((d) => (
          <div key={d.department} className="card">
            <div className="flex items-start justify-between">
              <div className="grid h-9 w-9 place-items-center rounded-md bg-navy-800">
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground">{d.members} people</span>
            </div>
            <p className="mt-4 font-medium text-foreground">{d.department}</p>
            <p className="mt-1 text-xs text-muted-foreground">{d.riskScore}% click/submit rate</p>
          </div>
        ))}
        {departments.length === 0 && (
          <div className="card col-span-full py-10 text-center text-muted-foreground">
            No targets added to any campaign yet.
          </div>
        )}
      </div>

      <div className="card overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-navy-700 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-semibold text-foreground">Employee directory</p>
            <p className="text-xs text-muted-foreground">{rows.length} target(s) across all campaigns</p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              className="input pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees"
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">No matching targets.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-navy-950">
                <th className="table-th">Employee</th>
                <th className="table-th">Department</th>
                <th className="table-th">Campaign</th>
                <th className="table-th">Last behaviour</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.target.id} className="hover:bg-navy-800">
                  <td className="table-td">
                    <div className="font-medium text-foreground">{r.target.full_name}</div>
                    <div className="text-xs text-muted-foreground">{r.target.email}</div>
                  </td>
                  <td className="table-td text-muted-foreground">{r.target.department ?? '—'}</td>
                  <td className="table-td text-muted-foreground">{r.campaignName}</td>
                  <td className="table-td">
                    <span className={STATUS_BADGE[riskStatus(r.activity)]}>{riskStatus(r.activity)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
