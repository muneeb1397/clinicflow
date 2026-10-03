import mongoose from 'mongoose';

const slotSchema = new mongoose.Schema(
  {
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    isBooked: { type: Boolean, default: false },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
  },
  { timestamps: true }
);

// Ensure unique slot per doctor and start time
slotSchema.index({ doctor: 1, startTime: 1 }, { unique: true });

export const Slot = mongoose.model('Slot', slotSchema);
