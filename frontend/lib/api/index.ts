/**
 * API Module Exports
 *
 * Import all API services from this file:
 * import { authApi, appointmentsApi, ENDPOINTS } from '@/lib/api';
 */

// Export endpoints configuration
export { API_BASE_URL, ENDPOINTS, buildUrl } from "./endpoints";

// Export backend endpoints reference (for backend developers)
export { BACKEND_ENDPOINTS } from "./backend-endpoints";

// Export type definitions
export type {
  UserRole,
  BaseUser,
  PatientUser,
  DoctorUser,
  SecretaryUser,
  AdminUser,
  User,
  Doctor,
  TimeSlot,
  Procedure,
  Appointment,
  PatientProfile,
  MedicalRecord,
  MedicalDocument,
  Prescription,
  Invoice,
  Payment,
  InsuranceClaim,
  Notification,
  InventoryItem,
  Transaction,
  AdminStats,
  LoginResponse,
  AuthCredentials,
} from "./types";

// Export all API services and types
export {
  // API Services
  authApi,
  patientsApi,
  appointmentsApi,
  doctorsApi,
  proceduresApi,
  medicalRecordsApi,
  prescriptionsApi,
  billingApi,
  notificationsApi,
  adminApi,
  inventoryApi,
  transactionsApi,
  settingsApi,
  // Types only exported from ./api (not already in ./types)
  type LoginCredentials,
  type RegisterData,
  type AppointmentData,
  type Document,
} from "./api";

// API instance removed (axios removed)
