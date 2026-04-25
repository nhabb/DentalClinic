import OpenAI from 'openai';

export const AGENT_TOOLS: OpenAI.ChatCompletionTool[] = [
  // ── Raw Database Query (primary fallback) ─────────────────────
  {
    type: 'function',
    function: {
      name: 'query_database',
      description:
        'PRIMARY data access tool. Run any PostgreSQL SELECT against the clinic database. ' +
        'Use this FIRST whenever: (1) a dedicated tool returns empty or incomplete results, ' +
        '(2) the user asks about data not covered by other tools, ' +
        '(3) you need to discover what values exist in a column (e.g. SELECT DISTINCT category FROM inventory_items), ' +
        '(4) any aggregation, join, count, or custom filter is needed. ' +
        'Never tell the user data does not exist without running this tool first. ' +
        'Only SELECT statements are allowed — no mutations. ' +
        'Table names: appointments, appointment_slots, patient_profiles, patient_records, ' +
        'patient_documents, users, payments, treatment_invoices, invoice_line_items, ' +
        'invoice_payments, expenses, inventory_items, inventory_movements, notifications, ' +
        'clinic_profile, audit_logs.',
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: 'A valid PostgreSQL SELECT statement without a trailing semicolon.',
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
      description: 'List appointments with optional filters. Returns appointments with patient name, doctor, date, time, status.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Filter by date (YYYY-MM-DD)' },
          status: { type: 'string', enum: ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'] },
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
  {
    type: 'function',
    function: {
      name: 'confirm_appointment',
      description: 'Confirm a scheduled appointment.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'number', description: 'Appointment ID' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_appointment',
      description: 'Mark a confirmed appointment as completed.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'number', description: 'Appointment ID' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: 'Cancel an appointment.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'Appointment ID' },
          reason: { type: 'string', description: 'Cancellation reason' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_appointment_notes',
      description: 'Update notes or reason on an appointment.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'Appointment ID' },
          notes: { type: 'string' },
          reason: { type: 'string' },
        },
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
          available_only: { type: 'boolean', description: 'Only show unbooked slots' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_slot',
      description: 'Delete an unbooked appointment slot.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'number', description: 'Slot ID' } },
        required: ['id'],
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
      description: 'Get full profile details for a patient by their patient profile ID.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'number', description: 'Patient profile ID' } },
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
          low_stock_only: { type: 'boolean', description: 'Only items below minimum quantity' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_low_stock_items',
      description: 'Get all inventory items that are below their minimum stock level.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_inventory_movements',
      description: 'List stock movement history (items added or removed from inventory). Shows item name, quantity, movement type (in/out/adjustment), date, and who performed it. Use this when asked about stock updates, restocking history, or recent inventory changes.',
      parameters: {
        type: 'object',
        properties: {
          item_id: { type: 'number', description: 'Filter movements for a specific inventory item ID' },
          movement_type: { type: 'string', enum: ['in', 'out', 'adjustment'], description: 'Filter by movement type' },
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
      description: 'List documents uploaded for a patient (X-rays, scans, reports, prescriptions). Use this when asked about patient files, photos, or documents. You must provide the patient_id (from list_patients or get_patient).',
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
  {
    type: 'function',
    function: {
      name: 'send_notification',
      description: 'Send a notification to a user.',
      parameters: {
        type: 'object',
        properties: {
          user_id: { type: 'number' },
          title: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['user_id', 'title', 'message'],
      },
    },
  },

  // ── Payments ──────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'get_financial_kpis',
      description: 'Get key financial KPIs: total income, total expenses, net profit, this-month vs last-month growth, collection rate, average invoice value.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_financial_summary',
      description: 'Get financial summary (total income, total expenses, net profit) filtered by date range.',
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
      description: 'Get monthly income/expense trends, payment method breakdown, and payment status counts.',
      parameters: {
        type: 'object',
        properties: {
          months: { type: 'number', description: 'Number of past months to include (default 12)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_outstanding_payments',
      description: 'Get all unpaid and partially paid invoices with remaining balance.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_aging_report',
      description: 'Get accounts-receivable aging report: outstanding debt bucketed by 0-30, 31-60, 61-90, and 90+ days overdue.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_patient_financials',
      description: 'Get per-patient financial summary showing total billed, total paid, outstanding balance, and collection rate. Optionally filter to one patient.',
      parameters: {
        type: 'object',
        properties: {
          patient_id: { type: 'number', description: 'Filter to a specific patient profile ID' },
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
          status: { type: 'string', enum: ['pending', 'partial', 'paid', 'refunded', 'cancelled'] },
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
      name: 'create_payment',
      description: 'Create a new payment invoice for a patient. The invoice starts as pending until payment is recorded.',
      parameters: {
        type: 'object',
        properties: {
          patient_id: { type: 'number', description: 'Patient profile ID' },
          amount: { type: 'number', description: 'Total invoice amount' },
          payment_method: { type: 'string', enum: ['cash', 'card', 'insurance', 'bank_transfer'], description: 'Default: cash' },
          description: { type: 'string', description: 'Description of the treatment or service' },
          appointment_id: { type: 'number', description: 'Optional linked appointment ID' },
        },
        required: ['patient_id', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_payment',
      description: 'Record a payment (full or partial) against an existing invoice. The amount_paid accumulates — call this each time the patient makes a payment. Status auto-updates to partial or paid.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'Payment record ID' },
          amount_paid: { type: 'number', description: 'Amount received this time (will be added to any previous payments)' },
          paid_at: { type: 'string', description: 'ISO timestamp of payment (defaults to now)' },
        },
        required: ['id', 'amount_paid'],
      },
    },
  },

  // ── Treatment Billing ─────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'list_invoices',
      description: 'List treatment invoices with optional filters. Each invoice has line items (procedures) and a payment history. Status: open = unpaid, partial = partially paid, paid = fully paid.',
      parameters: {
        type: 'object',
        properties: {
          patient_id: { type: 'number', description: 'Filter by patient profile ID' },
          status: { type: 'string', enum: ['open', 'partial', 'paid'], description: 'Filter by invoice status' },
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
      description: 'Get full details of a single treatment invoice by ID, including all line items (procedures) and complete payment history.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'number', description: 'Treatment invoice ID' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_invoice',
      description: 'Create a new treatment invoice for a patient after a procedure. Specify the procedure date, individual procedures with amounts, and optional notes. The invoice starts as "open".',
      parameters: {
        type: 'object',
        properties: {
          patient_id: { type: 'number', description: 'Patient profile ID or user ID' },
          procedure_date: { type: 'string', description: 'Date of procedure (YYYY-MM-DD)' },
          notes: { type: 'string', description: 'Optional notes about the treatment' },
          line_items: {
            type: 'array',
            description: 'List of procedures performed with their costs',
            items: {
              type: 'object',
              properties: {
                procedure_name: {
                  type: 'string',
                  enum: ['Checkup', 'X-Ray', 'Teeth Cleaning', 'Whitening', 'Tooth Extraction', 'Root Canal', 'Filling', 'Crown', 'Bridge', 'Implant', 'Orthodontic', 'Veneers', 'Gum Treatment', 'Fluoride Treatment'],
                },
                amount: { type: 'number', description: 'Cost of this procedure' },
              },
              required: ['procedure_name', 'amount'],
            },
          },
        },
        required: ['patient_id', 'procedure_date', 'line_items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_invoice_payment',
      description: 'Record a payment (full or partial) against a treatment invoice. The remaining balance updates automatically. Status changes to "partial" or "paid" as appropriate.',
      parameters: {
        type: 'object',
        properties: {
          invoice_id: { type: 'number', description: 'Treatment invoice ID' },
          amount: { type: 'number', description: 'Amount being paid now (must not exceed remaining balance)' },
          payment_method: { type: 'string', enum: ['cash', 'card', 'insurance', 'bank_transfer'], description: 'Default: cash' },
          notes: { type: 'string', description: 'Optional notes about this payment' },
        },
        required: ['invoice_id', 'amount'],
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
          category: { type: 'string', enum: ['utilities', 'rent', 'equipment', 'supplies', 'maintenance', 'other'] },
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
      name: 'create_expense',
      description: 'Record a new clinic expense (rent, utilities, equipment, etc.).',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short description of the expense' },
          category: { type: 'string', enum: ['utilities', 'rent', 'equipment', 'supplies', 'maintenance', 'other'], description: 'Default: other' },
          amount: { type: 'number', description: 'Expense amount' },
          description: { type: 'string', description: 'Additional details' },
          expense_date: { type: 'string', description: 'Date of expense (YYYY-MM-DD)' },
        },
        required: ['title', 'amount', 'expense_date'],
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
          months: { type: 'number', description: 'Number of past months to include (default 12)' },
        },
      },
    },
  },
];
