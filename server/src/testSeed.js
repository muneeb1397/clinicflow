import mongoose from 'mongoose';
import { seedDB } from './seed.js';
import { Doctor } from './models/Doctor.js';
import { Patient } from './models/Patient.js';
import { Slot } from './models/Slot.js';

async function testIdempotency() {
  console.log('--- Testing Seed Idempotency ---');
  
  // First run
  await seedDB();
  const docs1 = await Doctor.countDocuments();
  const patients1 = await Patient.countDocuments();
  const slots1 = await Slot.countDocuments();

  console.log(`First run counts -> Doctors: ${docs1}, Patients: ${patients1}, Slots: ${slots1}`);

  // Second run
  await seedDB();
  const docs2 = await Doctor.countDocuments();
  const patients2 = await Patient.countDocuments();
  const slots2 = await Slot.countDocuments();

  console.log(`Second run counts -> Doctors: ${docs2}, Patients: ${patients2}, Slots: ${slots2}`);

  if (docs1 === 3 && docs2 === 3 && patients1 === 5 && patients2 === 5 && slots1 === 50 && slots2 === 50) {
    console.log('✅ SUCCESS: Seeding is idempotent and creates no duplicates!');
  } else {
    console.error('❌ FAILURE: Seeding produced duplicate records or incorrect counts!');
    process.exit(1);
  }

  await mongoose.connection.close();
}

testIdempotency().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
