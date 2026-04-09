/**
 * Backend API Endpoints Reference
 *
 * This file lists all the API endpoints that the frontend expects.
 * Backend developers should implement these endpoints.
 *
 * Base URL: http://localhost:5000
 */

export const BACKEND_ENDPOINTS = {
  // ========== AUTHENTICATION ==========
  "POST /api/auth/login": {
    description: "Patient login",
    body: { email: "string", password: "string" },
    response: { token: "string", user: "object", profileComplete: "boolean" },
  },
  "POST /api/auth/register": {
    description: "Patient registration",
    body: { email: "string", password: "string", firstName: "string", lastName: "string" },
    response: { token: "string", user: "object" },
  },
  "POST /api/auth/doctor/login": {
    description: "Doctor login",
    body: { email: "string", password: "string" },
    response: {
      token: "string",
      user: {
        id: "number",
        email: "string",
        firstName: "string",
        lastName: "string",
        role: "doctor",
        doctorId: "number",
        specialty: "string",
      },
    },
  },
  "POST /api/auth/secretary/login": {
    description: "Secretary login",
    body: { email: "string", password: "string" },
    response: {
      token: "string",
      user: {
        id: "number",
        email: "string",
        firstName: "string",
        lastName: "string",
        role: "secretary",
        assignedDoctorIds: "number[]",
      },
    },
  },
  "GET /api/auth/me": {
    description: "Get current authenticated user",
    response: { user: "object" },
  },
  "POST /api/auth/logout": {
    description: "Logout current user",
    response: { success: "boolean" },
  },
  "POST /api/auth/forgot-password": {
    description: "Request password reset",
    body: { email: "string" },
    response: { message: "string" },
  },
  "POST /api/auth/reset-password": {
    description: "Reset password with token",
    body: { token: "string", password: "string" },
    response: { success: "boolean" },
  },
  "POST /api/auth/complete-profile": {
    description: "Complete patient profile after registration",
    body: {
      firstName: "string",
      lastName: "string",
      phone: "string",
      dateOfBirth: "string",
      address: "string",
      city: "string",
      governate: "string",
      emergencyContact: "string",
      emergencyPhone: "string",
      insuranceProvider: "string?",
      insurancePolicy: "string?",
      medicalConditions: "string?",
      allergies: "string?",
      currentMedications: "string?",
    },
    response: { success: "boolean" },
  },
  "POST /api/auth/admin/login": {
    description: "Admin staff login",
    body: { username: "string", password: "string" },
    response: { token: "string", user: "object" },
  },

  // ========== PATIENTS ==========
  "GET /api/patients/profile": {
    description: "Get current patient profile",
    response: { /* PatientProfile object */ },
  },
  "PUT /api/patients/profile": {
    description: "Update patient profile",
    body: { /* Partial PatientProfile */ },
    response: { success: "boolean" },
  },
  "GET /api/patients/dashboard": {
    description: "Get patient dashboard data",
    response: { /* Dashboard data */ },
  },
  "GET /api/patients": {
    description: "Get all patients (admin only). Filter by doctorId for doctor-specific patients.",
    query: { doctorId: "number? (optional - filter by doctor)" },
    response: { patients: "array" },
  },
  "GET /api/patients/:id": {
    description: "Get patient by ID (admin only)",
    response: { patient: "object" },
  },
  "GET /api/patients/:id/history": {
    description: "Get patient history (admin only)",
    response: { history: "array" },
  },

  // ========== APPOINTMENTS ==========
  "GET /api/appointments/slots": {
    description: "Get available time slots for a date and doctor",
    query: { date: "YYYY-MM-DD", doctorId: "number (required - get slots for specific doctor)" },
    response: { slots: [{ time: "string", available: "boolean" }] },
  },
  "POST /api/appointments": {
    description: "Book a new appointment",
    body: {
      serviceType: "checkup | procedure",
      procedure: "string?",
      date: "YYYY-MM-DD",
      time: "string",
      doctorId: "number",
    },
    response: { id: "number", message: "string" },
  },
  "GET /api/appointments": {
    description: "Get patient's appointments",
    query: { status: "upcoming | completed | cancelled" },
    response: { appointments: "array" },
  },
  "GET /api/appointments/:id": {
    description: "Get appointment by ID",
    response: { appointment: "object" },
  },
  "PUT /api/appointments/:id": {
    description: "Update appointment",
    body: { /* Partial appointment data */ },
    response: { success: "boolean" },
  },
  "DELETE /api/appointments/:id": {
    description: "Cancel appointment",
    response: { success: "boolean" },
  },
  "PUT /api/appointments/:id/reschedule": {
    description: "Reschedule appointment",
    body: { date: "YYYY-MM-DD", time: "string" },
    response: { success: "boolean" },
  },
  "GET /api/appointments/today": {
    description: "Get today's appointments (admin). Filter by doctorId for doctor-specific appointments.",
    query: { doctorId: "number? (optional - filter by doctor)" },
    response: { appointments: "array" },
  },
  "GET /api/admin/appointments": {
    description: "Get all appointments (admin)",
    query: { date: "YYYY-MM-DD?", doctorId: "number?", status: "string?" },
    response: { appointments: "array" },
  },

  // ========== DOCTORS ==========
  "GET /api/doctors": {
    description: "Get list of all doctors (public endpoint for patient booking)",
    response: {
      doctors: [{
        id: "number",
        name: "string",
        firstName: "string",
        lastName: "string",
        specialty: "string",
        bio: "string?",
        avatar: "string?",
        available: "boolean"
      }]
    },
  },
  "GET /api/doctors/:id": {
    description: "Get doctor by ID",
    response: { doctor: "object" },
  },
  "GET /api/doctors/:id/availability": {
    description: "Get doctor availability",
    query: { startDate: "YYYY-MM-DD?", endDate: "YYYY-MM-DD?" },
    response: { availability: "array" },
  },

  // ========== PROCEDURES ==========
  "GET /api/procedures": {
    description: "Get list of available procedures",
    response: { procedures: [{ id: "string", name: "string", duration: "string" }] },
  },
  "GET /api/procedures/:id": {
    description: "Get procedure by ID",
    response: { procedure: "object" },
  },

  // ========== MEDICAL RECORDS ==========
  "GET /api/medical-records": {
    description: "Get patient's medical records/visit history",
    response: { records: "array" },
  },
  "GET /api/medical-records/:id": {
    description: "Get specific record by ID",
    response: { record: "object" },
  },
  "GET /api/medical-records/dental-chart": {
    description: "Get patient's dental chart",
    response: { chart: [{ tooth: "number", status: "string" }] },
  },
  "GET /api/medical-records/documents": {
    description: "Get patient's medical documents",
    response: { documents: "array" },
  },
  "GET /api/medical-records/documents/:id/download": {
    description: "Download document by ID",
    response: "Blob (file download)",
  },

  // ========== PRESCRIPTIONS ==========
  "GET /api/prescriptions": {
    description: "Get patient's prescriptions",
    query: { status: "active | completed | ongoing" },
    response: { prescriptions: "array" },
  },
  "GET /api/prescriptions/:id": {
    description: "Get prescription by ID",
    response: { prescription: "object" },
  },
  "POST /api/prescriptions/:id/refill": {
    description: "Request prescription refill",
    response: { success: "boolean", message: "string" },
  },
  "GET /api/prescriptions/recommended-procedures": {
    description: "Get recommended procedures for patient",
    response: { procedures: "array" },
  },

  // ========== BILLING ==========
  "GET /api/billing/invoices": {
    description: "Get patient's invoices",
    query: { status: "paid | pending | overdue?" },
    response: { invoices: "array" },
  },
  "GET /api/billing/invoices/:id": {
    description: "Get invoice by ID",
    response: { invoice: "object" },
  },
  "GET /api/billing/payments": {
    description: "Get payment history",
    response: { payments: "array" },
  },
  "POST /api/billing/payments": {
    description: "Make a payment",
    body: { invoiceId: "string", amount: "number", method: "string" },
    response: { success: "boolean", paymentId: "string" },
  },
  "GET /api/billing/insurance-claims": {
    description: "Get insurance claims",
    response: { claims: "array" },
  },
  "GET /api/billing/summary": {
    description: "Get billing summary",
    response: {
      totalOutstanding: "number",
      dueDate: "string",
      lastPayment: { amount: "number", date: "string" },
      insurancePending: "number",
    },
  },

  // ========== NOTIFICATIONS ==========
  "GET /api/notifications": {
    description: "Get all notifications",
    response: { notifications: "array" },
  },
  "PUT /api/notifications/:id/read": {
    description: "Mark notification as read",
    response: { success: "boolean" },
  },
  "PUT /api/notifications/read-all": {
    description: "Mark all notifications as read",
    response: { success: "boolean" },
  },
  "GET /api/notifications/unread-count": {
    description: "Get unread notification count",
    response: { count: "number" },
  },

  // ========== ADMIN - DASHBOARD ==========
  "GET /api/admin/stats": {
    description: "Get admin dashboard stats. Filter by doctorId for doctor-specific stats.",
    query: { doctorId: "number? (optional - filter stats by doctor)" },
    response: {
      totalFunds: "number",
      monthlyRevenue: "number",
      monthlyExpenses: "number",
      pendingPayments: "number",
      todayAppointments: "number",
      completedToday: "number",
      lowStockItems: "number",
      totalPatients: "number",
    },
  },
  "GET /api/admin/revenue": {
    description: "Get revenue data. Filter by doctorId for doctor-specific revenue.",
    query: { period: "week | month | year", doctorId: "number? (optional)" },
    response: { revenue: "array" },
  },

  // ========== ADMIN - INVENTORY ==========
  "GET /api/admin/inventory": {
    description: "Get all inventory items",
    response: { items: "array" },
  },
  "GET /api/admin/inventory/:id": {
    description: "Get inventory item by ID",
    response: { item: "object" },
  },
  "PUT /api/admin/inventory/:id": {
    description: "Update inventory item",
    body: { /* Partial inventory item */ },
    response: { success: "boolean" },
  },
  "POST /api/admin/inventory": {
    description: "Add new inventory item",
    body: { name: "string", category: "string", quantity: "number", unit: "string", reorderLevel: "number" },
    response: { id: "number" },
  },
  "GET /api/admin/inventory/low-stock": {
    description: "Get low stock alerts",
    response: { items: [{ id: "number", item: "string", current: "number", minimum: "number" }] },
  },

  // ========== ADMIN - TRANSACTIONS ==========
  "GET /api/admin/transactions": {
    description: "Get all transactions. Filter by doctorId for doctor-specific transactions.",
    query: { type: "income | expense?", startDate: "YYYY-MM-DD?", endDate: "YYYY-MM-DD?", doctorId: "number? (optional)" },
    response: { transactions: "array" },
  },
  "GET /api/admin/transactions/:id": {
    description: "Get transaction by ID",
    response: { transaction: "object" },
  },

  // ========== ADMIN - SETTINGS ==========
  "GET /api/admin/settings": {
    description: "Get clinic settings",
    response: { settings: "object" },
  },
  "PUT /api/admin/settings": {
    description: "Update clinic settings",
    body: { /* Settings object */ },
    response: { success: "boolean" },
  },
};
