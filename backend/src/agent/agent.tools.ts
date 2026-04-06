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
];
