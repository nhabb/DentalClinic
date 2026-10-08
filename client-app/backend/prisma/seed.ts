import 'dotenv/config';
import { PrismaClient } from '../src/shared/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

// The seed connects as the migration login (postgres on Supabase), which bypasses
// row-level security, so it must set organization_id / branch_id explicitly on
// every row instead of relying on the request-scoped defaults the API uses.
const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log('🌱 Seeding database...');

  const demoHash = await bcrypt.hash('demo123', 10);

  // ─── Organization (tenant) + branches ───────────────────────────────────────
  const org = await prisma.organizations.upsert({
    where: { slug: 'brightsmile' },
    update: { name: 'BrightSmile Dental Clinic' },
    create: {
      name: 'BrightSmile Dental Clinic',
      slug: 'brightsmile',
      email: 'contact@brightsmile.com',
      phone: '+961 1 234 567',
      website_url: 'https://brightsmile.com',
      description:
        'Leading dental clinic in Lebanon offering comprehensive dental care.',
    },
  });
  console.log(`✅ Organization: ${org.name} (ID ${org.id})`);

  const beirut = await prisma.branches.upsert({
    where: {
      organization_id_name: { organization_id: org.id, name: 'Beirut Branch' },
    },
    update: {},
    create: {
      organization_id: org.id,
      name: 'Beirut Branch',
      code: 'BEY',
      city: 'Beirut',
      governate: 'Beirut',
      address: 'Hamra Street, Beirut, Lebanon',
      phone: '+961 1 234 567',
      opening_hours: 'Mon-Fri 8:00-18:00, Sat 9:00-14:00',
      is_default: true,
    },
  });
  const tyre = await prisma.branches.upsert({
    where: {
      organization_id_name: { organization_id: org.id, name: 'Tyre Branch' },
    },
    update: {},
    create: {
      organization_id: org.id,
      name: 'Tyre Branch',
      code: 'TYR',
      city: 'Tyre',
      governate: 'South',
      address: 'Al Bass Street, Tyre, Lebanon',
      phone: '+961 7 345 678',
      opening_hours: 'Mon-Sat 9:00-17:00',
    },
  });
  console.log(`✅ Branches: ${beirut.name} (default), ${tyre.name}`);

  // ─── Main accounts (use demo emails that exist in Supabase auth) ────────────
  const doctor = await prisma.users.upsert({
    where: { email: 'doctor@demo.com' },
    update: {
      first_name: 'Ahmed',
      last_name: 'Hassan',
      role: 'admin',
      phone: '+961 3 123 456',
      gender: 'male',
      organization_id: org.id,
    },
    create: {
      organization_id: org.id,
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
    update: {
      role: 'secretary',
      organization_id: org.id,
      branch_id: beirut.id,
    },
    create: {
      organization_id: org.id,
      branch_id: beirut.id,
      email: 'secretary@demo.com',
      password_hash: demoHash,
      first_name: 'Demo',
      last_name: 'Secretary',
      role: 'secretary',
    },
  });

  // Platform superadmin: belongs to no organization and bypasses tenant isolation.
  await prisma.users.upsert({
    where: { email: 'super@demo.com' },
    update: { role: 'superadmin', organization_id: null },
    create: {
      organization_id: null,
      email: 'super@demo.com',
      password_hash: demoHash,
      first_name: 'Platform',
      last_name: 'Admin',
      role: 'superadmin',
    },
  });

  const patientUser = await prisma.users.upsert({
    where: { email: 'patient@demo.com' },
    update: {
      first_name: 'Sara',
      last_name: 'Ali',
      role: 'patient',
      phone: '+961 70 987 654',
      gender: 'female',
      date_of_birth: new Date('1992-06-15'),
      organization_id: org.id,
    },
    create: {
      organization_id: org.id,
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
      organization_id: org.id,
      user_id: patientUser.id,
      blood_type: 'A+',
      allergies: 'Penicillin, Latex',
      medical_notes:
        'Patient has mild anxiety during procedures. Prefers morning appointments.',
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

  // ─── Clinic profile (organization-wide) ─────────────────────────────────────
  const existingClinic = await prisma.clinic_profile.findFirst({
    where: { organization_id: org.id, branch_id: null },
  });
  if (!existingClinic) {
    await prisma.clinic_profile.create({
      data: {
        organization_id: org.id,
        name: 'BrightSmile Dental Clinic',
        phone: '+961 1 234 567',
        email: 'contact@brightsmile.com',
        address: 'Hamra Street, Beirut, Lebanon',
        website_url: 'https://brightsmile.com',
        description:
          'Leading dental clinic in Beirut offering comprehensive dental care.',
        opening_hours: 'Mon-Fri 8:00-18:00, Sat 9:00-14:00',
      },
    });
    console.log('✅ Clinic profile created');
  }

  // ─── Appointment slots (both branches) ──────────────────────────────────────
  const slotDates = [
    { date: '2026-04-14', from: '09:00', to: '09:30', branch: beirut },
    { date: '2026-04-14', from: '10:00', to: '10:30', branch: beirut },
    { date: '2026-04-14', from: '11:00', to: '11:30', branch: beirut },
    { date: '2026-04-15', from: '09:00', to: '09:30', branch: beirut },
    { date: '2026-04-15', from: '14:00', to: '14:30', branch: tyre },
    { date: '2026-04-16', from: '10:00', to: '10:30', branch: tyre },
    { date: '2026-04-17', from: '09:30', to: '10:00', branch: tyre },
    { date: '2026-04-17', from: '15:00', to: '15:30', branch: beirut },
  ];

  const slots: any[] = [];
  for (const s of slotDates) {
    const slot = await prisma.appointment_slots.create({
      data: {
        organization_id: org.id,
        branch_id: s.branch.id,
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
  const appt1 = await prisma.appointments.create({
    data: {
      organization_id: org.id,
      branch_id: beirut.id,
      patient_id: patientProfile.id,
      doctor_id: doctor.id,
      appointment_date: new Date('2026-03-20'),
      start_time: new Date('1970-01-01T09:00:00'),
      end_time: new Date('1970-01-01T09:30:00'),
      status: 'completed',
      reason: 'Routine checkup and cleaning',
      notes:
        'Full cleaning performed. Small cavity on tooth 14 noted — scheduled for filling.',
      created_by: doctor.id,
    },
  });

  const appt2 = await prisma.appointments.create({
    data: {
      organization_id: org.id,
      branch_id: beirut.id,
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

  const slot0 = slots[0];
  await prisma.appointment_slots.update({
    where: { id: slot0.id },
    data: { is_booked: true },
  });
  const appt3 = await prisma.appointments.create({
    data: {
      organization_id: org.id,
      branch_id: slot0.branch_id,
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

  const slot4 = slots[4]; // Tyre
  await prisma.appointment_slots.update({
    where: { id: slot4.id },
    data: { is_booked: true },
  });
  await prisma.appointments.create({
    data: {
      organization_id: org.id,
      branch_id: slot4.branch_id,
      patient_id: patientProfile.id,
      doctor_id: doctor.id,
      slot_id: slot4.id,
      appointment_date: new Date('2026-04-15'),
      start_time: new Date('1970-01-01T14:00:00'),
      end_time: new Date('1970-01-01T14:30:00'),
      status: 'scheduled',
      reason: 'Teeth whitening consultation',
      created_by: patientUser.id,
    },
  });

  await prisma.appointments.create({
    data: {
      organization_id: org.id,
      branch_id: beirut.id,
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
        organization_id: org.id,
        branch_id: beirut.id,
        patient_id: patientProfile.id,
        appointment_id: appt1.id,
        record_type: 'examination',
        title: 'Initial Examination',
        description:
          'Full oral examination. Gums healthy. Small cavity on tooth 14 (upper left first molar). No other issues noted.',
        tooth_number: '14',
        treatment_date: new Date('2026-03-20'),
        created_by: doctor.id,
      },
      {
        organization_id: org.id,
        branch_id: beirut.id,
        patient_id: patientProfile.id,
        appointment_id: appt1.id,
        record_type: 'treatment',
        title: 'Professional Cleaning',
        description:
          'Ultrasonic scaling and polishing performed. Patient advised on proper flossing technique.',
        treatment_date: new Date('2026-03-20'),
        created_by: doctor.id,
      },
      {
        organization_id: org.id,
        branch_id: beirut.id,
        patient_id: patientProfile.id,
        appointment_id: appt2.id,
        record_type: 'treatment',
        title: 'Composite Filling — Tooth 14',
        description:
          'Class II composite filling placed on mesial surface of tooth 14. Local anesthesia administered (2% lidocaine). Post-op instructions given.',
        tooth_number: '14',
        treatment_date: new Date('2026-04-02'),
        created_by: doctor.id,
      },
      {
        organization_id: org.id,
        patient_id: patientProfile.id,
        record_type: 'general_note',
        title: 'Allergy Alert',
        description:
          'Patient is allergic to Penicillin. Latex allergy confirmed. Always use latex-free gloves and equipment.',
        treatment_date: new Date('2026-03-20'),
        created_by: doctor.id,
      },
    ],
  });
  console.log('✅ Patient records created');

  // ─── Inventory items (stock is per branch) ──────────────────────────────────
  const inventoryData = [
    {
      name: 'Latex-Free Nitrile Gloves (M)',
      sku: 'GLV-LF-M',
      category: 'Consumables',
      quantity: 200,
      minimum_quantity: 50,
      unit: 'box',
      cost_price: 18.5,
      branch: beirut,
    },
    {
      name: 'Disposable Face Masks',
      sku: 'MASK-001',
      category: 'Consumables',
      quantity: 150,
      minimum_quantity: 40,
      unit: 'box',
      cost_price: 12.0,
      branch: beirut,
    },
    {
      name: 'Local Anesthetic — Lidocaine 2%',
      sku: 'ANST-LID',
      category: 'Medication',
      quantity: 6,
      minimum_quantity: 10,
      unit: 'vial',
      cost_price: 95.0,
      branch: beirut,
    },
    {
      name: 'Dental Composite Resin (A2)',
      sku: 'COMP-A2',
      category: 'Materials',
      quantity: 8,
      minimum_quantity: 5,
      unit: 'syringe',
      cost_price: 45.0,
      branch: beirut,
    },
    {
      name: 'Dental X-Ray Film',
      sku: 'XRAY-001',
      category: 'Consumables',
      quantity: 50,
      minimum_quantity: 20,
      unit: 'pack',
      cost_price: 30.0,
      branch: beirut,
    },
    {
      name: 'Sterilization Pouches',
      sku: 'STER-001',
      category: 'Sterilization',
      quantity: 300,
      minimum_quantity: 100,
      unit: 'pack',
      cost_price: 22.0,
      branch: beirut,
    },
    {
      name: 'High-Speed Dental Bur Set',
      sku: 'BUR-HS-01',
      category: 'Instruments',
      quantity: 3,
      minimum_quantity: 5,
      unit: 'set',
      cost_price: 180.0,
      branch: beirut,
    },
    {
      name: 'Dental Impression Material',
      sku: 'IMP-001',
      category: 'Materials',
      quantity: 12,
      minimum_quantity: 4,
      unit: 'tube',
      cost_price: 35.0,
      branch: beirut,
    },
    {
      name: 'Articulating Paper (200μ)',
      sku: 'ART-001',
      category: 'Consumables',
      quantity: 20,
      minimum_quantity: 5,
      unit: 'booklet',
      cost_price: 8.5,
      branch: beirut,
    },
    {
      name: 'Tooth Whitening Gel 35%',
      sku: 'WHT-001',
      category: 'Cosmetic',
      quantity: 15,
      minimum_quantity: 5,
      unit: 'syringe',
      cost_price: 55.0,
      branch: beirut,
    },
    // The same SKUs can be stocked separately at the Tyre branch.
    {
      name: 'Latex-Free Nitrile Gloves (M)',
      sku: 'GLV-LF-M',
      category: 'Consumables',
      quantity: 60,
      minimum_quantity: 30,
      unit: 'box',
      cost_price: 18.5,
      branch: tyre,
    },
    {
      name: 'Disposable Face Masks',
      sku: 'MASK-001',
      category: 'Consumables',
      quantity: 40,
      minimum_quantity: 20,
      unit: 'box',
      cost_price: 12.0,
      branch: tyre,
    },
  ];

  const inventoryItems: any[] = [];
  for (const { branch, ...item } of inventoryData) {
    const inv = await prisma.inventory_items.upsert({
      where: { branch_id_sku: { branch_id: branch.id, sku: item.sku } },
      update: {},
      create: { ...item, organization_id: org.id, branch_id: branch.id },
    });
    inventoryItems.push(inv);
  }
  console.log(`✅ ${inventoryItems.length} inventory items created`);

  // ─── Inventory movements ──────────────────────────────────────────────────────
  const movementsData = [
    { item: inventoryItems[0], type: 'in', qty: 200, note: 'Initial stock' },
    { item: inventoryItems[1], type: 'in', qty: 150, note: 'Initial stock' },
    { item: inventoryItems[2], type: 'in', qty: 10, note: 'Initial stock' },
    {
      item: inventoryItems[2],
      type: 'out',
      qty: 4,
      note: 'Used for patient anesthesia',
    },
    { item: inventoryItems[3], type: 'in', qty: 10, note: 'Initial stock' },
    {
      item: inventoryItems[3],
      type: 'out',
      qty: 2,
      note: 'Used for tooth 14 filling',
    },
    {
      item: inventoryItems[6],
      type: 'in',
      qty: 3,
      note: 'Purchased from dental supplier',
    },
    { item: inventoryItems[9], type: 'in', qty: 15, note: 'Initial stock' },
    {
      item: inventoryItems[9],
      type: 'out',
      qty: 1,
      note: 'Used for whitening session',
    },
    {
      item: inventoryItems[10],
      type: 'in',
      qty: 60,
      note: 'Initial stock (Tyre)',
    },
  ];

  for (const m of movementsData) {
    await prisma.inventory_movements.create({
      data: {
        organization_id: org.id,
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
        organization_id: org.id,
        user_id: patientUser.id,
        title: 'Appointment Confirmed',
        message:
          'Your appointment on April 14th at 9:00 AM has been confirmed by Dr. Hassan.',
        type: 'appointment_confirmed',
        is_read: false,
      },
      {
        organization_id: org.id,
        user_id: patientUser.id,
        title: 'Appointment Booked',
        message:
          'Your appointment on April 15th at 2:00 PM (Tyre Branch) has been successfully booked.',
        type: 'appointment_booked',
        is_read: true,
      },
      {
        organization_id: org.id,
        user_id: patientUser.id,
        title: 'Appointment Cancelled',
        message: 'Your appointment on March 28th has been cancelled.',
        type: 'appointment_cancelled',
        is_read: true,
      },
      {
        organization_id: org.id,
        user_id: doctor.id,
        title: 'New Appointment Request',
        message:
          'Sara Ali has requested an appointment on April 15th at 2:00 PM at the Tyre Branch.',
        type: 'appointment_booked',
        is_read: false,
      },
      {
        organization_id: org.id,
        user_id: doctor.id,
        title: 'Inventory Alert',
        message:
          'Local Anesthetic (Lidocaine 2%) is below minimum stock level (6 remaining, minimum 10).',
        type: 'inventory_low',
        is_read: false,
      },
    ],
  });
  console.log('✅ Notifications created');

  // ─── Treatment invoices + payments ───────────────────────────────────────────
  const invoice1 = await prisma.treatment_invoices.create({
    data: {
      organization_id: org.id,
      branch_id: beirut.id,
      patient_id: patientProfile.id,
      procedure_date: new Date('2026-03-20'),
      notes: 'Routine checkup and professional cleaning',
      total_amount: 75,
      amount_paid: 75,
      remaining_amount: 0,
      status: 'paid',
      created_by: doctor.id,
      line_items: {
        create: [
          { organization_id: org.id, procedure_name: 'Checkup', amount: 25 },
          {
            organization_id: org.id,
            procedure_name: 'Teeth Cleaning',
            amount: 50,
          },
        ],
      },
      invoice_payments: {
        create: [
          {
            organization_id: org.id,
            amount: 75,
            payment_method: 'cash',
            created_by: doctor.id,
          },
        ],
      },
    },
  });

  await prisma.treatment_invoices.create({
    data: {
      organization_id: org.id,
      branch_id: beirut.id,
      patient_id: patientProfile.id,
      procedure_date: new Date('2026-04-02'),
      notes: 'Composite filling on tooth 14',
      total_amount: 150,
      amount_paid: 100,
      remaining_amount: 50,
      status: 'partial',
      created_by: doctor.id,
      line_items: {
        create: [
          {
            organization_id: org.id,
            procedure_name: 'Filling',
            amount: 150,
            tooth_number: '14',
          },
        ],
      },
      invoice_payments: {
        create: [
          {
            organization_id: org.id,
            amount: 100,
            payment_method: 'card',
            created_by: doctor.id,
          },
        ],
      },
    },
  });
  console.log(`✅ Treatment invoices created (first ID ${invoice1.id})`);

  // ─── Expenses (per branch) ────────────────────────────────────────────────────
  await prisma.expenses.createMany({
    data: [
      {
        organization_id: org.id,
        branch_id: beirut.id,
        title: 'Clinic Electricity Bill — March 2026',
        category: 'utilities',
        amount: 320.0,
        description: 'Monthly electricity bill for March 2026',
        expense_date: new Date('2026-03-31'),
        created_by: doctor.id,
      },
      {
        organization_id: org.id,
        branch_id: beirut.id,
        title: 'Clinic Rent — April 2026',
        category: 'rent',
        amount: 1500.0,
        description: 'Monthly clinic rent — Hamra Street',
        expense_date: new Date('2026-04-01'),
        created_by: doctor.id,
      },
      {
        organization_id: org.id,
        branch_id: tyre.id,
        title: 'Clinic Rent — April 2026 (Tyre)',
        category: 'rent',
        amount: 900.0,
        description: 'Monthly clinic rent — Al Bass Street',
        expense_date: new Date('2026-04-01'),
        created_by: doctor.id,
      },
      {
        organization_id: org.id,
        branch_id: beirut.id,
        title: 'Dental Supplies Order',
        category: 'supplies',
        amount: 850.0,
        description: 'Monthly supplies restock from DentaCare Supplier',
        expense_date: new Date('2026-04-05'),
        created_by: doctor.id,
      },
      {
        organization_id: org.id,
        branch_id: beirut.id,
        title: 'X-Ray Machine Maintenance',
        category: 'maintenance',
        amount: 250.0,
        description:
          'Annual calibration and maintenance of dental X-ray equipment',
        expense_date: new Date('2026-03-15'),
        created_by: doctor.id,
      },
      {
        organization_id: org.id,
        branch_id: null,
        title: 'Internet & Phone — March 2026',
        category: 'utilities',
        amount: 85.0,
        description: 'Organization-wide telecom expenses',
        expense_date: new Date('2026-03-31'),
        created_by: doctor.id,
      },
      {
        organization_id: org.id,
        branch_id: beirut.id,
        title: 'Dental Chair — Repair',
        category: 'equipment',
        amount: 400.0,
        description: 'Repair of chair 2 hydraulic system',
        expense_date: new Date('2026-03-10'),
        created_by: doctor.id,
      },
      {
        organization_id: org.id,
        branch_id: tyre.id,
        title: 'Water Bill — March 2026 (Tyre)',
        category: 'utilities',
        amount: 45.0,
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
        organization_id: org.id,
        user_id: doctor.id,
        action: 'CREATE',
        table_name: 'appointments',
        record_id: appt1.id,
        new_data: { status: 'completed', reason: 'Routine checkup' },
      },
      {
        organization_id: org.id,
        user_id: doctor.id,
        action: 'UPDATE',
        table_name: 'appointments',
        record_id: appt2.id,
        old_data: { status: 'scheduled' },
        new_data: { status: 'completed' },
      },
      {
        organization_id: org.id,
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
  console.log('  doctor@demo.com     /  demo123  (admin, BrightSmile)');
  console.log('  secretary@demo.com  /  demo123  (secretary, Beirut Branch)');
  console.log('  patient@demo.com    /  demo123  (patient)');
  console.log('  super@demo.com      /  demo123  (platform superadmin)');
  console.log('─────────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
