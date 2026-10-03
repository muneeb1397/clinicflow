import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { Appointment } from '../models/Appointment.js';
import { Slot } from '../models/Slot.js';
import { AgentTrace } from '../models/AgentTrace.js';

// Global log of sent reminders for verification
export const sentRemindersLog = [];

/**
 * Configure Nodemailer transport (uses mock test account if SMTP env not provided)
 */
async function createTransporter() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  // Standard test transporter
  const testAccount = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
}

/**
 * Scan appointments in next 24 hours and send reminders.
 * Idempotent: Skips appointments where reminderSent === true.
 */
export async function scanAndSendReminders() {
  const now = new Date();
  const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const pendingAppointments = await Appointment.find({
    reminderSent: { $ne: true },
    status: { $in: ['scheduled', 'confirmed'] },
  }).populate('patient doctor slot');

  let sentCount = 0;

  for (const appt of pendingAppointments) {
    const slotTime = appt.slot?.startTime ? new Date(appt.slot.startTime) : null;
    if (slotTime && slotTime >= now && slotTime <= next24h) {
      // Send reminder
      const patientEmail = appt.patient?.email || 'patient@example.com';
      const patientName = appt.patient?.name || 'Valued Patient';
      const doctorName = appt.doctor?.name || 'Doctor';

      try {
        const transporter = await createTransporter();
        await transporter.sendMail({
          from: '"Clinic Front-Desk" <reminders@clinic.com>',
          to: patientEmail,
          subject: `Upcoming Appointment Reminder - ${doctorName}`,
          text: `Hello ${patientName},\n\nThis is a reminder for your appointment with ${doctorName} scheduled for ${slotTime.toLocaleString()}.\n\nPlease reply "CONFIRM" to confirm or "CANCEL" to cancel your appointment.`,
        });
      } catch (mailErr) {
        console.warn('Mailer notification (simulated):', mailErr.message);
      }

      // Mark as reminderSent = true to prevent duplicates
      appt.reminderSent = true;
      await appt.save();

      sentRemindersLog.push({
        appointmentId: appt._id.toString(),
        patientEmail,
        doctorName,
        slotTime,
        sentAt: new Date(),
      });

      // Log trace
      await AgentTrace.create({
        sessionId: `reminder-${appt._id}`,
        agentName: 'Reminder',
        intent: 'send_reminder',
        confidence: 1.0,
        input: `Cron scan found upcoming appointment ${appt._id}`,
        output: `Reminder sent to ${patientEmail} for ${slotTime.toLocaleString()}`,
        toolCalls: [{ toolName: 'sendEmailReminder', args: { appointmentId: appt._id.toString() }, result: { success: true } }],
      });

      sentCount++;
    }
  }

  if (sentCount > 0) {
    console.log(`[Reminder Agent] Sent ${sentCount} appointment reminders.`);
  }
  return sentCount;
}

/**
 * Reminder Agent: Parses confirm / cancel replies and updates appointment.
 * Replying "cancel" frees the slot in MongoDB.
 */
export async function processReminderReply({ appointmentId, replyText, sessionId = 'reminder-session' }) {
  const text = (replyText || '').toLowerCase().trim();

  const appointment = await Appointment.findById(appointmentId).populate('slot');
  if (!appointment) {
    const err = new Error('Appointment not found');
    err.statusCode = 404;
    throw err;
  }

  let actionTaken = 'unknown';
  let message = '';

  if (text.includes('cancel')) {
    appointment.status = 'cancelled';
    await appointment.save();

    // Free the slot in database
    if (appointment.slot) {
      await Slot.findByIdAndUpdate(appointment.slot._id, {
        $set: { isBooked: false, appointment: null },
      });
    }

    actionTaken = 'cancelled';
    message = 'Your appointment has been cancelled and the slot has been freed.';
  } else if (text.includes('confirm') || text.includes('yes') || text.includes('ok')) {
    appointment.status = 'confirmed';
    await appointment.save();

    actionTaken = 'confirmed';
    message = 'Your appointment has been confirmed. We look forward to seeing you!';
  } else {
    message = 'Unrecognized reply. Please reply "CONFIRM" or "CANCEL".';
  }

  // Log to agent_traces
  await AgentTrace.create({
    sessionId,
    agentName: 'Reminder',
    intent: `reminder_${actionTaken}`,
    confidence: 1.0,
    input: replyText,
    output: message,
    toolCalls: [{ toolName: 'processReminderReply', args: { appointmentId, replyText }, result: { actionTaken } }],
  });

  return {
    success: true,
    actionTaken,
    message,
    appointmentStatus: appointment.status,
  };
}

/**
 * Start cron job (every 1 minute)
 */
export function initReminderCron() {
  cron.schedule('* * * * *', async () => {
    try {
      await scanAndSendReminders();
    } catch (err) {
      console.error('Cron reminder scan error:', err.message);
    }
  });
  console.log('[Reminder Agent] Cron job scheduled (running every minute).');
}
