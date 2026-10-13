/** Shapes returned by platform/backend. Ids are strings (BigInt serialised). */

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  branches: number;
  staff: number;
  patients: number;
  appointments: number;
  revenue_collected: number;
  last_activity_at: string | null;
}

export interface Branch {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  opening_hours: string | null;
  is_default: boolean;
  is_active: boolean;
}

export interface StaffMember {
  id: string;
  email: string | null;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  must_set_password: boolean;
  branch_id: string | null;
  restrict_to_branch: boolean;
  created_at: string;
}

export interface MonthlyActivity {
  month: string;
  appointments: number;
  collected: number;
}

export interface OrganizationDetail {
  id: string;
  name: string;
  slug: string;
  legal_name: string | null;
  email: string | null;
  phone: string | null;
  website_url: string | null;
  description: string | null;
  timezone: string;
  currency: string;
  is_active: boolean;
  created_at: string;
  branches: Branch[];
  staff: StaffMember[];
  stats: {
    patients: number;
    appointments: number;
    invoices: number;
    revenue_collected: number;
    outstanding: number;
  };
  monthly: MonthlyActivity[];
}

export interface Invite {
  link: string;
  expires_at: string;
}

export interface OnboardResult extends OrganizationDetail {
  owner: { id: string; email: string; first_name: string; last_name: string } | null;
  invite: Invite | null;
}

export interface PlatformOverview {
  organizations: { total: number; active: number; new_this_month: number };
  branches: number;
  patients: number;
  staff: number;
  appointments_this_month: number;
  revenue_this_month: number;
  revenue_all_time: number;
  monthly: { month: string; new_organizations: number; appointments: number; collected: number }[];
}

export interface PlatformAdmin {
  id: string;
  email: string | null;
  first_name: string;
  last_name: string;
  is_active: boolean;
  created_at: string;
}

/** Any user of a clinic as the platform sees it (staff or patient). */
export interface Account {
  id: string;
  organization_id: string;
  email: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  must_set_password: boolean;
  password_setup_expires_at: string | null;
  branch_id: string | null;
  restrict_to_branch: boolean;
  created_at: string;
  organization: { id: string; name: string; slug: string };
  branch: { id: string; name: string } | null;
}

export interface Paged<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface PasswordResetResult {
  invite: Invite;
  emailed: boolean;
}

export interface Permission {
  key: string;
  label: string;
}

export interface PermissionGroup {
  key: string;
  label: string;
  permissions: Permission[];
}

export interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  /** Admin: permissions cannot be edited. Patient: cannot be given to staff. */
  locked: boolean;
  permissions: string[];
  users_count: number;
}

/** Assistant token usage (GET /ai-usage). Costs are estimates from list prices. */
export interface UsageTotals {
  questions: number;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost_usd: number;
}

export interface ClinicUsage extends UsageTotals {
  organization: { id: string; name: string; slug: string; is_active: boolean };
  accounts: { total: number; staff: number; ai_users: number };
  last_used_at: string | null;
}

export interface AccountUsage extends UsageTotals {
  user: { id: string; first_name: string; last_name: string; email: string | null; role: string; is_active: boolean };
  rounds: number;
  tool_calls: number;
  last_used_at: string | null;
}

export interface UsageOverview {
  days: number;
  since: string;
  totals: UsageTotals & { clinics_using: number; accounts_using: number };
  clinics: ClinicUsage[];
}

export interface ClinicUsageDetail {
  days: number;
  since: string;
  organization: ClinicUsage["organization"];
  totals: UsageTotals & { accounts_using: number };
  accounts: AccountUsage[];
}

/** One answered question (GET /ai-usage/accounts/:userId). The text is never stored. */
export interface QuestionUsage {
  id: string;
  asked_at: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  rounds: number;
  tool_calls: number;
  duration_ms: number;
  estimated_cost_usd: number;
}

export interface AccountUsageDetail {
  days: number;
  since: string;
  user: AccountUsage["user"] & { organization: ClinicUsage["organization"] };
  totals: UsageTotals;
  questions: QuestionUsage[];
}
