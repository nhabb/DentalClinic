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
