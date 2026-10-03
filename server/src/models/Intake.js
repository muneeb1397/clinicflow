import mongoose from 'mongoose';

const intakeSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    symptoms: [{ type: String }],
    medicalHistory: [{ type: String }],
    structuredData: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
  },
  { timestamps: true }
);

export const Intake = mongoose.model('Intake', intakeSchema);
