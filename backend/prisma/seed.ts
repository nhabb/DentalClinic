import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log('🌱 Seeding database...');

  const demoHash = await bcrypt.hash('Demo123456', 10);

  // ─── Main accounts (use demo emails that exist in Supabase auth) ────────────
  const doctor = await prisma.users.upsert({
    where: { email: 'doctor@demo.com' },
    update: { first_name: 'Ahmed', last_name: 'Hassan', role: 'admin', phone: '+961 3 123 456', gender: 'male' },
    create: {
      email: 'doctor@demo.com',
      password_hash: demoHash,
      first_name: 'Ahmed',
      last_name: 'Hassan',
      role: 'admin',
      phone: '+961 3 123 456',
      gender: 'male',
    },
  });
  console.log(`✅ Doctor: ${doctor.email} (ID ${doctor.id})`);

  await prisma.users.upsert({
    where: { email: 'secretary@demo.com' },
    update: { role: 'admin' },
    create: { email: 'secretary@demo.com', password_hash: demoHash, first_name: 'Demo', last_name: 'Secretary', role: 'admin' },
  });

  const patientUser = await prisma.users.upsert({
    where: { email: 'patient@demo.com' },
    update: { first_name: 'Sara', last_name: 'Ali', role: 'patient', phone: '+961 70 987 654', gender: 'female', date_of_birth: new Date('1992-06-15') },
    create: {
      email: 'patient@demo.com',
      password_hash: demoHash,
      first_name: 'Sara',
      last_name: 'Ali',
      role: 'patient',
      phone: '+961 70 987 654',
      gender: 'female',
      date_of_birth: new Date('1992-06-15'),
    },
  });
  console.log(`✅ Patient: ${patientUser.email} (ID ${patientUser.id})`);

  // ─── Patient profile ────────────────────────────────────────────────────────
  const patientProfile = await prisma.patient_profiles.upsert({
    where: { user_id: patientUser.id },
    update: {},
    create: {
      user_id: patientUser.id,
      blood_type: 'A+',
      allergies: 'Penicillin, Latex',
      medical_notes: 'Patient has mild anxiety during procedures. Prefers morning appointments.',
      current_medications: 'Ibuprofen 400mg as needed',
      emergency_contact_name: 'Khaled Ali',
      emergency_contact_phone: '+961 70 111 222',
      city: 'Beirut',
      governate: 'Beirut',
      insurance_provider: 'AXA Lebanon',
      insurance_policy: 'AXA-2026-884421',
      profile_complete: true,
    },
  });
  console.log(`✅ Patient profile (ID ${patientProfile.id})`);

  // ─── Clinic profile ─────────────────────────────────────────────────────────
  const existingClinic = await prisma.clinic_profile.findFirst();
  if (!existingClinic) {
    await prisma.clinic_profile.create({
      data: {
        name: 'BrightSmile Dental Clinic',
        phone: '+961 1 234 567',
        email: 'contact@brightsmile.com',
        address: 'Hamra Street, Beirut, Lebanon',
        website_url: 'https://brightsmile.com',
        description: 'Leading dental clinic in Beirut offering comprehensive dental care.',
        opening_hours: 'Mon-Fri 8:00-18:00, Sat 9:00-14:00',
      },
    });
    console.log('✅ Clinic profile created');
  }

  // ─── Appointment slots ──────────────────────────────────────────────────────
  const slotDates = [
    { date: '2026-04-14', from: '09:00', to: '09:30' },
    { date: '2026-04-14', from: '10:00', to: '10:30' },
    { date: '2026-04-14', from: '11:00', to: '11:30' },
    { date: '2026-04-15', from: '09:00', to: '09:30' },
    { date: '2026-04-15', from: '14:00', to: '14:30' },
    { date: '2026-04-16', from: '10:00', to: '10:30' },
    { date: '2026-04-17', from: '09:30', to: '10:00' },
    { date: '2026-04-17', from: '15:00', to: '15:30' },
  ];

  const slots: any[] = [];
  for (const s of slotDates) {
    const slot = await prisma.appointment_slots.create({
      data: {
        doctor_id: doctor.id,
        slot_date: new Date(s.date),
        start_time: new Date(`1970-01-01T${s.from}:00`),
        end_time: new Date(`1970-01-01T${s.to}:00`),
        is_booked: false,
      },
    });
    slots.push(slot);
  }
  console.log(`✅ ${slots.length} appointment slots created`);

  // ─── Appointments ───────────────────────────────────────────────────────────
  // Past completed appointment
  const appt1 = await prisma.appointments.create({
    data: {
      patient_id: patientProfile.id,
      doctor_id: doctor.id,
      appointment_date: new Date('2026-03-20'),
      start_time: new Date('1970-01-01T09:00:00'),
      end_time: new Date('1970-01-01T09:30:00'),
      status: 'completed',
      reason: 'Routine checkup and cleaning',
      notes: 'Full cleaning performed. Small cavity on tooth 14 noted — scheduled for filling.',
      created_by: doctor.id,
    },
  });

  // Past completed — filling
  const appt2 = await prisma.appointments.create({
    data: {
      patient_id: patientProfile.id,
      doctor_id: doctor.id,
      appointment_date: new Date('2026-04-02'),
      start_time: new Date('1970-01-01T10:00:00'),
      end_time: new Date('1970-01-01T10:30:00'),
      status: 'completed',
      reason: 'Tooth 14 filling',
      notes: 'Composite filling placed on tooth 14. Patient tolerated well.',
      created_by: doctor.id,
    },
  });

  // Upcoming confirmed (linked to slot)
  const slot0 = slots[0];
  await prisma.appointment_slots.update({ where: { id: slot0.id }, data: { is_booked: true } });
  const appt3 = await prisma.appointments.create({
    data: {
      patient_id: patientProfile.id,
      doctor_id: doctor.id,
      slot_id: slot0.id,
      appointment_date: new Date('2026-04-14'),
      start_time: new Date('1970-01-01T09:00:00'),
      end_time: new Date('1970-01-01T09:30:00'),
      status: 'confirmed',
      reason: 'Follow-up and X-ray',
      created_by: patientUser.id,
    },
  });

  // Upcoming scheduled
  const slot1 = slots[1];
  await prisma.appointment_slots.update({ where: { id: slot1.id }, data: { is_booked: true } });
  const appt4 = await prisma.appointments.create({
    data: {
      patient_id: patientProfile.id,
      doctor_id: doctor.id,
      slot_id: slot1.id,
      appointment_date: new Date('2026-04-14'),
      start_time: new Date('1970-01-01T10:00:00'),
      end_time: new Date('1970-01-01T10:30:00'),
      status: 'scheduled',
      reason: 'Teeth whitening consultation',
      created_by: patientUser.id,
    },
  });

  // Cancelled
  const appt5 = await prisma.appointments.create({
    data: {
      patient_id: patientProfile.id,
      doctor_id: doctor.id,
      appointment_date: new Date('2026-03-28'),
      start_time: new Date('1970-01-01T11:00:00'),
      end_time: new Date('1970-01-01T11:30:00'),
      status: 'cancelled',
      reason: 'Pain in lower jaw',
      notes: 'Cancelled: patient unable to attend',
      created_by: patientUser.id,
    },
  });

  console.log('✅ 5 appointments created');

  // ─── Patient records ─────────────────────────────────────────────────────────
  await prisma.patient_records.createMany({
    data: [
      {
        patient_id: patientProfile.id,
        appointment_id: appt1.id,
        record_type: 'examination',
        title: 'Initial Examination',
        description: 'Full oral examination. Gums healthy. Small cavity on tooth 14 (upper left first molar). No other issues noted.',
        tooth_number: '14',
        treatment_date: new Date('2026-03-20'),
        created_by: doctor.id,
      },
      {
        patient_id: patientProfile.id,
        appointment_id: appt1.id,
        record_type: 'treatment',
        title: 'Professional Cleaning',
        description: 'Ultrasonic scaling and polishing performed. Patient advised on proper flossing technique.',
        treatment_date: new Date('2026-03-20'),
        created_by: doctor.id,
      },
      {
        patient_id: patientProfile.id,
        appointment_id: appt2.id,
        record_type: 'treatment',
        title: 'Composite Filling — Tooth 14',
        description: 'Class II composite filling placed on mesial surface of tooth 14. Local anesthesia administered (2% lidocaine). Post-op instructions given.',
        tooth_number: '14',
        treatment_date: new Date('2026-04-02'),
        created_by: doctor.id,
      },
      {
        patient_id: patientProfile.id,
        record_type: 'general_note',
        title: 'Allergy Alert',
        description: 'Patient is allergic to Penicillin. Latex allergy confirmed. Always use latex-free gloves and equipment.',
        treatment_date: new Date('2026-03-20'),
        created_by: doctor.id,
      },
    ],
  });
  console.log('✅ Patient records created');

  // ─── Inventory items ─────────────────────────────────────────────────────────
  const inventoryData = [
    { name: 'Latex-Free Nitrile Gloves (M)', sku: 'GLV-LF-M', category: 'Consumables', quantity: 200, minimum_quantity: 50, unit: 'box', cost_price: 18.5 },
    { name: 'Disposable Face Masks', sku: 'MASK-001', category: 'Consumables', quantity: 150, minimum_quantity: 40, unit: 'box', cost_price: 12.0 },
    { name: 'Local Anesthetic — Lidocaine 2%', sku: 'ANST-LID', category: 'Medication', quantity: 6, minimum_quantity: 10, unit: 'vial', cost_price: 95.0 },
    { name: 'Dental Composite Resin (A2)', sku: 'COMP-A2', category: 'Materials', quantity: 8, minimum_quantity: 5, unit: 'syringe', cost_price: 45.0 },
    { name: 'Dental X-Ray Film', sku: 'XRAY-001', category: 'Consumables', quantity: 50, minimum_quantity: 20, unit: 'pack', cost_price: 30.0 },
    { name: 'Sterilization Pouches', sku: 'STER-001', category: 'Sterilization', quantity: 300, minimum_quantity: 100, unit: 'pack', cost_price: 22.0 },
    { name: 'High-Speed Dental Bur Set', sku: 'BUR-HS-01', category: 'Instruments', quantity: 3, minimum_quantity: 5, unit: 'set', cost_price: 180.0 },
    { name: 'Dental Impression Material', sku: 'IMP-001', category: 'Materials', quantity: 12, minimum_quantity: 4, unit: 'tube', cost_price: 35.0 },
    { name: 'Articulating Paper (200μ)', sku: 'ART-001', category: 'Consumables', quantity: 20, minimum_quantity: 5, unit: 'booklet', cost_price: 8.5 },
    { name: 'Tooth Whitening Gel 35%', sku: 'WHT-001', category: 'Cosmetic', quantity: 15, minimum_quantity: 5, unit: 'syringe', cost_price: 55.0 },
  ];

  const inventoryItems: any[] = [];
  for (const item of inventoryData) {
    const inv = await prisma.inventory_items.upsert({
      where: { sku: item.sku },
      update: {},
      create: item,
    });
    inventoryItems.push(inv);
  }
  console.log(`✅ ${inventoryItems.length} inventory items created`);

  // ─── Inventory movements ──────────────────────────────────────────────────────
  const movementsData = [
    { item: inventoryItems[0], type: 'in', qty: 200, note: 'Initial stock' },
    { item: inventoryItems[1], type: 'in', qty: 150, note: 'Initial stock' },
    { item: inventoryItems[2], type: 'in', qty: 10, note: 'Initial stock' },
    { item: inventoryItems[2], type: 'out', qty: 4, note: 'Used for patient anesthesia' },
    { item: inventoryItems[3], type: 'in', qty: 10, note: 'Initial stock' },
    { item: inventoryItems[3], type: 'out', qty: 2, note: 'Used for tooth 14 filling' },
    { item: inventoryItems[6], type: 'in', qty: 3, note: 'Purchased from dental supplier' },
    { item: inventoryItems[9], type: 'in', qty: 15, note: 'Initial stock' },
    { item: inventoryItems[9], type: 'out', qty: 1, note: 'Used for whitening session' },
  ];

  for (const m of movementsData) {
    await prisma.inventory_movements.create({
      data: {
        item_id: m.item.id,
        movement_type: m.type,
        quantity: m.qty,
        note: m.note,
        performed_by: doctor.id,
      },
    });
  }
  console.log('✅ Inventory movements created');

  // ─── Notifications ────────────────────────────────────────────────────────────
  await prisma.notifications.createMany({
    data: [
      {
        user_id: patientUser.id,
        title: 'Appointment Confirmed',
        message: 'Your appointment on April 14th at 9:00 AM has been confirmed by Dr. Hassan.',
        type: 'appointment_confirmed',
        is_read: false,
      },
      {
        user_id: patientUser.id,
        title: 'Appointment Booked',
        message: 'Your appointment on April 14th at 10:00 AM has been successfully booked.',
        type: 'appointment_booked',
        is_read: true,
      },
      {
        user_id: patientUser.id,
        title: 'Appointment Cancelled',
        message: 'Your appointment on March 28th has been cancelled.',
        type: 'appointment_cancelled',
        is_read: true,
      },
      {
        user_id: doctor.id,
        title: 'New Appointment Request',
        message: 'Sara Ali has requested an appointment on April 14th at 10:00 AM.',
        type: 'appointment_booked',
        is_read: false,
      },
      {
        user_id: doctor.id,
        title: 'Inventory Alert',
        message: 'Local Anesthetic (Lidocaine 2%) is below minimum stock level (6 remaining, minimum 10).',
        type: 'inventory_low',
        is_read: false,
      },
    ],
  });
  console.log('✅ Notifications created');

  // ─── Payments ─────────────────────────────────────────────────────────────────
  await prisma.payments.createMany({
    data: [
      {
        patient_id: patientProfile.id,
        appointment_id: appt1.id,
        amount: 75.00,
        payment_method: 'cash',
        status: 'paid',
        description: 'Routine checkup and professional cleaning',
        paid_at: new Date('2026-03-20T10:00:00'),
        created_by: doctor.id,
      },
      {
        patient_id: patientProfile.id,
        appointment_id: appt2.id,
        amount: 150.00,
        payment_method: 'card',
        status: 'paid',
        description: 'Composite filling on tooth 14',
        paid_at: new Date('2026-04-02T11:00:00'),
        created_by: doctor.id,
      },
      {
        patient_id: patientProfile.id,
        appointment_id: appt3.id,
        amount: 60.00,
        payment_method: 'cash',
        status: 'pending',
        description: 'Follow-up and X-ray',
        created_by: doctor.id,
      },
      {
        patient_id: patientProfile.id,
        amount: 200.00,
        payment_method: 'insurance',
        status: 'paid',
        description: 'Dental X-ray series (full mouth)',
        paid_at: new Date('2026-02-15T09:30:00'),
        created_by: doctor.id,
      },
      {
        patient_id: patientProfile.id,
        amount: 120.00,
        payment_method: 'bank_transfer',
        status: 'refunded',
        description: 'Cancelled teeth whitening session — refunded',
        created_by: doctor.id,
      },
    ],
  });
  console.log('✅ Payments created');

  // ─── Expenses ─────────────────────────────────────────────────────────────────
  await prisma.expenses.createMany({
    data: [
      {
        title: 'Clinic Electricity Bill — March 2026',
        category: 'utilities',
        amount: 320.00,
        description: 'Monthly electricity bill for March 2026',
        expense_date: new Date('2026-03-31'),
        created_by: doctor.id,
      },
      {
        title: 'Clinic Rent — April 2026',
        category: 'rent',
        amount: 1500.00,
        description: 'Monthly clinic rent — Hamra Street',
        expense_date: new Date('2026-04-01'),
        created_by: doctor.id,
      },
      {
        title: 'Dental Supplies Order',
        category: 'supplies',
        amount: 850.00,
        description: 'Monthly supplies restock from DentaCare Supplier',
        expense_date: new Date('2026-04-05'),
        created_by: doctor.id,
      },
      {
        title: 'X-Ray Machine Maintenance',
        category: 'maintenance',
        amount: 250.00,
        description: 'Annual calibration and maintenance of dental X-ray equipment',
        expense_date: new Date('2026-03-15'),
        created_by: doctor.id,
      },
      {
        title: 'Internet & Phone — March 2026',
        category: 'utilities',
        amount: 85.00,
        description: 'Monthly telecom expenses',
        expense_date: new Date('2026-03-31'),
        created_by: doctor.id,
      },
      {
        title: 'Dental Chair — Repair',
        category: 'equipment',
        amount: 400.00,
        description: 'Repair of chair 2 hydraulic system',
        expense_date: new Date('2026-03-10'),
        created_by: doctor.id,
      },
      {
        title: 'Sterilization Autoclave Bags — Bulk',
        category: 'supplies',
        amount: 180.00,
        description: 'Bulk purchase of sterilization pouches',
        expense_date: new Date('2026-04-03'),
        created_by: doctor.id,
      },
      {
        title: 'Water Bill — March 2026',
        category: 'utilities',
        amount: 45.00,
        expense_date: new Date('2026-03-31'),
        created_by: doctor.id,
      },
    ],
  });
  console.log('✅ Expenses created');

  // ─── Audit log ────────────────────────────────────────────────────────────────
  await prisma.audit_logs.createMany({
    data: [
      {
        user_id: doctor.id,
        action: 'CREATE',
        table_name: 'appointments',
        record_id: appt1.id,
        new_data: { status: 'completed', reason: 'Routine checkup' },
      },
      {
        user_id: doctor.id,
        action: 'UPDATE',
        table_name: 'appointments',
        record_id: appt2.id,
        old_data: { status: 'scheduled' },
        new_data: { status: 'completed' },
      },
      {
        user_id: patientUser.id,
        action: 'CREATE',
        table_name: 'appointments',
        record_id: appt3.id,
        new_data: { status: 'confirmed', reason: 'Follow-up and X-ray' },
      },
    ],
  });
  console.log('✅ Audit logs created');

  console.log('\n🎉 Seed complete!');
  console.log('─────────────────────────────────────────');
  console.log('  doctor@demo.com   /  Demo123456  (admin)');
  console.log('  patient@demo.com  /  demo123  (patient)');
  console.log('─────────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
