import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    slot: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot', required: true },
    status: {
      type: String,
      enum: ['scheduled', 'confirmed', 'cancelled', 'completed'],
      default: 'scheduled',
    },
    reason: { type: String },
    notes: { type: String },
    summary: { type: String },
    approvedByStaff: { type: Boolean, default: false },
    reminderSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Appointment = mongoose.model('Appointment', appointmentSchema);
