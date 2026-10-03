import mongoose from 'mongoose';
import { seedDB } from './seed.js';

async function runSeedTwice() {
  console.log('=== RUNNING SEED 1 ===');
  await seedDB();

  console.log('\n=== RUNNING SEED 2 (Checking Idempotency) ===');
  await seedDB();

  await mongoose.connection.close();
}

runSeedTwice().catch((err) => {
  console.error('Seed test failed:', err);
  process.exit(1);
});
