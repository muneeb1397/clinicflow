import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from './db.js';
import { Doctor } from './models/Doctor.js';
import { Patient } from './models/Patient.js';
import { Slot } from './models/Slot.js';
import { Appointment } from './models/Appointment.js';
import { Intake } from './models/Intake.js';
import { AgentTrace } from './models/AgentTrace.js';

dotenv.config();

const initialDoctors = [
  {
    name: 'Dr. Sarah Jenkins',
    specialty: 'Cardiology',
    email: 'sarah.jenkins@clinic.com',
    phone: '+1-555-0101',
    room: 'Room 101',
  },
  {
    name: 'Dr. Michael Chen',
    specialty: 'General Practice',
    email: 'michael.chen@clinic.com',
    phone: '+1-555-0102',
    room: 'Room 102',
  },
  {
    name: 'Dr. Emily Rodriguez',
    specialty: 'Pediatrics',
    email: 'emily.rodriguez@clinic.com',
    phone: '+1-555-0103',
    room: 'Room 103',
  },
];

const initialPatients = [
  {
    name: 'Alice Smith',
    email: 'alice.smith@example.com',
    phone: '+1-555-0201',
    dob: new Date('1990-05-14'),
    insuranceProvider: 'BlueCross',
    insurancePolicyNumber: 'BC-987654',
    medicalHistory: ['Asthma'],
  },
  {
    name: 'Bob Jones',
    email: 'bob.jones@example.com',
    phone: '+1-555-0202',
    dob: new Date('1985-11-23'),
    insuranceProvider: 'Aetna',
    insurancePolicyNumber: 'AET-123456',
    medicalHistory: ['Hypertension'],
  },
  {
    name: 'Charlie Brown',
    email: 'charlie.brown@example.com',
    phone: '+1-555-0203',
    dob: new Date('1998-02-10'),
    insuranceProvider: 'Cigna',
    insurancePolicyNumber: 'CIG-456789',
    medicalHistory: [],
  },
  {
    name: 'Diana Prince',
    email: 'diana.prince@example.com',
    phone: '+1-555-0204',
    dob: new Date('1992-08-30'),
    insuranceProvider: 'UnitedHealth',
    insurancePolicyNumber: 'UH-112233',
    medicalHistory: ['Migraine'],
  },
  {
    name: 'Evan Wright',
    email: 'evan.wright@example.com',
    phone: '+1-555-0205',
    dob: new Date('1976-12-05'),
    insuranceProvider: 'Kaiser',
    insurancePolicyNumber: 'KP-778899',
    medicalHistory: ['Type 2 Diabetes'],
  },
];

export async function seedDB() {
  console.log('Seeding database...');
  await connectDB();

  // Clear collections for complete idempotency
  await Doctor.deleteMany({});
  await Patient.deleteMany({});
  await Slot.deleteMany({});
  await Appointment.deleteMany({});
  await Intake.deleteMany({});
  await AgentTrace.deleteMany({});

  // 1. Seed Doctors (3 doctors)
  const seededDoctors = await Doctor.insertMany(initialDoctors);

  // 2. Seed Patients (5 fake patients)
  const seededPatients = await Patient.insertMany(initialPatients);

  // 3. Seed Slots (50 slots total distributed among doctors)
  const slotCounts = [17, 17, 16];
  const slotsToInsert = [];

  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + 1);
  baseDate.setHours(9, 0, 0, 0);

  for (let i = 0; i < seededDoctors.length; i++) {
    const doc = seededDoctors[i];
    const count = slotCounts[i];

    for (let s = 0; s < count; s++) {
      const dayOffset = Math.floor(s / 8);
      const slotIndexInDay = s % 8;

      const startTime = new Date(baseDate);
      startTime.setDate(startTime.getDate() + dayOffset);
      startTime.setHours(9 + Math.floor(slotIndexInDay * 0.5), (slotIndexInDay % 2) * 30, 0, 0);

      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + 30);

      slotsToInsert.push({
        doctor: doc._id,
        startTime,
        endTime,
        isBooked: false,
      });
    }
  }

  await Slot.insertMany(slotsToInsert);

  // Print Collection Counts
  const doctorCount = await Doctor.countDocuments();
  const patientCount = await Patient.countDocuments();
  const slotCount = await Slot.countDocuments();
  const appointmentCount = await Appointment.countDocuments();
  const intakeCount = await Intake.countDocuments();
  const traceCount = await AgentTrace.countDocuments();

  console.log('Collection counts:');
  console.log(`  doctors: ${doctorCount}`);
  console.log(`  patients: ${patientCount}`);
  console.log(`  slots: ${slotCount}`);
  console.log(`  appointments: ${appointmentCount}`);
  console.log(`  intakes: ${intakeCount}`);
  console.log(`  agent_traces: ${traceCount}`);
  console.log('Database seeding complete!');
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedDB()
    .then(() => mongoose.connection.close())
    .catch((err) => {
      console.error('Seed failed:', err.message);
      process.exit(1);
    });
}
