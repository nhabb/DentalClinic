/**
 * Type Definitions for Dental Clinic App
 * Includes role-based user types and common interfaces
 */

// ============================================
// USER ROLES
// ============================================

export type UserRole = "patient" | "doctor" | "secretary" | "admin";

// ============================================
// USER INTERFACES
// ============================================

export interface BaseUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  createdAt?: string;
}

export interface PatientUser extends BaseUser {
  role: "patient";
  phone?: string;
  dateOfBirth?: string;
  address?: string;
  profileComplete: boolean;
}

export interface DoctorUser extends BaseUser {
  role: "doctor";
  doctorId: number;
  specialty: string;
  avatar?: string;
}

export interface SecretaryUser extends BaseUser {
  role: "secretary";
  assignedDoctorIds: number[]; // Secretary can work for multiple doctors
}

export interface AdminUser extends BaseUser {
  role: "admin";
}

export type User = PatientUser | DoctorUser | SecretaryUser | AdminUser;

// ============================================
// DOCTOR
// ============================================

export interface Doctor {
  id: number;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  specialty: string;
  avatar?: string;
  phone?: string;
  bio?: string;
  available: boolean;
  workingHours?: {
    start: string;
    end: string;
    days: number[]; // 0-6, Sunday-Saturday
  };
}

// ============================================
// APPOINTMENTS
// ============================================

export interface TimeSlot {
  time: string;
  available: boolean;
}

export interface Procedure {
  id: string;
  name: string;
  duration: string;
  price?: number;
}

export interface Appointment {
  id: number;
  patientId: number;
  patientName?: string;
  doctorId: number;
  doctorName?: string;
  date: string;
  time: string;
  serviceType: "checkup" | "procedure";
  procedure?: string;
  procedureName?: string;
  status: "upcoming" | "in_progress" | "completed" | "cancelled";
  duration: number;
  notes?: string;
  createdAt?: string;
}

// ============================================
// PATIENT PROFILE
// ============================================

export interface PatientProfile {
  id?: number;
  firstName: string;
  lastName: string;
  email?: string;
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
  assignedDoctorId?: number; // Primary doctor for this patient
}

// ============================================
// MEDICAL RECORDS
// ============================================

export interface MedicalRecord {
  id: number;
  patientId: number;
  doctorId: number;
  doctorName?: string;
  date: string;
  type: string;
  notes: string;
  treatments: string[];
  cost: string;
}

export interface MedicalDocument {
  id: number;
  name: string;
  type: string;
  date: string;
  size: string;
  url?: string;
}

// ============================================
// PRESCRIPTIONS
// ============================================

export interface Prescription {
  id: number;
  patientId: number;
  doctorId: number;
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

// ============================================
// BILLING
// ============================================

export interface Invoice {
  id: string;
  patientId: number;
  doctorId: number;
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
  cardLast4?: string;
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

// ============================================
// NOTIFICATIONS
// ============================================

export interface Notification {
  id: number;
  userId: number;
  type: "success" | "warning" | "info" | "error" | "appointment" | "billing" | "prescription";
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

// ============================================
// INVENTORY (Shared across clinic)
// ============================================

export interface InventoryItem {
  id: number;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  reorderLevel: number;
  lastRestocked: string;
}

// ============================================
// TRANSACTIONS
// ============================================

export interface Transaction {
  id: number;
  doctorId?: number; // null for clinic-wide transactions
  date: string;
  type: "income" | "expense";
  category: string;
  description: string;
  amount: number;
}

// ============================================
// ADMIN STATS
// ============================================

export interface AdminStats {
  totalFunds: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  pendingPayments: number;
  todayAppointments: number;
  completedToday: number;
  lowStockItems: number;
  totalPatients: number;
}

// ============================================
// AUTH RESPONSES
// ============================================

export interface LoginResponse {
  token: string;
  user: User;
  profileComplete?: boolean;
}

export interface AuthCredentials {
  email?: string;
  username?: string;
  password: string;
}
