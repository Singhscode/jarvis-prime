export type SourceStatus = 'available' | 'stale' | 'unavailable' | 'not_configured';

export type SourceState = {
  label: string;
  status: SourceStatus;
  source: string;
  window: string;
  asOf: string;
  reason?: string;
  value?: number;
};

export type OwnerDashboard = {
  asOf: string;
  window: 'today';
  metrics: SourceState[];
  attention: SourceState & { items: [] };
  recentActivity: SourceState & { items: [] };
  health: SourceState;
};

export type OwnerBootstrap = {
  identity: { email: string };
  capabilities: { overview: 'available' };
};

export type ApiBody<T> = { success: true; data: T };
export type ClientAccountEmailEligibility = { eligibility: 'available' | 'owner_crm_email_exists' | 'email_unavailable' | 'existing_client' | 'resend_available' };


export type OwnerPage<T> = { items: T[]; pageInfo: { nextCursor: string | null; hasNextPage: boolean } };
export type OwnerCompany = { id: string; name: string; created_at: string; updated_at: string };
export type OwnerContact = { id: string; name: string; email: string | null; phone: string | null; title: string | null; company_id: string | null; client_id: string | null; created_at: string; updated_at: string };
export type OwnerLead = { id: string; contact_id: string; created_at: string };
export type OwnerClient = { id: string; client_code: string; name: string; created_at: string; updated_at: string };
export type ClientPortalMembership = { id: string; status: 'pending' | 'active' | 'revoked'; created_at: string; updated_at: string; activated_at: string | null; revoked_at: string | null; contact: Pick<OwnerContact, 'id' | 'name' | 'email' | 'title'> | null };
export type ClientPortalAdministration = { memberships: ClientPortalMembership[]; pageInfo: { nextCursor: string | null; hasNextPage: boolean }; activity: { status: SourceStatus; source: string; asOf: string; reason?: string; items: { id: string; label: string; status: string; timestamp: string }[] } };


export type OwnerUnavailableField = { label: string; status: 'unavailable'; source: string; window: string; asOf: string; reason: string };
export type OwnerProject = { id: string; name: string; client: Pick<OwnerClient, 'id' | 'name'> | null; status: OwnerUnavailableField; progress: OwnerUnavailableField };
export type OwnerTask = {
  id: string;
  name: string;
  completed: boolean;
  assignee: { id: string; fullName: string | null; email: string } | null;
  project: { id: string; name: string; client: Pick<OwnerClient, 'id' | 'name'> | null };
  status: OwnerUnavailableField;
  priority: OwnerUnavailableField;
  dueDate: OwnerUnavailableField;
  progress: OwnerUnavailableField;
};
export type OwnerProjectDetail = { project: OwnerProject; tasks: OwnerPage<OwnerTask> };


export type OwnerWorkload = { status: 'available'; source: 'crm_tasks'; window: 'current'; asOf: string; definition: string; assigned: number; open: number; completed: number };
export type OwnerEmployee = { id: string; employeeCode: string; fullName: string | null; email: string; status: 'active' | 'pending_verification'; workload: OwnerWorkload; availability: OwnerUnavailableField; performance: OwnerUnavailableField };
export type OwnerEmployeeDetail = { employee: OwnerEmployee; projects: OwnerTask['project'][]; assignments: OwnerPage<OwnerTask> };


export type OwnerDocument = { id: string; title: string; documentType: 'deliverable' | 'report'; client: Pick<OwnerClient, 'id' | 'name'> | null; project: { id: string; name: string } | null; visibility: 'visible' | 'revoked'; createdAt: string; revokedAt: string | null };
export type OwnerAuditEvent = { id: string; label: string; category: 'security' | 'invitations' | 'employees' | 'automation' | 'documents'; action: string; success: boolean; resourceType: string | null; resourceId: string | null; createdAt: string };
export type OwnerSettingStatus = { label: string; status: SourceStatus; source: string; asOf: string; reason?: string; value?: string };
export type OwnerSettingsStatus = { asOf: string; api: OwnerSettingStatus; environment: OwnerSettingStatus; companyProfile: OwnerSettingStatus; branding: OwnerSettingStatus; integrations: OwnerSettingStatus; editableSettings: OwnerSettingStatus };
export type OwnerSearchResult = { id: string; label: string; detail?: string; href: string };
export type OwnerSearchGroup = { type: string; status: 'available' | 'unavailable'; items: OwnerSearchResult[]; reason?: string };
export type OwnerSearch = { asOf: string; groups: OwnerSearchGroup[] };
