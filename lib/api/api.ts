/**
 * API Service
 *
 * Centralized API service for all frontend-backend communication.
 * Note: All HTTP calls have been removed.
 */

import { API_BASE_URL, ENDPOINTS } from "./endpoints";

// ============================================
// REMOVED AXIOS CONFIGURATION
// ============================================

// ============================================
// TYPE DEFINITIONS
// ============================================

// Auth Types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface PatientProfile {
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  city: string;
  governate: string;
  emergencyContact: string;
  emergencyPhone: string;
  insuranceProvider?: string;
  insurancePolicy?: string;
  medicalConditions?: string;
  allergies?: string;
  currentMedications?: string;
}

// Appointment Types
export interface TimeSlot {
  time: string;
  available: boolean;
}

export interface Doctor {
  id: number;
  name: string;
  specialty: string;
  available: boolean;
  color?: string;
}

export interface Procedure {
  id: string;
  name: string;
  duration: string;
}

export interface AppointmentData {
  serviceType: "checkup" | "procedure";
  procedure?: string;
  date: string;
  time: string;
  doctorId: number;
}

export interface Appointment {
  id: number;
  date: string;
  time: string;
  serviceType: "checkup" | "procedure";
  procedure?: string;
  doctorId: number;
  doctorName?: string;
  status: "upcoming" | "in_progress" | "completed" | "cancelled";
  type: string;
  duration: number;
  notes?: string;
}

// Medical Records Types
export interface MedicalRecord {
  id: number;
  date: string;
  type: string;
  doctor: string;
  notes: string;
  treatments: string[];
  cost: string;
}

export interface Document {
  id: number;
  name: string;
  type: string;
  date: string;
  size: string;
}

// Prescription Types
export interface Prescription {
  id: number;
  name: string;
  purpose: string;
  dosage: string;
  frequency: string;
  duration: string;
  startDate: string;
  endDate?: string;
  refillsLeft?: number;
  prescribedBy: string;
  instructions: string;
  status: "active" | "completed" | "ongoing";
}

// Billing Types
export interface Invoice {
  id: string;
  date: string;
  description: string;
  amount: number;
  insuranceCovered: number;
  patientResponsibility: number;
  status: "paid" | "pending" | "insurance_pending" | "overdue";
  paidDate?: string;
  dueDate?: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  date: string;
  method: string;
}

export interface InsuranceClaim {
  id: string;
  invoiceId: string;
  submittedDate: string;
  amount: number;
  status: "approved" | "pending" | "denied";
  provider: string;
  paidDate?: string;
}

// Notification Types
export interface Notification {
  id: number;
  title: string;
  message: string;
  type: "appointment" | "billing" | "prescription" | "general";
  read: boolean;
  createdAt: string;
}

// Inventory Types
export interface InventoryItem {
  id: number;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  reorderLevel: number;
  lastRestocked: string;
}

// Transaction Types
export interface Transaction {
  id: number;
  date: string;
  type: "income" | "expense";
  category: string;
  description: string;
  amount: number;
}

// Admin Stats Types
export interface AdminStats {
  totalRevenue: number;
  monthlyRevenue: number;
  totalPatients: number;
  appointmentsToday: number;
  pendingAppointments: number;
  lowStockItems: number;
}

// ============================================
// AUTHENTICATION API
// ============================================

export const authApi = {
  /** Login with email and password */
  login: (credentials: LoginCredentials): Promise<void> => {
    return Promise.resolve();
  },

  /** Register a new patient account */
  register: (data: RegisterData): Promise<void> => {
    return Promise.resolve();
  },

  /** Get current authenticated user */
  getMe: (): Promise<void> => {
    return Promise.resolve();
  },

  /** Logout current user */
  logout: (): Promise<void> => {
    return Promise.resolve();
  },

  /** Request password reset */
  forgotPassword: (email: string): Promise<void> => {
    return Promise.resolve();
  },

  /** Reset password with token */
  resetPassword: (token: string, password: string): Promise<void> => {
    return Promise.resolve();
  },

  /** Complete patient profile after initial registration */
  completeProfile: (profile: PatientProfile): Promise<void> => {
    return Promise.resolve();
  },

  /** Admin login */
  adminLogin: (credentials: LoginCredentials): Promise<void> => {
    return Promise.resolve();
  },
};

// ============================================
// PATIENTS API
// ============================================

export const patientsApi = {
  /** Get current patient profile */
  getProfile: (): Promise<void> => {
    return Promise.resolve();
  },

  /** Update patient profile */
  updateProfile: (data: Partial<PatientProfile>): Promise<void> => {
    return Promise.resolve();
  },

  /** Get patient dashboard data */
  getDashboard: (): Promise<void> => {
    return Promise.resolve();
  },

  /** Get all patients (admin only) */
  getAll: (): Promise<void> => {
    return Promise.resolve();
  },

  /** Get patient by ID (admin only) */
  getById: (id: string | number): Promise<void> => {
    return Promise.resolve();
  },

  /** Get patient history (admin only) */
  getHistory: (id: string | number): Promise<void> => {
    return Promise.resolve();
  },
};

// ============================================
// APPOINTMENTS API
// ============================================

export const appointmentsApi = {
  /** Get available time slots for a specific date */
  getAvailableSlots: (date: string): Promise<void> => {
    return Promise.resolve();
  },

  /** Book a new appointment */
  create: (data: AppointmentData): Promise<void> => {
    return Promise.resolve();
  },

  /** Get patient's appointments */
  getMyAppointments: (status?: string): Promise<void> => {
    return Promise.resolve();
  },

  /** Get appointment by ID */
  getById: (id: string | number): Promise<void> => {
    return Promise.resolve();
  },

  /** Update appointment */
  update: (
    id: string | number,
    data: Partial<AppointmentData>,
  ): Promise<void> => {
    return Promise.resolve();
  },

  /** Cancel appointment */
  cancel: (id: string | number): Promise<void> => {
    return Promise.resolve();
  },

  /** Reschedule appointment */
  reschedule: (
    id: string | number,
    newDate: string,
    newTime: string,
  ): Promise<void> => {
    return Promise.resolve();
  },

  /** Get today's appointments (admin) */
  getToday: (): Promise<void> => {
    return Promise.resolve();
  },

  /** Get all appointments (admin) */
  getAll: (filters?: {
    date?: string;
    doctorId?: number;
    status?: string;
  }): Promise<void> => {
    return Promise.resolve();
  },
};

// ============================================
// DOCTORS API
// ============================================

export const doctorsApi = {
  /** Get list of all doctors */
  getAll: (): Promise<void> => {
    return Promise.resolve();
  },

  /** Get doctor by ID */
  getById: (id: string | number): Promise<void> => {
    return Promise.resolve();
  },

  /** Get doctor availability for a date range */
  getAvailability: (
    id: string | number,
    startDate?: string,
    endDate?: string,
  ): Promise<void> => {
    return Promise.resolve();
  },
};

// ============================================
// PROCEDURES API
// ============================================

export const proceduresApi = {
  /** Get list of all available procedures */
  getAll: (): Promise<void> => {
    return Promise.resolve();
  },

  /** Get procedure by ID */
  getById: (id: string): Promise<void> => {
    return Promise.resolve();
  },
};

// ============================================
// MEDICAL RECORDS API
// ============================================

export const medicalRecordsApi = {
  /** Get patient's medical records */
  getAll: (): Promise<void> => {
    return Promise.resolve();
  },

  /** Get specific record by ID */
  getById: (id: string | number): Promise<void> => {
    return Promise.resolve();
  },

  /** Get patient's dental chart */
  getDentalChart: (): Promise<void> => {
    return Promise.resolve();
  },

  /** Get patient's documents */
  getDocuments: (): Promise<void> => {
    return Promise.resolve();
  },

  /** Download document by ID */
  downloadDocument: (id: string | number): Promise<void> => {
    return Promise.resolve();
  },
};

// ============================================
// PRESCRIPTIONS API
// ============================================

export const prescriptionsApi = {
  /** Get patient's prescriptions */
  getAll: (status?: "active" | "completed" | "ongoing"): Promise<void> => {
    return Promise.resolve();
  },

  /** Get prescription by ID */
  getById: (id: string | number): Promise<void> => {
    return Promise.resolve();
  },

  /** Request prescription refill */
  requestRefill: (id: string | number): Promise<void> => {
    return Promise.resolve();
  },

  /** Get recommended procedures for patient */
  getRecommendedProcedures: (): Promise<void> => {
    return Promise.resolve();
  },
};

// ============================================
// BILLING API
// ============================================

export const billingApi = {
  /** Get patient's invoices */
  getInvoices: (status?: string): Promise<void> => {
    return Promise.resolve();
  },

  /** Get invoice by ID */
  getInvoiceById: (id: string): Promise<void> => {
    return Promise.resolve();
  },

  /** Get payment history */
  getPayments: (): Promise<void> => {
    return Promise.resolve();
  },

  /** Make a payment */
  makePayment: (
    invoiceId: string,
    amount: number,
    method: string,
  ): Promise<void> => {
    return Promise.resolve();
  },

  /** Get insurance claims */
  getInsuranceClaims: (): Promise<void> => {
    return Promise.resolve();
  },

  /** Get billing summary */
  getSummary: (): Promise<void> => {
    return Promise.resolve();
  },
};

// ============================================
// NOTIFICATIONS API
// ============================================

export const notificationsApi = {
  /** Get all notifications */
  getAll: (): Promise<void> => {
    return Promise.resolve();
  },

  /** Mark notification as read */
  markRead: (id: string | number): Promise<void> => {
    return Promise.resolve();
  },

  /** Mark all notifications as read */
  markAllRead: (): Promise<void> => {
    return Promise.resolve();
  },

  /** Get unread count */
  getUnreadCount: (): Promise<void> => {
    return Promise.resolve();
  },
};

// ============================================
// ADMIN API
// ============================================

export const adminApi = {
  /** Get admin dashboard stats */
  getStats: (): Promise<void> => {
    return Promise.resolve();
  },

  /** Get revenue data */
  getRevenue: (period?: "week" | "month" | "year"): Promise<void> => {
    return Promise.resolve();
  },
};

// ============================================
// INVENTORY API (Admin)
// ============================================

export const inventoryApi = {
  /** Get all inventory items */
  getAll: (): Promise<void> => {
    return Promise.resolve();
  },

  /** Get inventory item by ID */
  getById: (id: string | number): Promise<void> => {
    return Promise.resolve();
  },

  /** Update inventory item */
  update: (
    id: string | number,
    data: Partial<InventoryItem>,
  ): Promise<void> => {
    return Promise.resolve();
  },

  /** Create new inventory item */
  create: (data: Omit<InventoryItem, "id">): Promise<void> => {
    return Promise.resolve();
  },

  /** Get low stock alerts */
  getLowStock: (): Promise<void> => {
    return Promise.resolve();
  },
};

// ============================================
// TRANSACTIONS API (Admin)
// ============================================

export const transactionsApi = {
  /** Get all transactions */
  getAll: (filters?: {
    type?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<void> => {
    return Promise.resolve();
  },

  /** Get transaction by ID */
  getById: (id: string | number): Promise<void> => {
    return Promise.resolve();
  },
};

// ============================================
// SETTINGS API (Admin)
// ============================================

export const settingsApi = {
  /** Get clinic settings */
  get: (): Promise<void> => {
    return Promise.resolve();
  },

  /** Update clinic settings */
  update: (data: Record<string, unknown>): Promise<void> => {
    return Promise.resolve();
  },
};
