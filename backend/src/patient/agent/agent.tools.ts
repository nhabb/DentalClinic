import OpenAI from 'openai';

export const AGENT_TOOLS: OpenAI.ChatCompletionTool[] = [
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
