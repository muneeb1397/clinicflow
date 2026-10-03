import mongoose from 'mongoose';

const patientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    phone: { type: String, required: true },
    dob: { type: Date },
    insuranceProvider: { type: String },
    insurancePolicyNumber: { type: String },
    medicalHistory: [{ type: String }],
  },
  { timestamps: true }
);

export const Patient = mongoose.model('Patient', patientSchema);
