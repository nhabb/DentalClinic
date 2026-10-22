/**
 * API Endpoints Configuration
 *
 * This file contains all API endpoint URLs used by the frontend.
 * Backend developers should implement these endpoints to match this contract.
 *
 * Base URL: same origin; next.config.ts forwards /api/* to the backend
 */

export const API_BASE_URL = "";

/**
 * API Endpoints
 * All paths are relative to API_BASE_URL
 */
export const ENDPOINTS = {
  // ============================================
  // AUTHENTICATION
  // ============================================
  AUTH: {
    /** POST - Patient login with email/password */
    LOGIN: "/api/auth/login",
    /** POST - Patient registration */
    REGISTER: "/api/auth/register",
    /** GET - Check authentication status / get current user */
    ME: "/api/auth/me",
    /** POST - Patient logout */
    LOGOUT: "/api/auth/logout",
    /** POST - Request password reset email */
    FORGOT_PASSWORD: "/api/auth/forgot-password",
    /** POST - Reset password with token */
    RESET_PASSWORD: "/api/auth/reset-password",
    /** POST - Complete patient profile after initial login */
    COMPLETE_PROFILE: "/api/auth/complete-profile",
    /** POST - Admin staff login (legacy) */
    ADMIN_LOGIN: "/api/auth/admin/login",
    /** POST - Doctor login with email/password */
    DOCTOR_LOGIN: "/api/auth/doctor/login",
    /** POST - Secretary login with email/password */
    SECRETARY_LOGIN: "/api/auth/secretary/login",
  },

  // ============================================
  // PATIENTS
  // ============================================
  PATIENTS: {
    /** GET - Get current patient profile */
    PROFILE: "/api/patients/profile",
    /** PUT - Update patient profile */
    UPDATE_PROFILE: "/api/patients/profile",
    /** GET - Get patient dashboard data */
    DASHBOARD: "/api/patients/dashboard",
    /** GET - Get all patients (admin) */
    LIST: "/api/patients",
    /** GET - Get patient by ID (admin) */
    GET_BY_ID: (id: string | number) => `/api/patients/${id}`,
    /** GET - Get patient history by ID (admin) */
    HISTORY: (id: string | number) => `/api/patients/${id}/history`,
  },

  // ============================================
  // APPOINTMENTS
  // ============================================
  APPOINTMENTS: {
    /** GET - Get available time slots for a date */
    SLOTS: "/api/appointments/slots",
    /** POST - Book a new appointment */
    CREATE: "/api/appointments",
    /** GET - Get patient's appointments */
    LIST: "/api/appointments",
    /** GET - Get appointment by ID */
    GET_BY_ID: (id: string | number) => `/api/appointments/${id}`,
    /** PUT - Update appointment */
    UPDATE: (id: string | number) => `/api/appointments/${id}`,
    /** DELETE - Cancel appointment */
    CANCEL: (id: string | number) => `/api/appointments/${id}`,
    /** PUT - Reschedule appointment */
    RESCHEDULE: (id: string | number) => `/api/appointments/${id}/reschedule`,
    /** GET - Get today's appointments (admin) */
    TODAY: "/api/appointments/today",
    /** GET - Get all appointments (admin) */
    ALL: "/api/admin/appointments",
  },

  // ============================================
  // DOCTORS
  // ============================================
  DOCTORS: {
    /** GET - Get list of all doctors (public - for patient selection) */
    LIST: "/api/doctors",
    /** GET - Get doctor by ID */
    GET_BY_ID: (id: string | number) => `/api/doctors/${id}`,
    /** GET - Get doctor availability for a date range */
    AVAILABILITY: (id: string | number) => `/api/doctors/${id}/availability`,
    /** GET - Get doctor's profile (for logged-in doctor) */
    PROFILE: "/api/doctors/profile",
    /** PUT - Update doctor's profile */
    UPDATE_PROFILE: "/api/doctors/profile",
    /** GET - Get doctor's patients */
    PATIENTS: (id: string | number) => `/api/doctors/${id}/patients`,
    /** GET - Get doctor's appointments */
    APPOINTMENTS: (id: string | number) => `/api/doctors/${id}/appointments`,
    /** GET - Get doctor's stats/dashboard data */
    STATS: (id: string | number) => `/api/doctors/${id}/stats`,
  },

  // ============================================
  // PROCEDURES
  // ============================================
  PROCEDURES: {
    /** GET - Get list of available procedures */
    LIST: "/api/procedures",
    /** GET - Get procedure by ID */
    GET_BY_ID: (id: string) => `/api/procedures/${id}`,
  },

  // ============================================
  // MEDICAL RECORDS
  // ============================================
  MEDICAL_RECORDS: {
    /** GET - Get patient's medical records */
    LIST: "/api/medical-records",
    /** GET - Get specific record by ID */
    GET_BY_ID: (id: string | number) => `/api/medical-records/${id}`,
    /** GET - Get patient's dental chart */
    DENTAL_CHART: "/api/medical-records/dental-chart",
    /** GET - Get patient's documents */
    DOCUMENTS: "/api/medical-records/documents",
    /** GET - Download document by ID */
    DOWNLOAD_DOCUMENT: (id: string | number) => `/api/medical-records/documents/${id}/download`,
  },

  // ============================================
  // PRESCRIPTIONS
  // ============================================
  PRESCRIPTIONS: {
    /** GET - Get patient's prescriptions */
    LIST: "/api/prescriptions",
    /** GET - Get prescription by ID */
    GET_BY_ID: (id: string | number) => `/api/prescriptions/${id}`,
    /** POST - Request prescription refill */
    REQUEST_REFILL: (id: string | number) => `/api/prescriptions/${id}/refill`,
    /** GET - Get recommended procedures for patient */
    RECOMMENDED_PROCEDURES: "/api/prescriptions/recommended-procedures",
  },

  // ============================================
  // BILLING & PAYMENTS
  // ============================================
  BILLING: {
    /** GET - Get patient's invoices */
    INVOICES: "/api/billing/invoices",
    /** GET - Get invoice by ID */
    INVOICE_BY_ID: (id: string) => `/api/billing/invoices/${id}`,
    /** GET - Get payment history */
    PAYMENTS: "/api/billing/payments",
    /** POST - Make a payment */
    MAKE_PAYMENT: "/api/billing/payments",
    /** GET - Get insurance claims */
    INSURANCE_CLAIMS: "/api/billing/insurance-claims",
    /** GET - Get billing summary */
    SUMMARY: "/api/billing/summary",
    /** GET - Receipts (RT) and refunds (RF); ?patient_id ?kind ?status ?from ?to */
    RECEIPTS: "/api/billing/receipts",
    /** POST - A deposit: a receipt with no invoice (billing:create) */
    NEW_RECEIPT: "/api/billing/receipts",
    /** GET - One receipt with its invoices and refunds */
    RECEIPT_BY_ID: (id: string | number) => `/api/billing/receipts/${id}`,
    /** POST - Refund out of one receipt, never more than it holds (billing:edit) */
    REFUND_RECEIPT: (id: string | number) => `/api/billing/receipts/${id}/refunds`,
    /** POST - Use part of a receipt on one invoice (billing:edit) */
    APPLY_RECEIPT: (id: string | number) => `/api/billing/payments/${id}/allocations`,
    /** POST - Cancel an invoice; its receipts are released, `refund: true` hands the money back (billing:edit) */
    CANCEL_INVOICE: (id: string | number) => `/api/billing/invoices/${id}/void`,
  },

  // ============================================
  // EXPENSES (what the clinic pays)
  // ============================================
  EXPENSES: {
    /** GET - List (?to_pay ?supplier_id ?category ?status ?search ?from ?to); POST - new expense (EX…) */
    LIST: "/api/expenses",
    BY_ID: (id: string | number) => `/api/expenses/${id}`,
    /** POST - Record a payment on an expense */
    PAYMENTS: (id: string | number) => `/api/expenses/${id}/payments`,
    /** POST (multipart "file") - keep a file with the expense; DELETE /:attachmentId removes it */
    ATTACHMENTS: (id: string | number) => `/api/expenses/${id}/attachments`,
    /** GET / POST; PATCH /:id - suppliers the clinic pays */
    SUPPLIERS: "/api/expense-suppliers",
    /** GET / POST; PATCH /:id - the clinic's own categories */
    CATEGORIES: "/api/expense-categories",
    /** GET / POST; PATCH / DELETE /:id - repeating expenses */
    REMINDERS: "/api/expense-reminders",
  },

  // ============================================
  // NOTIFICATIONS
  // ============================================
  NOTIFICATIONS: {
    /** GET - Get patient's notifications */
    LIST: "/api/notifications",
    /** PUT - Mark notification as read */
    MARK_READ: (id: string | number) => `/api/notifications/${id}/read`,
    /** PUT - Mark all notifications as read */
    MARK_ALL_READ: "/api/notifications/read-all",
    /** GET - Get unread count */
    UNREAD_COUNT: "/api/notifications/unread-count",
  },

  // ============================================
  // ADMIN - DASHBOARD
  // ============================================
  ADMIN: {
    /** GET - Get admin dashboard stats */
    STATS: "/api/admin/stats",
    /** GET - Get revenue data */
    REVENUE: "/api/admin/revenue",
  },

  // ============================================
  // ADMIN - INVENTORY
  // ============================================
  INVENTORY: {
    /** GET - Get all inventory items */
    LIST: "/api/admin/inventory",
    /** GET - Get inventory item by ID */
    GET_BY_ID: (id: string | number) => `/api/admin/inventory/${id}`,
    /** PUT - Update inventory item */
    UPDATE: (id: string | number) => `/api/admin/inventory/${id}`,
    /** POST - Add new inventory item */
    CREATE: "/api/admin/inventory",
    /** GET - Get low stock alerts */
    LOW_STOCK: "/api/admin/inventory/low-stock",
  },

  // ============================================
  // ADMIN - TRANSACTIONS
  // ============================================
  TRANSACTIONS: {
    /** GET - Get all transactions */
    LIST: "/api/admin/transactions",
    /** GET - Get transaction by ID */
    GET_BY_ID: (id: string | number) => `/api/admin/transactions/${id}`,
  },

  // ============================================
  // ADMIN - SETTINGS
  // ============================================
  // The /admin/settings page; wrappers in lib/api/settings.ts.
  SETTINGS: {
    /** GET; PATCH (clinic:settings) - name, legal name, contact, timezone, currency */
    ORGANIZATION: "/api/organizations/me",
    /** GET; PATCH (clinic:settings) - address and opening hours */
    CLINIC_PROFILE: "/api/clinic-profile",
    /** PATCH multipart "file" (clinic:settings) - the clinic logo */
    CLINIC_LOGO: "/api/clinic-profile/logo",
    /** GET ?include_inactive=true; POST (branches:create) */
    BRANCHES: "/api/branches",
    /** PATCH (branches:edit); DELETE (branches:delete, only with no data) */
    BRANCH: (id: string | number) => `/api/branches/${id}`,
    /** PATCH (branches:edit) - make it the default branch */
    BRANCH_DEFAULT: (id: string | number) => `/api/branches/${id}/default`,
  },
} as const;

/**
 * Full URL builder
 * Combines base URL with endpoint path
 */
export const buildUrl = (endpoint: string): string => {
  return `${API_BASE_URL}${endpoint}`;
};
