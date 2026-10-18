/**
 * The permission catalog: every capability of the clinic API, named
 * `<area>:<action>`. Controllers declare which one they need; a clinic's roles
 * are sets of these. The catalog is code because endpoints are code; which role
 * holds which permission is data (roles / role_permissions), editable per clinic.
 *
 * Actions follow CRUD: `read` to view, `create` to add, `edit` to change,
 * `delete` to remove. An area only lists the actions it has routes for (patient
 * documents are uploaded and deleted, never edited), and a few capabilities are
 * not CRUD at all (`clinic:settings`, `pricing:read`, `agent:use`).
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
      { key: 'appointments:create', label: 'Book appointments' },
      {
        key: 'appointments:edit',
        label: 'Confirm, complete, mark no-show and annotate appointments',
      },
      {
        key: 'appointments:delete',
        label: 'Cancel appointments and free the slot',
      },
      { key: 'slots:create', label: 'Open appointment slots' },
      { key: 'slots:delete', label: 'Remove appointment slots' },
    ],
  },
  {
    key: 'patients',
    label: 'Patients',
    permissions: [
      { key: 'patients:read', label: 'View patient profiles' },
      {
        key: 'patients:create',
        label: 'Add patients and send portal setup links',
      },
      { key: 'patients:edit', label: 'Edit patient details, photo and status' },
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
        key: 'records:create',
        label: 'Add clinical records and plan chart work',
      },
      { key: 'records:edit', label: 'Edit records and complete chart work' },
      {
        key: 'records:delete',
        label: 'Delete clinical records and chart work',
      },
      {
        key: 'documents:read',
        label: 'View patient documents (x-rays, scans, reports)',
      },
      { key: 'documents:create', label: 'Upload patient documents' },
      { key: 'documents:delete', label: 'Delete patient documents' },
    ],
  },
  {
    key: 'billing',
    label: 'Billing',
    permissions: [
      {
        key: 'billing:read',
        label: 'View invoices, quotes, payments and financial reports',
      },
      {
        key: 'pricing:read',
        label:
          'View treatment prices, lab costs, specialist fees and stock costs',
      },
      {
        key: 'billing:create',
        label: 'Create invoices and quotes, and record payments',
      },
      {
        key: 'billing:edit',
        label: 'Edit and decide quotes, refund and void invoices',
      },
      {
        key: 'billing:delete',
        label: 'Delete invoices, payments and draft quotes',
      },
    ],
  },
  {
    key: 'expenses',
    label: 'Expenses',
    permissions: [
      { key: 'expenses:read', label: 'View expenses' },
      { key: 'expenses:create', label: 'Record expenses and their payments' },
      { key: 'expenses:edit', label: 'Edit expenses' },
      { key: 'expenses:delete', label: 'Delete expenses and their payments' },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    permissions: [
      { key: 'inventory:read', label: 'View stock and movements' },
      { key: 'inventory:create', label: 'Add items and record movements' },
      { key: 'inventory:edit', label: 'Edit items and their photo' },
      { key: 'inventory:delete', label: 'Delete stock items' },
    ],
  },
  {
    key: 'team',
    label: 'Team and clinic',
    permissions: [
      { key: 'staff:read', label: 'View staff accounts and roles' },
      {
        key: 'staff:create',
        label: 'Create staff accounts and issue set-password links',
      },
      {
        key: 'staff:edit',
        label: 'Change a staff role, branch or active state',
      },
      { key: 'staff:delete', label: 'Delete staff accounts' },
      { key: 'roles:create', label: 'Add roles' },
      { key: 'roles:edit', label: 'Edit roles and their permissions' },
      { key: 'roles:delete', label: 'Delete roles' },
      { key: 'branches:create', label: 'Open branches' },
      { key: 'branches:edit', label: 'Edit branches and set the default' },
      { key: 'branches:delete', label: 'Close branches' },
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
        key: 'specialists:create',
        label: 'Add specialists and request consultations',
      },
      {
        key: 'specialists:edit',
        label: 'Edit specialists and update consultations',
      },
      {
        key: 'specialists:delete',
        label: 'Delete specialists and consultations',
      },
      { key: 'lab:read', label: 'View dental labs and lab orders' },
      { key: 'lab:create', label: 'Add labs and place lab orders' },
      { key: 'lab:edit', label: 'Edit labs and update lab orders' },
      { key: 'lab:delete', label: 'Delete labs and lab orders' },
    ],
  },
  {
    key: 'tools',
    label: 'Tools',
    permissions: [{ key: 'agent:use', label: 'Use the AI assistant' }],
  },
];

export const ALL_PERMISSIONS: readonly string[] = PERMISSION_GROUPS.flatMap(
  (g) => g.permissions.map((p) => p.key),
);

export const isKnownPermission = (key: string): boolean =>
  ALL_PERMISSIONS.includes(key);

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
/** The role offered for booking: the only staff who take appointments. */
export const DOCTOR_ROLE_KEY = 'doctor';

export const DEFAULT_ROLES: readonly DefaultRole[] = [
  {
    key: ADMIN_ROLE_KEY,
    name: 'Administrator',
    description: 'Runs the clinic. Always has every permission.',
    permissions: ALL_PERMISSIONS,
  },
  {
    key: DOCTOR_ROLE_KEY,
    name: 'Doctor',
    description: 'Treats patients: appointments, records, charts, billing.',
    permissions: [
      'appointments:read',
      'appointments:create',
      'appointments:edit',
      'appointments:delete',
      'slots:create',
      'slots:delete',
      'patients:read',
      'patients:create',
      'patients:edit',
      'records:read',
      'records:create',
      'records:edit',
      'records:delete',
      'documents:read',
      'documents:create',
      'documents:delete',
      'billing:read',
      'pricing:read',
      'billing:create',
      'billing:edit',
      'inventory:read',
      'inventory:create',
      'inventory:edit',
      'inventory:delete',
      'expenses:read',
      'staff:read',
      'specialists:read',
      'specialists:create',
      'specialists:edit',
      'specialists:delete',
      'lab:read',
      'lab:create',
      'lab:edit',
      'lab:delete',
      'agent:use',
    ],
  },
  {
    key: 'secretary',
    name: 'Secretary',
    description:
      'Front desk: scheduling, patients, payments, stock and expenses.',
    permissions: [
      'appointments:read',
      'appointments:create',
      'appointments:edit',
      'appointments:delete',
      'slots:create',
      'slots:delete',
      'patients:read',
      'patients:create',
      'patients:edit',
      'records:read',
      'documents:read',
      'billing:read',
      'pricing:read',
      'billing:create',
      'billing:edit',
      'expenses:read',
      'expenses:create',
      'expenses:edit',
      'expenses:delete',
      'inventory:read',
      'inventory:create',
      'inventory:edit',
      'inventory:delete',
      'staff:read',
      'specialists:read',
      'specialists:create',
      'specialists:edit',
      'specialists:delete',
      'lab:read',
      'lab:create',
      'lab:edit',
      'lab:delete',
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
