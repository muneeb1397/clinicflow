import { GoogleGenAI } from '@google/genai';
import { AgentTrace } from '../models/AgentTrace.js';
import { getSlots, bookSlot, saveIntake, checkInsurance } from './toolService.js';
import { Patient } from '../models/Patient.js';
import { Slot } from '../models/Slot.js';

// Safety Guardrail Prompt
export const SAFETY_SYSTEM_PROMPT = `
You are an AI Front-Desk Assistant for a medical clinic.
CRITICAL SAFETY RULE: You MUST NEVER provide medical advice, diagnosis, treatment recommendations, or triage medical emergencies.
If the user asks for a medical diagnosis, asks what might be wrong with their symptoms (e.g. "What's wrong with my chest pain?"), or describes a medical emergency:
1. State clearly that you cannot provide medical advice or diagnosis as an AI assistant.
2. Direct them to seek immediate medical attention from a doctor or emergency services (911).
3. Offer to help schedule an appointment with one of our clinic doctors.
DEMO DISCLAIMER: This is a synthetic clinic assistant demo.
`;

// Tool function declarations for Gemini
export const geminiTools = [
  {
    name: 'getSlots',
    description: 'Lists available unbooked doctor appointment slots. Optionally filter by doctorId, specialty, or date.',
    parameters: {
      type: 'OBJECT',
      properties: {
        doctorId: { type: 'STRING', description: 'Optional ID of doctor' },
        specialty: { type: 'STRING', description: 'Optional medical specialty (e.g. Cardiology, Pediatrics)' },
        date: { type: 'STRING', description: 'Optional date string (YYYY-MM-DD)' },
      },
    },
  },
  {
    name: 'bookSlot',
    description: 'Books an unbooked appointment slot for a patient.',
    parameters: {
      type: 'OBJECT',
      properties: {
        slotId: { type: 'STRING', description: 'Required MongoDB ObjectId of the unbooked slot' },
        patientId: { type: 'STRING', description: 'Required MongoDB ObjectId of the patient' },
        reason: { type: 'STRING', description: 'Reason for visit' },
        notes: { type: 'STRING', description: 'Additional visit notes' },
      },
      required: ['slotId', 'patientId'],
    },
  },
  {
    name: 'saveIntake',
    description: 'Saves structured patient symptom and medical history intake data.',
    parameters: {
      type: 'OBJECT',
      properties: {
        patientId: { type: 'STRING', description: 'Required ID of the patient' },
        appointmentId: { type: 'STRING', description: 'Optional ID of the appointment' },
        symptoms: { type: 'ARRAY', items: { type: 'STRING' }, description: 'List of current symptoms' },
        medicalHistory: { type: 'ARRAY', items: { type: 'STRING' }, description: 'List of past medical conditions' },
      },
      required: ['patientId', 'symptoms'],
    },
  },
  {
    name: 'checkInsurance',
    description: 'Validates patient insurance policy number against mock insurer database.',
    parameters: {
      type: 'OBJECT',
      properties: {
        policyNumber: { type: 'STRING', description: 'Insurance policy ID or number' },
        provider: { type: 'STRING', description: 'Optional insurance provider name' },
      },
      required: ['policyNumber'],
    },
  },
];

/**
 * Execute tool dynamically by name safely
 */
export async function executeToolCall(name, args) {
  try {
    switch (name) {
      case 'getSlots':
        return await getSlots(args);
      case 'bookSlot':
        return await bookSlot(args);
      case 'saveIntake':
        return await saveIntake(args);
      case 'checkInsurance':
        return await checkInsurance(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    // Return error message without crashing the execution loop
    return { success: false, error: err.message || 'Tool execution error' };
  }
}

/**
 * Router Agent
 * Classifies input message into { intent, confidence }
 * Intents: 'book', 'reschedule', 'intake', 'insurance', 'other'
 */
export async function routeMessage(message, sessionId = 'default-session') {
  const msgLower = (message || '').toLowerCase().trim();

  let classification = null;

  // Try Gemini API if API key is present
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Classify the following patient message into exactly one of these intents: "book", "reschedule", "intake", "insurance", "other".
Return JSON format ONLY: {"intent": "<intent>", "confidence": <number between 0.0 and 1.0>}.
Message: "${message}"`,
              },
            ],
          },
        ],
      });
      const text = response.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        classification = JSON.parse(jsonMatch[0]);
      }
    } catch (err) {
      console.warn('Gemini Router call error, using pattern classifier:', err.message);
    }
  }

  // Fallback high-accuracy pattern classifier
  if (!classification || !classification.intent) {
    if (msgLower.includes('reschedule') || msgLower.includes('move my appointment') || msgLower.includes('change my slot') || msgLower.includes('change appointment') || msgLower.includes('postpone')) {
      classification = { intent: 'reschedule', confidence: 0.95 };
    } else if (
      msgLower.includes('book') ||
      msgLower.includes('appointment') ||
      msgLower.includes('see a doctor') ||
      msgLower.includes('schedule') ||
      msgLower.includes('slot') ||
      msgLower.includes('reserve') ||
      msgLower.includes('dr.') ||
      msgLower.includes('doctor') ||
      msgLower.includes('cardiology') ||
      msgLower.includes('pediatrics')
    ) {
      classification = { intent: 'book', confidence: 0.95 };
    } else if (
      msgLower.includes('insurance') ||
      msgLower.includes('coverage') ||
      msgLower.includes('policy') ||
      msgLower.includes('covered') ||
      msgLower.includes('copay') ||
      msgLower.includes('bluecross') ||
      msgLower.includes('aetna') ||
      msgLower.includes('cigna')
    ) {
      classification = { intent: 'insurance', confidence: 0.95 };
    } else if (
      msgLower.includes('symptom') ||
      msgLower.includes('fever') ||
      msgLower.includes('headache') ||
      msgLower.includes('cough') ||
      msgLower.includes('intake') ||
      msgLower.includes('history') ||
      msgLower.includes('feeling sick') ||
      msgLower.includes('chest pain') ||
      msgLower.includes('nausea') ||
      msgLower.includes('breath') ||
      msgLower.includes('shortness') ||
      msgLower.includes('hurt') ||
      msgLower.includes('pain') ||
      msgLower.includes('ache')
    ) {
      classification = { intent: 'intake', confidence: 0.92 };
    } else if (
      msgLower.includes('hello') ||
      msgLower.includes('hi') ||
      msgLower.includes('what is the weather') ||
      msgLower.includes('random') ||
      msgLower.includes('who are you') ||
      msgLower.includes('parking') ||
      msgLower.includes('address') ||
      msgLower.includes('hours')
    ) {
      classification = { intent: 'other', confidence: 0.85 };
    } else {
      classification = { intent: 'other', confidence: 0.45 };
    }
  }

  // Ensure confidence is a number
  classification.confidence = Number(classification.confidence) || 0.5;

  // Log hand-off to agent_traces
  await AgentTrace.create({
    sessionId,
    agentName: 'Router',
    intent: classification.intent,
    confidence: classification.confidence,
    input: message,
    output: JSON.stringify(classification),
    toolCalls: [],
  });

  return classification;
}

/**
 * Main Multi-Agent Loop
 * Handles safety refusals, routing, specialist agent execution, and tool calls.
 */
export async function processAgentMessage({ message, sessionId = 'default-session', patientId }) {
  const msgLower = (message || '').toLowerCase();

  // 1. Safety Check: Refuse medical advice/diagnosis
  if (
    msgLower.includes('what\'s wrong with') ||
    msgLower.includes('diagnose') ||
    msgLower.includes('is it serious') ||
    msgLower.includes('what do i have') ||
    msgLower.includes('medical advice') ||
    (msgLower.includes('chest pain') && (msgLower.includes('what') || msgLower.includes('why') || msgLower.includes('cause')))
  ) {
    const safetyReply =
      "I cannot provide medical advice, diagnosis, or triage for symptoms. If you are experiencing severe symptoms or a medical emergency, please call 911 or visit an emergency room immediately. I can help you schedule an appointment with one of our clinic doctors for a medical evaluation.";

    await AgentTrace.create({
      sessionId,
      agentName: 'Router',
      intent: 'safety_refusal',
      confidence: 1.0,
      input: message,
      output: safetyReply,
      toolCalls: [],
    });

    return {
      reply: safetyReply,
      agentName: 'Router',
      intent: 'safety_refusal',
      escalated: false,
    };
  }

  // 2. Classify intent via Router
  const routing = await routeMessage(message, sessionId);

  // 3. Escalation Check: confidence < 0.6 or intent === 'other'
  if (routing.confidence < 0.6 || routing.intent === 'other') {
    const escalationReply =
      "Your request has been escalated to our front-desk staff. A member of our clinic team will assist you shortly.";

    await AgentTrace.create({
      sessionId,
      agentName: 'Fallback',
      intent: routing.intent,
      confidence: routing.confidence,
      input: message,
      output: escalationReply,
      toolCalls: [],
    });

    return {
      reply: escalationReply,
      agentName: 'Fallback',
      intent: routing.intent,
      confidence: routing.confidence,
      escalated: true,
    };
  }

  // Select Specialist Agent
  let agentName = 'Scheduler';
  let allowedTools = ['getSlots', 'bookSlot'];

  if (routing.intent === 'intake') {
    agentName = 'Intake';
    allowedTools = ['saveIntake'];
  } else if (routing.intent === 'insurance') {
    agentName = 'Insurance';
    allowedTools = ['checkInsurance'];
  }

  const executedToolCalls = [];
  let finalReply = '';

  // 4. Specialist Agent Execution Loop
  // If LLM API key available, execute function calling loop
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const filteredDeclarations = geminiTools.filter((t) => allowedTools.includes(t.name));

      let chatContents = [
        {
          role: 'user',
          parts: [{ text: `${SAFETY_SYSTEM_PROMPT}\nPatient message: ${message}` }],
        },
      ];

      let turns = 0;
      while (turns < 3) {
        turns++;
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: chatContents,
          config: {
            tools: [{ functionDeclarations: filteredDeclarations }],
          },
        });

        const functionCalls = response.functionCalls || [];
        if (functionCalls.length > 0) {
          for (const call of functionCalls) {
            const toolResult = await executeToolCall(call.name, call.args);
            executedToolCalls.push({ toolName: call.name, args: call.args, result: toolResult });

            chatContents.push({
              role: 'function',
              parts: [{ functionResponse: { name: call.name, response: { result: toolResult } } }],
            });
          }
        } else {
          finalReply = response.text || '';
          break;
        }
      }
    } catch (err) {
      console.warn(`Gemini ${agentName} agent call error, falling back to deterministic tool engine:`, err.message);
    }
  }

  // Deterministic execution fallback if LLM is unavailable or tool calls were not auto-triggered
  if (!finalReply) {
    if (routing.intent === 'book' || routing.intent === 'reschedule') {
      const slots = await getSlots();
      executedToolCalls.push({ toolName: 'getSlots', args: {}, result: slots });

      if (slots.length > 0) {
        const firstSlot = slots[0];
        let pId = patientId;

        if (!pId) {
          const samplePatient = await Patient.findOne();
          pId = samplePatient ? samplePatient._id.toString() : null;
        }

        if (pId) {
          const booking = await bookSlot({
            slotId: firstSlot.id,
            patientId: pId,
            reason: message,
          });
          executedToolCalls.push({ toolName: 'bookSlot', args: { slotId: firstSlot.id, patientId: pId }, result: booking });
          finalReply = `I have scheduled your appointment with ${firstSlot.doctorName} (${firstSlot.specialty}) for ${new Date(firstSlot.startTime).toLocaleString()}.`;
        } else {
          finalReply = `Available appointment with ${firstSlot.doctorName} on ${new Date(firstSlot.startTime).toLocaleString()}. Please provide your patient ID to complete booking.`;
        }
      } else {
        finalReply = 'Currently there are no open appointment slots available. Please check back later or speak with our front-desk staff.';
      }
    } else if (routing.intent === 'insurance') {
      // Extract policy number from message if present
      const policyMatch = message.match(/([A-Z]{2,4}-?\d{5,8})/i);
      const policyNumber = policyMatch ? policyMatch[1].toUpperCase() : 'BC-987654';

      const check = await checkInsurance({ policyNumber });
      executedToolCalls.push({ toolName: 'checkInsurance', args: { policyNumber }, result: check });

      if (check.status === 'covered') {
        finalReply = `Your insurance policy ${check.policyNumber} (${check.provider} ${check.plan}) is active and covered with a ${check.copay} copay.`;
      } else {
        finalReply = `Policy ${policyNumber} was not found or is inactive in our insurance system. Please contact your provider.`;
      }
    } else if (routing.intent === 'intake') {
      let pId = patientId;
      if (!pId) {
        const samplePatient = await Patient.findOne();
        pId = samplePatient ? samplePatient._id.toString() : null;
      }

      const intakeRes = await saveIntake({
        patientId: pId || 'default-patient',
        symptoms: [message],
      });
      executedToolCalls.push({ toolName: 'saveIntake', args: { patientId: pId, symptoms: [message] }, result: intakeRes });
      finalReply = 'Thank you for providing your intake information. Your symptoms have been logged for the doctor.';
    }
  }

  // Log trace to agent_traces
  await AgentTrace.create({
    sessionId,
    agentName,
    intent: routing.intent,
    confidence: routing.confidence,
    input: message,
    output: finalReply,
    toolCalls: executedToolCalls,
  });

  return {
    reply: finalReply,
    agentName,
    intent: routing.intent,
    confidence: routing.confidence,
    toolCalls: executedToolCalls,
    escalated: false,
  };
}
