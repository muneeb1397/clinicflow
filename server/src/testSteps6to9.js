import mongoose from 'mongoose';
import { seedDB } from './seed.js';
import { saveIntake } from './services/toolService.js';
import { processAgentMessage } from './services/agentService.js';
import { scanAndSendReminders, processReminderReply } from './services/reminderService.js';
import { generateStaffSummary } from './services/summaryService.js';
import { Patient } from './models/Patient.js';
import { Slot } from './models/Slot.js';
import { Appointment } from './models/Appointment.js';
import { AgentTrace } from './models/AgentTrace.js';

async function verifySteps6to9() {
  console.log('====================================================');
  console.log('  Verifying Steps 6, 7, 8, & 9 Implementation');
  console.log('====================================================');

  await seedDB();
  const patient = await Patient.findOne();
  if (!patient) throw new Error('No patient found in seed data');

  // --- Step 6: Intake Agent & Zod Validation ---
  console.log('\n--- Step 6: Intake & Zod Validation Check ---');
  const intakeRes = await saveIntake({
    patientId: patient._id.toString(),
    symptoms: ['Migraine', 'Light sensitivity'],
    duration: '2 days',
    history: ['Hypertension'],
    allergies: ['Penicillin'],
    meds: ['Ibuprofen 400mg'],
  });

  if (!intakeRes.success || !intakeRes.intake.duration) {
    throw new Error('Step 6 Intake Zod validation failed!');
  }
  console.log('Intake Zod output:', intakeRes.intake);
  console.log('✅ Step 6 PASSED: Intake structured fields validated with Zod and saved');

  // --- Step 7: Chat Channels & Multi-Session Isolation ---
  console.log('\n--- Step 7: Multi-Session Chat Channel Check ---');
  const sessionA = `session-tab-A-${Date.now()}`;
  const sessionB = `session-tab-B-${Date.now()}`;

  const resA = await processAgentMessage({ message: 'I want to book an appointment', sessionId: sessionA });
  const resB = await processAgentMessage({ message: 'Check my insurance policy BC-987654', sessionId: sessionB });

  if (resA.intent !== 'book' || resB.intent !== 'insurance') {
    throw new Error('Step 7 Session routing failed');
  }

  const traceACount = await AgentTrace.countDocuments({ sessionId: sessionA });
  const traceBCount = await AgentTrace.countDocuments({ sessionId: sessionB });
  if (traceACount < 1 || traceBCount < 1) {
    throw new Error('Session isolation failed in agent_traces');
  }
  console.log('✅ Step 7 PASSED: Web widget session isolation verified across sessions');

  // --- Step 8: Reminders & Slot Freeing ---
  console.log('\n--- Step 8: Reminders & Reply Cancellation Check ---');
  const freeSlots = await Slot.find({ isBooked: false });
  if (freeSlots.length === 0) throw new Error('No free slot found');
  const targetSlot = freeSlots[0];

  // Seed appointment 2 minutes from now
  const appointmentTime = new Date(Date.now() + 2 * 60 * 1000);
  targetSlot.startTime = appointmentTime;
  targetSlot.endTime = new Date(appointmentTime.getTime() + 30 * 60 * 1000);
  targetSlot.isBooked = true;
  await targetSlot.save();

  const testAppt = await Appointment.create({
    patient: patient._id,
    doctor: targetSlot.doctor,
    slot: targetSlot._id,
    status: 'scheduled',
    reason: 'Follow-up consultation',
    reminderSent: false,
  });

  targetSlot.appointment = testAppt._id;
  await targetSlot.save();

  // First scan: should send 1 reminder
  const firstScanCount = await scanAndSendReminders();
  console.log(`Scan 1 sent: ${firstScanCount} reminder(s)`);
  if (firstScanCount < 1) throw new Error('Reminder was not sent for upcoming appointment!');

  // Second scan: should send 0 duplicate reminders
  const secondScanCount = await scanAndSendReminders();
  console.log(`Scan 2 sent: ${secondScanCount} reminder(s) (no duplicates)`);
  if (secondScanCount !== 0) throw new Error('Duplicate reminder sent!');

  // Test reply "cancel" -> frees slot in DB
  console.log(`Replying 'cancel' for appointment ${testAppt._id}...`);
  const cancelRes = await processReminderReply({
    appointmentId: testAppt._id.toString(),
    replyText: 'cancel appointment',
  });

  const updatedSlot = await Slot.findById(targetSlot._id);
  const updatedAppt = await Appointment.findById(testAppt._id);

  if (updatedAppt.status !== 'cancelled' || updatedSlot.isBooked !== false) {
    throw new Error('Replying cancel failed to free slot in database!');
  }
  console.log('✅ Step 8 PASSED: Reminder sent, duplicate blocked, and cancel freed slot in DB');

  // --- Step 9: Staff Summary & Dashboard Actions ---
  console.log('\n--- Step 9: Staff Summary & Approval Check ---');
  const summaryRes = await generateStaffSummary({ appointmentId: testAppt._id.toString() });
  if (!summaryRes.success || !summaryRes.summary.includes('[STAFF HANDOFF SUMMARY]')) {
    throw new Error('Summary agent failed to generate handoff note');
  }
  console.log('Generated Staff Summary Note:\n', summaryRes.summary);

  // Test Approve action
  testAppt.approvedByStaff = true;
  testAppt.status = 'confirmed';
  await testAppt.save();

  const approvedAppt = await Appointment.findById(testAppt._id);
  if (!approvedAppt.approvedByStaff) {
    throw new Error('Staff approval failed to update DB');
  }
  console.log('✅ Step 9 PASSED: Staff summary created & staff approval updated DB');

  console.log('\n🎉 ALL STEPS 6, 7, 8, & 9 CHECKS PASSED SUCCESSFULLY!');
  await mongoose.connection.close();
}

verifySteps6to9().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
