import mongoose from 'mongoose';

const doctorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    specialty: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    phone: { type: String },
    room: { type: String },
  },
  { timestamps: true }
);

export const Doctor = mongoose.model('Doctor', doctorSchema);
