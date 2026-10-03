import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { Slot } from '../models/Slot.js';
import { Doctor } from '../models/Doctor.js';
import { Patient } from '../models/Patient.js';
import { Appointment } from '../models/Appointment.js';
import { Intake } from '../models/Intake.js';
import { validateIntakeData } from '../schemas/intakeSchema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const insurersFilePath = path.join(__dirname, '../data/insurers.json');

// Load mock insurance database
function getInsurers() {
  try {
    const raw = readFileSync(insurersFilePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read insurers.json:', err.message);
    return [];
  }
}

/**
 * 1. getSlots
 * Returns only unbooked slots, optionally filtered by doctorId, specialty, or date.
 */
export async function getSlots({ doctorId, specialty, date } = {}) {
  const query = { isBooked: false };

  if (doctorId && mongoose.Types.ObjectId.isValid(doctorId)) {
    query.doctor = doctorId;
  }

  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    query.startTime = { $gte: startOfDay, $lte: endOfDay };
  }

  let slots = await Slot.find(query).populate('doctor').sort({ startTime: 1 });

  if (specialty) {
    slots = slots.filter(
      (slot) => slot.doctor && slot.doctor.specialty.toLowerCase().includes(specialty.toLowerCase())
    );
  }

  return slots.map((slot) => ({
    id: slot._id.toString(),
    doctorId: slot.doctor?._id?.toString(),
    doctorName: slot.doctor?.name,
    specialty: slot.doctor?.specialty,
    startTime: slot.startTime,
    endTime: slot.endTime,
    isBooked: slot.isBooked,
  }));
}

/**
 * 2. bookSlot
 * Marks the slot as taken and creates an appointment. Rejects double-booking with 400.
 */
export async function bookSlot({ slotId, patientId, reason = 'General Consultation', notes = '' } = {}) {
  if (!slotId || !patientId) {
    const err = new Error('Invalid input: slotId and patientId are required');
    err.statusCode = 400;
    throw err;
  }

  if (!mongoose.Types.ObjectId.isValid(slotId) || !mongoose.Types.ObjectId.isValid(patientId)) {
    const err = new Error('Invalid input: slotId and patientId must be valid IDs');
    err.statusCode = 400;
    throw err;
  }

  const patient = await Patient.findById(patientId);
  if (!patient) {
    const err = new Error('Patient not found');
    err.statusCode = 400;
    throw err;
  }

  // Atomically claim slot if isBooked === false
  const updatedSlot = await Slot.findOneAndUpdate(
    { _id: slotId, isBooked: false },
    { $set: { isBooked: true } },
    { new: true }
  );

  if (!updatedSlot) {
    const err = new Error('Slot unavailable or already booked');
    err.statusCode = 400;
    throw err;
  }

  // Create appointment
  const appointment = await Appointment.create({
    patient: patientId,
    doctor: updatedSlot.doctor,
    slot: updatedSlot._id,
    status: 'scheduled',
    reason,
    notes,
  });

  // Attach appointment to slot
  updatedSlot.appointment = appointment._id;
  await updatedSlot.save();

  return {
    success: true,
    message: 'Slot successfully booked',
    appointment: {
      id: appointment._id.toString(),
      patientId: appointment.patient.toString(),
      doctorId: appointment.doctor.toString(),
      slotId: appointment.slot.toString(),
      status: appointment.status,
      reason: appointment.reason,
      notes: appointment.notes,
    },
  };
}

/**
 * 3. saveIntake
 * Saves patient symptoms, duration, history, allergies, meds into intakes collection.
 * Validates output using Zod.
 */
export async function saveIntake({
  patientId,
  appointmentId,
  symptoms = [],
  duration = '1 day',
  history = [],
  allergies = [],
  meds = [],
  medicalHistory = [],
  structuredData = {},
} = {}) {
  if (!patientId) {
    const err = new Error('Invalid input: patientId is required');
    err.statusCode = 400;
    throw err;
  }

  if (!mongoose.Types.ObjectId.isValid(patientId)) {
    const err = new Error('Invalid input: patientId must be a valid ID');
    err.statusCode = 400;
    throw err;
  }

  const symptomsList = Array.isArray(symptoms) ? symptoms : [symptoms].filter(Boolean);
  const historyList = Array.isArray(history) && history.length > 0 ? history : Array.isArray(medicalHistory) ? medicalHistory : [];
  const allergiesList = Array.isArray(allergies) ? allergies : [allergies].filter(Boolean);
  const medsList = Array.isArray(meds) ? meds : [meds].filter(Boolean);

  const rawIntake = {
    symptoms: symptomsList,
    duration: typeof duration === 'string' ? duration : '1 day',
    history: historyList,
    allergies: allergiesList,
    meds: medsList,
  };

  const validation = validateIntakeData(rawIntake);
  if (!validation.success) {
    const err = new Error(`Intake Zod validation failed: ${JSON.stringify(validation.errors)}`);
    err.statusCode = 400;
    throw err;
  }

  const intake = await Intake.create({
    patient: patientId,
    appointment: appointmentId && mongoose.Types.ObjectId.isValid(appointmentId) ? appointmentId : null,
    symptoms: validation.data.symptoms,
    duration: validation.data.duration,
    history: validation.data.history,
    allergies: validation.data.allergies,
    meds: validation.data.meds,
    structuredData,
    status: 'completed',
  });

  return {
    success: true,
    message: 'Intake data validated with Zod and saved successfully',
    intake: {
      id: intake._id.toString(),
      patientId: intake.patient.toString(),
      appointmentId: intake.appointment ? intake.appointment.toString() : null,
      symptoms: intake.symptoms,
      duration: intake.duration,
      history: intake.history,
      allergies: intake.allergies,
      meds: intake.meds,
      status: intake.status,
    },
  };
}

/**
 * 4. checkInsurance
 * Validates policy against mock insurers.json.
 * Returns "covered" for valid policy, "not found" for fake/inactive policy.
 */
export async function checkInsurance({ policyNumber, provider } = {}) {
  if (!policyNumber || typeof policyNumber !== 'string' || !policyNumber.trim()) {
    const err = new Error('Invalid input: policyNumber is required');
    err.statusCode = 400;
    throw err;
  }

  const insurers = getInsurers();
  const found = insurers.find(
    (ins) => ins.policyNumber.toLowerCase() === policyNumber.trim().toLowerCase()
  );

  if (found && found.active && found.status === 'covered') {
    return {
      status: 'covered',
      policyNumber: found.policyNumber,
      provider: found.provider,
      patientName: found.patientName,
      plan: found.plan,
      copay: found.copay,
    };
  }

  return {
    status: 'not found',
    policyNumber: policyNumber.trim(),
    provider: provider || 'Unknown',
    message: 'Insurance policy is invalid, inactive, or not found in insurer system.',
  };
}
