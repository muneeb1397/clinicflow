import express from 'express';
import { Appointment } from '../models/Appointment.js';
import { generateStaffSummary } from '../services/summaryService.js';
import { processReminderReply } from '../services/reminderService.js';

const router = express.Router();

// 1. Staff Login (Hardcoded demo account)
router.post('/staff/login', (req, res) => {
  const { username, email, password } = req.body;
  const identifier = (username || email || '').toLowerCase();

  if (
    (identifier === 'admin' || identifier === 'staff@clinic.com' || identifier === 'staff') &&
    (password === 'password123' || password === 'demo123')
  ) {
    return res.json({
      success: true,
      token: 'demo-staff-jwt-token-12345',
      user: { name: 'Front-Desk Staff', email: 'staff@clinic.com', role: 'staff' },
    });
  }

  res.status(401).json({ error: 'Invalid staff credentials. Use staff@clinic.com / demo123 or admin / password123' });
});

// 2. GET /api/staff/appointments - List all appointments with details
router.get('/staff/appointments', async (req, res) => {
  try {
    const appointments = await Appointment.find()
      .populate('patient doctor slot')
      .sort({ createdAt: -1 });
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. POST /api/staff/approve/:id - Staff Approve
router.post('/staff/approve/:id', async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    appointment.approvedByStaff = true;
    appointment.status = 'confirmed';
    await appointment.save();

    res.json({ success: true, message: 'Appointment approved by staff', appointment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. POST /api/staff/override/:id - Staff Override
router.post('/staff/override/:id', async (req, res) => {
  try {
    const { action, status, notes } = req.body;
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ error: 'Appointment not found' });

    appointment.approvedByStaff = false;
    appointment.status = status || 'cancelled';
    if (notes) appointment.notes = notes;
    await appointment.save();

    // If cancelled, free the slot
    if (appointment.status === 'cancelled') {
      await processReminderReply({ appointmentId: appointment._id, replyText: 'cancel' });
    }

    res.json({ success: true, message: 'Appointment overridden by staff', appointment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. POST /api/staff/summary/:id - Trigger summary generation
router.post('/staff/summary/:id', async (req, res) => {
  try {
    const summary = await generateStaffSummary({ appointmentId: req.params.id });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
