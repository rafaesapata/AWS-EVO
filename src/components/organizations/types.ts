/**
 * Types for Organizations management
 */

export interface Organization {
  id: string;
  name: string;
  description: string;
  domain: string;
  status: 'active' | 'inactive' | 'suspended';
  created_at: string;
  updated_at: string;
  user_count: number;
  aws_account_count: number;
  monthly_cost: number;
  billing_email: string;
  admin_users: string[];
  demo_mode?: boolean;
  demo_activated_at?: string | null;
  demo_expires_at?: string | null;
}

export interface OrganizationUser {
  id: string;
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
  email?: string;
}

export interface OrganizationLicense {
  id: string;
  license_key: string;
  customer_id: string | null;
  plan_type: string;
  product_type: string | null;
  max_accounts: number;
  max_users: number;
  used_seats: number;
  available_seats: number;
  assigned_seats: number;
  features: string[];
  valid_from: string;
  valid_until: string;
  is_active: boolean;
  is_trial: boolean;
  is_expired: boolean;
  days_remaining: number | null;
  last_sync_at: string | null;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface LicensesResponse {
  licenses: OrganizationLicense[];
  config: {
    customer_id: string;
    auto_sync: boolean;
    last_sync_at: string | null;
    sync_status: string | null;
    sync_error: string | null;
  } | null;
  summary: {
    total_licenses: number;
    active_licenses: number;
    expired_licenses: number;
    trial_licenses: number;
    total_max_users: number;
    total_used_seats: number;
  };
}

export interface SeatAssignment {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  user_role: string;
  license_id: string;
  license_key: string;
  license_plan: string;
  license_product: string | null;
  license_active: boolean;
  assigned_at: string;
  assigned_by: string | null;
}

export interface SeatAssignmentsResponse {
  seat_assignments: SeatAssignment[];
  total: number;
}

export interface OrganizationDetails {
  id: string;
  name: string;
  slug: string;
  contact_email?: string;
  created_at: string;
  updated_at: string;
  demo_mode: boolean;
  demo_activated_at: string | null;
  demo_expires_at: string | null;
  demo_activated_by: string | null;
  user_count: number;
  aws_account_count: number;
  azure_account_count: number;
  security_scan_count: number;
  license_count: number;
  admin_users: Array<{
    user_id: string;
    full_name: string | null;
    email?: string;
    role: string | null;
  }>;
  aws_credentials: Array<{
    id: string;
    account_id: string | null;
    account_name: string | null;
    is_active: boolean;
    created_at: string;
  }>;
  azure_credentials: Array<{
    id: string;
    subscription_id: string | null;
    subscription_name: string | null;
    tenant_id: string | null;
    is_active: boolean;
    created_at: string;
  }>;
  primary_license: {
    id: string;
    license_key: string;
    customer_id: string | null;
    plan_type: string;
    product_type: string | null;
    max_users: number;
    used_seats: number;
    assigned_seats: number;
    is_active: boolean;
    is_trial: boolean;
    is_expired: boolean;
    days_remaining: number | null;
    valid_from: string;
    valid_until: string;
  } | null;
  license_config: {
    customer_id: string;
    auto_sync: boolean;
    last_sync_at: string | null;
    sync_status: string | null;
    sync_error: string | null;
  } | null;
}

export interface NewOrganization {
  name: string;
  description: string;
  domain: string;
  billing_email: string;
}
