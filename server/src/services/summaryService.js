import { Appointment } from '../models/Appointment.js';
import { Intake } from '../models/Intake.js';
import { AgentTrace } from '../models/AgentTrace.js';

/**
 * Summary Agent
 * Generates a pre-visit staff handoff note per appointment.
 */
export async function generateStaffSummary({ appointmentId, sessionId = 'summary-session' }) {
  const appointment = await Appointment.findById(appointmentId).populate('patient doctor slot');
  if (!appointment) {
    const err = new Error('Appointment not found');
    err.statusCode = 404;
    throw err;
  }

  // Find intake record for patient/appointment
  const intake = await Intake.findOne({
    $or: [{ appointment: appointment._id }, { patient: appointment.patient._id }],
  }).sort({ createdAt: -1 });

  const patientName = appointment.patient?.name || 'Unknown Patient';
  const insurance = `${appointment.patient?.insuranceProvider || 'N/A'} (${appointment.patient?.insurancePolicyNumber || 'N/A'})`;
  const doctorName = appointment.doctor?.name || 'Doctor';
  const specialty = appointment.doctor?.specialty || 'General';
  const timeStr = appointment.slot?.startTime ? new Date(appointment.slot.startTime).toLocaleString() : 'TBD';
  const symptomsStr = intake?.symptoms?.length > 0 ? intake.symptoms.join(', ') : 'None recorded';
  const historyStr = intake?.history?.length > 0 ? intake.history.join(', ') : 'None';

  const handoffNote = `[STAFF HANDOFF SUMMARY]
Patient: ${patientName} | Insurance: ${insurance}
Provider: ${doctorName} (${specialty})
Appointment Time: ${timeStr}
Reason for Visit: ${appointment.reason || 'General Checkup'}
Intake Symptoms: ${symptomsStr}
Medical History: ${historyStr}
Status: Awaiting Staff Approval.`;

  appointment.summary = handoffNote;
  await appointment.save();

  // Log to agent_traces
  await AgentTrace.create({
    sessionId,
    agentName: 'Summary',
    intent: 'generate_summary',
    confidence: 1.0,
    input: `Generate handoff summary for appointment ${appointmentId}`,
    output: handoffNote,
    toolCalls: [],
  });

  return {
    success: true,
    summary: handoffNote,
    appointmentId: appointment._id.toString(),
  };
}
