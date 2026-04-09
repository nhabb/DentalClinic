import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  const passwordHash = await bcrypt.hash('Test1234!', 10);
  const demoHash = await bcrypt.hash('demo123', 10);

  // Create demo accounts (used by the login page demo buttons)
  await prisma.users.upsert({
    where: { email: 'doctor@demo.com' },
    update: { role: 'admin' },
    create: { email: 'doctor@demo.com', password_hash: demoHash, first_name: 'Demo', last_name: 'Doctor', role: 'admin' },
  });

  await prisma.users.upsert({
    where: { email: 'secretary@demo.com' },
    update: { role: 'admin' },
    create: { email: 'secretary@demo.com', password_hash: demoHash, first_name: 'Demo', last_name: 'Secretary', role: 'admin' },
  });

  const demoPatientUser = await prisma.users.upsert({
    where: { email: 'patient@demo.com' },
    update: { role: 'patient' },
    create: { email: 'patient@demo.com', password_hash: demoHash, first_name: 'Demo', last_name: 'Patient', role: 'patient' },
  });

  await prisma.patient_profiles.upsert({
    where: { user_id: demoPatientUser.id },
    update: {},
    create: { user_id: demoPatientUser.id },
  });

  console.log('Demo accounts created/updated');

  // Create doctor
  const doctor = await prisma.users.upsert({
    where: { email: 'doctor@clinic.com' },
    update: {},
    create: {
      email: 'doctor@clinic.com',
      password_hash: passwordHash,
      first_name: 'Ahmed',
      last_name: 'Hassan',
      role: 'admin',
      phone: '01012345678',
    },
  });
  console.log('Doctor created:', doctor.id.toString());

  // Create patient user
  const patientUser = await prisma.users.upsert({
    where: { email: 'patient@clinic.com' },
    update: {},
    create: {
      email: 'patient@clinic.com',
      password_hash: passwordHash,
      first_name: 'Sara',
      last_name: 'Ali',
      role: 'patient',
      phone: '01098765432',
    },
  });
  console.log('Patient user created:', patientUser.id.toString());

  // Create patient profile
  const patientProfile = await prisma.patient_profiles.upsert({
    where: { user_id: patientUser.id },
    update: {},
    create: {
      user_id: patientUser.id,
      blood_type: 'A+',
      allergies: 'Penicillin',
      city: 'Cairo',
      governate: 'Cairo',
      profile_complete: true,
    },
  });
  console.log('Patient profile created:', patientProfile.id.toString());

  // Create appointment slot
  const slot = await prisma.appointment_slots.create({
    data: {
      doctor_id: doctor.id,
      slot_date: new Date('2026-04-10'),
      start_time: new Date('1970-01-01T09:00:00'),
      end_time: new Date('1970-01-01T09:30:00'),
    },
  });
  console.log('Slot created:', slot.id.toString());

  // Create appointment
  const appointment = await prisma.appointments.create({
    data: {
      patient_id: patientProfile.id,
      doctor_id: doctor.id,
      slot_id: slot.id,
      appointment_date: new Date('2026-04-10'),
      start_time: new Date('1970-01-01T09:00:00'),
      end_time: new Date('1970-01-01T09:30:00'),
      status: 'scheduled',
      reason: 'Routine checkup',
      created_by: doctor.id,
    },
  });
  console.log('Appointment created:', appointment.id.toString());

  // Create patient record
  await prisma.patient_records.create({
    data: {
      patient_id: patientProfile.id,
      appointment_id: appointment.id,
      record_type: 'diagnosis',
      title: 'Initial Examination',
      description: 'Patient has minor cavity on tooth 14. Treatment scheduled.',
      tooth_number: '14',
      treatment_date: new Date('2026-04-10'),
      created_by: doctor.id,
    },
  });
  console.log('Patient record created');

  // Create inventory items
  await prisma.inventory_items.upsert({
    where: { sku: 'GLV-001' },
    update: {},
    create: {
      name: 'Dental Gloves',
      category: 'Consumables',
      sku: 'GLV-001',
      quantity: 100,
      minimum_quantity: 20,
      unit: 'box',
      cost_price: 25.5,
    },
  });

  await prisma.inventory_items.upsert({
    where: { sku: 'ANST-001' },
    update: {},
    create: {
      name: 'Local Anesthetic',
      category: 'Medication',
      sku: 'ANST-001',
      quantity: 5,
      minimum_quantity: 10,
      unit: 'vial',
      cost_price: 120.0,
    },
  });
  console.log('Inventory items created');

  // Create notification
  await prisma.notifications.create({
    data: {
      user_id: patientUser.id,
      title: 'Appointment Confirmed',
      message: 'Your appointment on April 10th at 9:00 AM has been booked.',
      type: 'appointment_booked',
    },
  });
  console.log('Notification created');

  console.log('\nSeed complete!');
  console.log(`Doctor ID: ${doctor.id}`);
  console.log(`Patient Profile ID: ${patientProfile.id}`);
  console.log(`Slot ID: ${slot.id}`);
  console.log(`Appointment ID: ${appointment.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
