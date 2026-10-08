/**
 * COPY of client-app/backend/src/shared/authorization/permissions.ts.
 *
 * The platform console edits clinic roles, so it needs the same catalog the
 * clinic API enforces. The two backends build separately, so the file is
 * duplicated here and permissions.sync.spec.ts fails the moment they differ:
 * change the clinic file first, then copy it here.
 */
/**
 * The permission catalog: every capability of the clinic API, named
 * `<area>:<action>`. Controllers declare which one they need; a clinic's roles
 * are sets of these. The catalog is code because endpoints are code; which role
 * holds which permission is data (roles / role_permissions), editable per clinic.
 */
export interface PermissionDefinition {
  key: string;
  label: string;
}

export interface PermissionGroup {
  key: string;
  label: string;
  permissions: PermissionDefinition[];
}

export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  {
    key: 'appointments',
    label: 'Appointments',
    permissions: [
      { key: 'appointments:read', label: 'View appointments and slots' },
      {
        key: 'appointments:write',
        label: 'Book, confirm, complete, cancel and annotate appointments',
      },
      { key: 'slots:manage', label: 'Create and delete appointment slots' },
    ],
  },
  {
    key: 'patients',
    label: 'Patients',
    permissions: [
      { key: 'patients:read', label: 'View patient profiles' },
      {
        key: 'patients:write',
        label: 'Create and edit patients, send setup links, change status',
      },
      { key: 'patients:delete', label: 'Delete patients and all their data' },
    ],
  },
  {
    key: 'clinical',
    label: 'Clinical records',
    permissions: [
      {
        key: 'records:read',
        label: 'View clinical records and the dental chart',
      },
      {
        key: 'records:write',
        label: 'Add, edit and delete clinical records and chart work',
      },
      {
        key: 'documents:read',
        label: 'View patient documents (x-rays, scans, reports)',
      },
      { key: 'documents:write', label: 'Upload and delete patient documents' },
    ],
  },
  {
    key: 'billing',
    label: 'Billing',
    permissions: [
      {
        key: 'billing:read',
        label: 'View invoices, payments and financial reports',
      },
      { key: 'billing:write', label: 'Create invoices and record payments' },
      { key: 'billing:delete', label: 'Delete invoices' },
    ],
  },
  {
    key: 'expenses',
    label: 'Expenses',
    permissions: [
      { key: 'expenses:read', label: 'View expenses' },
      {
        key: 'expenses:write',
        label: 'Record, edit and delete expenses and their payments',
      },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    permissions: [
      { key: 'inventory:read', label: 'View stock and movements' },
      {
        key: 'inventory:write',
        label: 'Add items, record movements, edit and delete stock',
      },
    ],
  },
  {
    key: 'team',
    label: 'Team and clinic',
    permissions: [
      { key: 'staff:read', label: 'View staff accounts' },
      {
        key: 'staff:manage',
        label: 'Create staff, change their role or branch, delete accounts',
      },
      { key: 'roles:manage', label: 'Edit roles and permissions' },
      { key: 'branches:manage', label: 'Open, edit and close branches' },
      { key: 'clinic:settings', label: 'Edit the clinic profile and logo' },
    ],
  },
  {
    key: 'external',
    label: 'Specialists and lab',
    permissions: [
      {
        key: 'specialists:read',
        label: 'View outside specialists and consultations',
      },
      {
        key: 'specialists:write',
        label: 'Add specialists, request and update consultations',
      },
      { key: 'lab:read', label: 'View dental labs and lab orders' },
      { key: 'lab:write', label: 'Add labs, place and update lab orders' },
    ],
  },
  {
    key: 'tools',
    label: 'Tools',
    permissions: [{ key: 'agent:use', label: 'Use the AI assistant' }],
  },
];

export const ALL_PERMISSIONS: readonly string[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key),
);

export const isKnownPermission = (key: string): boolean => ALL_PERMISSIONS.includes(key);

/**
 * Roles every clinic starts with. `admin` is locked: it always holds every
 * permission so a clinic can never lock itself out. `patient` holds none:
 * patient routes are governed by ownership, not permissions.
 */
export interface DefaultRole {
  key: string;
  name: string;
  description: string;
  permissions: readonly string[];
}

export const ADMIN_ROLE_KEY = 'admin';
export const PATIENT_ROLE_KEY = 'patient';

export const DEFAULT_ROLES: readonly DefaultRole[] = [
  {
    key: ADMIN_ROLE_KEY,
    name: 'Administrator',
    description: 'Runs the clinic. Always has every permission.',
    permissions: ALL_PERMISSIONS,
  },
  {
    key: 'doctor',
    name: 'Doctor',
    description: 'Treats patients: appointments, records, charts, billing.',
    permissions: [
      'appointments:read',
      'appointments:write',
      'slots:manage',
      'patients:read',
      'patients:write',
      'records:read',
      'records:write',
      'documents:read',
      'documents:write',
      'billing:read',
      'billing:write',
      'inventory:read',
      'inventory:write',
      'expenses:read',
      'staff:read',
      'specialists:read',
      'specialists:write',
      'lab:read',
      'lab:write',
      'agent:use',
    ],
  },
  {
    key: 'secretary',
    name: 'Secretary',
    description: 'Front desk: scheduling, patients, payments, stock and expenses.',
    permissions: [
      'appointments:read',
      'appointments:write',
      'slots:manage',
      'patients:read',
      'patients:write',
      'records:read',
      'documents:read',
      'billing:read',
      'billing:write',
      'expenses:read',
      'expenses:write',
      'inventory:read',
      'inventory:write',
      'staff:read',
      'specialists:read',
      'specialists:write',
      'lab:read',
      'lab:write',
      'agent:use',
    ],
  },
  {
    key: PATIENT_ROLE_KEY,
    name: 'Patient',
    description: 'Sees and manages only their own data.',
    permissions: [],
  },
];
