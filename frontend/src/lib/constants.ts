// Mirrors backend RAGAS_PASS_THRESHOLD (app/config.py). Display-only.
export const RAGAS_THRESHOLD = 0.75

// Common company departments a campaign can be targeted at. Free text is
// still accepted server-side (target_department is a plain string column),
// this just gives the create-campaign form a consistent picklist.
export const DEPARTMENTS = [
  'All employees',
  'Finance',
  'Human Resources',
  'IT',
  'Engineering',
  'Sales',
  'Marketing',
  'Legal',
  'Operations',
  'Executive',
  'Customer Support',
  'Procurement',
] as const

// Common phishing attack vectors used to simulate a campaign. Free text is
// still accepted server-side (attack_vector is a plain string column), this
// just gives the create-campaign form a consistent picklist.
export const ATTACK_VECTORS = [
  'credential harvesting',
  'business email compromise',
  'invoice fraud',
  'malicious attachment',
  'malicious link',
  'HR impersonation',
  'IT support impersonation',
  'executive impersonation',
  'vendor impersonation',
  'gift card scam',
] as const
