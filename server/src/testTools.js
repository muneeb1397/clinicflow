import mongoose from 'mongoose';
import { seedDB } from './seed.js';
import { getSlots, bookSlot, saveIntake, checkInsurance } from './services/toolService.js';
import { Patient } from './models/Patient.js';
import { Slot } from './models/Slot.js';

async function runToolsTest() {
  console.log('=== Step 3: Tool Endpoints Test ===');
  await seedDB();

  // 1. Test getSlots
  const availableSlots = await getSlots();
  console.log(`Unbooked slots found: ${availableSlots.length}`);
  if (availableSlots.length === 0) {
    throw new Error('Expected unbooked slots from seed data');
  }

  const allUnbooked = availableSlots.every((s) => s.isBooked === false);
  if (!allUnbooked) {
    throw new Error('getSlots returned a booked slot!');
  }
  console.log('✅ Check 1 PASSED: getSlots returns only unbooked slots');

  // Find a patient for booking
  const patient = await Patient.findOne();
  if (!patient) throw new Error('No patient found in seed');

  const targetSlot = availableSlots[0];
  console.log(`Booking slot ${targetSlot.id} for patient ${patient.name}...`);

  // 2. Test bookSlot (first booking)
  const bookingResult = await bookSlot({
    slotId: targetSlot.id,
    patientId: patient._id.toString(),
    reason: 'Chest pain evaluation',
  });
  console.log('Booking Result:', bookingResult);

  if (!bookingResult.success || !bookingResult.appointment) {
    throw new Error('First booking failed!');
  }

  // Check that slot is now booked in DB
  const updatedSlotInDb = await Slot.findById(targetSlot.id);
  if (!updatedSlotInDb.isBooked) {
    throw new Error('Slot in DB was not marked as isBooked = true');
  }

  // 3. Test double-booking (second booking of same slot should be rejected with 400)
  let doubleBookingFailedAsExpected = false;
  try {
    await bookSlot({
      slotId: targetSlot.id,
      patientId: patient._id.toString(),
      reason: 'Second attempt',
    });
  } catch (err) {
    if (err.statusCode === 400) {
      doubleBookingFailedAsExpected = true;
      console.log('Second booking rejected as expected with status 400:', err.message);
    }
  }

  if (!doubleBookingFailedAsExpected) {
    throw new Error('Double booking of the same slot was NOT rejected!');
  }
  console.log('✅ Check 2 PASSED: bookSlot marks slot taken and rejects duplicate booking with 400');

  // 4. Test saveIntake
  const intakeResult = await saveIntake({
    patientId: patient._id.toString(),
    appointmentId: bookingResult.appointment.id,
    symptoms: ['Chest tightness', 'Shortness of breath'],
    medicalHistory: ['Asthma'],
    structuredData: { severity: 'moderate', durationDays: 2 },
  });
  if (!intakeResult.success || intakeResult.intake.symptoms.length !== 2) {
    throw new Error('saveIntake failed');
  }
  console.log('✅ Check 3 PASSED: saveIntake successfully saved symptoms into database');

  // 5. Test checkInsurance (valid policy)
  const validInsurance = await checkInsurance({ policyNumber: 'BC-987654' });
  console.log('Valid Insurance Result:', validInsurance);
  if (validInsurance.status !== 'covered') {
    throw new Error(`Expected 'covered' for policy BC-987654, got '${validInsurance.status}'`);
  }

  // 6. Test checkInsurance (fake policy)
  const fakeInsurance = await checkInsurance({ policyNumber: 'FAKE-999999' });
  console.log('Fake Insurance Result:', fakeInsurance);
  if (fakeInsurance.status !== 'not found') {
    throw new Error(`Expected 'not found' for policy FAKE-999999, got '${fakeInsurance.status}'`);
  }
  console.log('✅ Check 4 PASSED: checkInsurance returns "covered" for valid and "not found" for fake policy');

  // 7. Test invalid inputs (missing arguments -> 400)
  let invalidInputPassed = false;
  try {
    await checkInsurance({ policyNumber: '' });
  } catch (err) {
    if (err.statusCode === 400) invalidInputPassed = true;
  }
  if (!invalidInputPassed) {
    throw new Error('Invalid input did not return 400 error status!');
  }
  console.log('✅ Check 5 PASSED: Invalid inputs return status 400');

  console.log('\n🎉 ALL STEP 3 CHECKS PASSED SUCCESSFULLY!');
  await mongoose.connection.close();
}

runToolsTest().catch((err) => {
  console.error('Tools test failed:', err);
  process.exit(1);
});
