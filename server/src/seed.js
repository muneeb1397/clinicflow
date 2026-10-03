import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from './db.js';
import { Doctor } from './models/Doctor.js';
import { Patient } from './models/Patient.js';
import { Slot } from './models/Slot.js';

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

  // 1. Seed Doctors (3 doctors)
  const seededDoctors = [];
  for (const docData of initialDoctors) {
    const doc = await Doctor.findOneAndUpdate(
      { email: docData.email },
      docData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    seededDoctors.push(doc);
  }
  console.log(`Seeded ${seededDoctors.length} doctors.`);

  // 2. Seed Patients (5 fake patients)
  const seededPatients = [];
  for (const patientData of initialPatients) {
    const patient = await Patient.findOneAndUpdate(
      { email: patientData.email },
      patientData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    seededPatients.push(patient);
  }
  console.log(`Seeded ${seededPatients.length} patients.`);

  // 3. Seed Slots (50 slots total distributed among doctors)
  // Doctor 1: 17 slots, Doctor 2: 17 slots, Doctor 3: 16 slots
  const slotCounts = [17, 17, 16];
  let totalSlotsSeeded = 0;

  // Base date starting tomorrow morning at 09:00 AM
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + 1);
  baseDate.setHours(9, 0, 0, 0);

  for (let i = 0; i < seededDoctors.length; i++) {
    const doc = seededDoctors[i];
    const count = slotCounts[i];

    for (let s = 0; s < count; s++) {
      // 30 min per slot, jump to next day if past 5 PM (16:30 end)
      const dayOffset = Math.floor(s / 8);
      const slotIndexInDay = s % 8;

      const startTime = new Date(baseDate);
      startTime.setDate(startTime.getDate() + dayOffset);
      startTime.setHours(9 + Math.floor(slotIndexInDay * 0.5), (slotIndexInDay % 2) * 30, 0, 0);

      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + 30);

      await Slot.findOneAndUpdate(
        { doctor: doc._id, startTime },
        {
          doctor: doc._id,
          startTime,
          endTime,
          isBooked: false,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      totalSlotsSeeded++;
    }
  }

  console.log(`Seeded ${totalSlotsSeeded} slots across ${seededDoctors.length} doctors.`);
  console.log('Database seeding complete!');
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedDB()
    .then(() => mongoose.connection.close())
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
