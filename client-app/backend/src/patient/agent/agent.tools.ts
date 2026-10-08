import OpenAI from 'openai';

/**
 * Tools the clinic assistant can call. Every tool must be labelled with the
 * permission it needs in agent-access.ts (TOOL_PERMISSIONS); the model only
 * sees the tools the current user is allowed to use.
 */
export const AGENT_TOOLS: OpenAI.ChatCompletionFunctionTool[] = [
  // ── Permissions and roles ─────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_my_permissions',
      description:
        'What the current user is allowed to do: their role plus the permissions it holds and lacks, with labels. ' +
        'Use it for questions like "what can I do?", "can I delete invoices?" or "why can\'t I see expenses?".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_roles',
      description:
        'List every role of this clinic with its permissions and how many users hold it. ' +
        'Use it for questions about what other roles (doctor, secretary, custom roles) can do, or which role to give someone.',
      parameters: { type: 'object', properties: {} },
    },
  },

  // ── Raw Database Query (fallback) ─────────────────────────────
  {
    type: 'function',
    function: {
      name: 'query_database',
      description:
        'Run a PostgreSQL SELECT against the clinic database when no dedicated tool fits: ' +
        'aggregations, joins, counts, custom filters, or discovering what values exist in a column ' +
        '(e.g. SELECT DISTINCT category FROM inventory_items). ' +
        'Only SELECT statements are allowed, and only over tables the current user may read: ' +
        'a query touching a table outside their permissions is refused with the permission name. ' +
        'Table names: organizations, branches, appointments, appointment_slots, patient_profiles, ' +
        'patient_records, patient_documents, users, treatment_invoices, invoice_line_items, ' +
        'invoice_payments, expenses, expense_payments, inventory_items, inventory_movements, notifications, ' +
        'clinic_profile, roles, role_permissions, audit_logs. Rows are already limited to the current clinic organization; ' +
        'branch_id identifies the clinic location (branches.name).',
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description:
              'A valid PostgreSQL SELECT statement without a trailing semicolon.',
          },
        },
        required: ['sql'],
      },
    },
  },

  // ── Appointments ──────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'list_appointments',
      description:
        'List appointments with optional filters. Returns appointments with patient name, doctor, date, time, status.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Filter by date (YYYY-MM-DD)' },
          status: {
            type: 'string',
            enum: [
              'scheduled',
              'confirmed',
              'completed',
              'cancelled',
              'no_show',
            ],
          },
          doctor_id: { type: 'number', description: 'Filter by doctor ID' },
          patient_id: { type: 'number', description: 'Filter by patient ID' },
          page: { type: 'number' },
          limit: { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_appointment',
      description: 'Get full details of a single appointment by ID.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'number', description: 'Appointment ID' } },
        required: ['id'],
      },
    },
  },

  // ── Appointment Slots ─────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'list_slots',
      description: 'List appointment slots for a doctor on a specific date.',
      parameters: {
        type: 'object',
        properties: {
          doctor_id: { type: 'number' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
          available_only: {
            type: 'boolean',
            description: 'Only show unbooked slots',
          },
        },
      },
    },
  },

  // ── Patients ──────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'list_patients',
      description: 'List all patients with optional search by name.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          page: { type: 'number' },
          limit: { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_patient',
      description:
        'Get full profile details for a patient by their patient profile ID.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'Patient profile ID' },
        },
        required: ['id'],
      },
    },
  },

  // ── Inventory ─────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'list_inventory',
      description: 'List inventory items with optional filters.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          category: { type: 'string' },
          low_stock_only: {
            type: 'boolean',
            description: 'Only items below minimum quantity',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_low_stock_items',
      description:
        'Get all inventory items that are below their minimum stock level.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_inventory_movements',
      description:
        'List stock movement history (items added or removed from inventory). Shows item name, quantity, movement type (in/out/adjustment), date, and who performed it. Use this when asked about stock updates, restocking history, or recent inventory changes.',
      parameters: {
        type: 'object',
        properties: {
          item_id: {
            type: 'number',
            description: 'Filter movements for a specific inventory item ID',
          },
          movement_type: {
            type: 'string',
            enum: ['in', 'out', 'adjustment'],
            description: 'Filter by movement type',
          },
          page: { type: 'number' },
          limit: { type: 'number' },
        },
      },
    },
  },

  // ── Patient Documents ─────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'list_patient_documents',
      description:
        'List documents uploaded for a patient (X-rays, scans, reports, prescriptions). Use this when asked about patient files, photos, or documents. You must provide the patient_id (from list_patients or get_patient).',
      parameters: {
        type: 'object',
        properties: {
          patient_id: { type: 'number', description: 'Patient profile ID' },
          page: { type: 'number' },
          limit: { type: 'number' },
        },
        required: ['patient_id'],
      },
    },
  },

  // ── Doctors ───────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'list_doctors',
      description: 'List all doctors in the clinic.',
      parameters: { type: 'object', properties: {} },
    },
  },

  // ── Notifications ─────────────────────────────────────────────

  // ── Payments ──────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_financial_kpis',
      description:
        'Get key financial KPIs: total income, total expenses, net profit, this-month vs last-month growth, collection rate, average invoice value.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_financial_summary',
      description:
        'Get financial summary (total income, total expenses, net profit) filtered by date range.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Start date YYYY-MM-DD' },
          to: { type: 'string', description: 'End date YYYY-MM-DD' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_payments_analytics',
      description:
        'Get monthly income/expense trends, payment method breakdown, and payment status counts.',
      parameters: {
        type: 'object',
        properties: {
          months: {
            type: 'number',
            description: 'Number of past months to include (default 12)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_outstanding_payments',
      description:
        'Get all unpaid and partially paid invoices with remaining balance.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_aging_report',
      description:
        'Get accounts-receivable aging report: outstanding debt bucketed by 0-30, 31-60, 61-90, and 90+ days overdue.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_patient_financials',
      description:
        'Get per-patient financial summary showing total billed, total paid, outstanding balance, and collection rate. Optionally filter to one patient.',
      parameters: {
        type: 'object',
        properties: {
          patient_id: {
            type: 'number',
            description: 'Filter to a specific patient profile ID',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_payments',
      description: 'List payment records with optional filters.',
      parameters: {
        type: 'object',
        properties: {
          patient_id: { type: 'number' },
          status: {
            type: 'string',
            enum: ['pending', 'partial', 'paid', 'refunded', 'cancelled'],
          },
          from: { type: 'string', description: 'Start date YYYY-MM-DD' },
          to: { type: 'string', description: 'End date YYYY-MM-DD' },
          page: { type: 'number' },
          limit: { type: 'number' },
        },
      },
    },
  },

  // ── Treatment Billing ─────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'list_invoices',
      description:
        'List treatment invoices with optional filters. Each invoice has line items (procedures) and a payment history. Status: open = unpaid, partial = partially paid, paid = fully paid.',
      parameters: {
        type: 'object',
        properties: {
          patient_id: {
            type: 'number',
            description: 'Filter by patient profile ID',
          },
          status: {
            type: 'string',
            enum: ['open', 'partial', 'paid'],
            description: 'Filter by invoice status',
          },
          from: { type: 'string', description: 'Start date YYYY-MM-DD' },
          to: { type: 'string', description: 'End date YYYY-MM-DD' },
          page: { type: 'number' },
          limit: { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_invoice',
      description:
        'Get full details of a single treatment invoice by ID, including all line items (procedures) and complete payment history.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'Treatment invoice ID' },
        },
        required: ['id'],
      },
    },
  },

  // ── Expenses ──────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'list_expenses',
      description: 'List clinic expense records with optional filters.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: [
              'utilities',
              'rent',
              'equipment',
              'supplies',
              'maintenance',
              'other',
            ],
          },
          from: { type: 'string', description: 'Start date YYYY-MM-DD' },
          to: { type: 'string', description: 'End date YYYY-MM-DD' },
          page: { type: 'number' },
          limit: { type: 'number' },
        },
      },
    },
  },

  {
    type: 'function',
    function: {
      name: 'get_expenses_analytics',
      description: 'Get monthly expense trends and breakdown by category.',
      parameters: {
        type: 'object',
        properties: {
          months: {
            type: 'number',
            description: 'Number of past months to include (default 12)',
          },
        },
      },
    },
  },
];
