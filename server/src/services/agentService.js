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

const GEMINI_MODELS = [
  process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.8-flash-lite',
];

async function generateWithRetry(ai, params) {
  let lastErr;
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await ai.models.generateContent({ ...params, model });
      } catch (err) {
        lastErr = err;
        const msg = String(err.message || '');
        const retryable = /503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|overloaded|high demand/i.test(msg);
        if (!retryable) throw err;
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
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
      const response = await generateWithRetry(ai, {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You classify messages sent to a medical clinic's front-desk assistant.
Choose exactly one intent:
- "book": wants to schedule, see a doctor, or asks about appointment availability or a specific doctor's time.
- "reschedule": wants to move, change, postpone, or cancel an existing appointment.
- "intake": describes ANY symptom, pain, illness, injury, or medical history, even casually (e.g. "my head hurts", "I feel dizzy", "I've had a cough since Monday").
- "insurance": asks about insurance, coverage, copay, or a policy number.
- "other": ONLY unrelated chat, greetings, clinic location/hours/parking, or off-topic questions.
If a message describes how the patient feels physically, it is "intake", never "other".
Return JSON only: {"intent": "<intent>", "confidence": <number between 0.0 and 1.0>}
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
        const kwIntake = /\b(hurts?|pain|ache|aching|fever|cough|nausea|dizzy|headache|symptoms?|sick|vomit\w*|rash|sore)\b/i.test(msgLower);
        if (classification.intent === 'other' && kwIntake) {
          classification = { intent: 'intake', confidence: 0.8 };
        }
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
      /\bdr\b\.?/.test(msgLower) ||
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
      /\bhi\b/.test(msgLower) ||
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

// In-memory conversation state per session (resets if the server restarts)
const sessionState = new Map();

async function handleBookingConversation(state, message) {
  const text = (message || '').trim();

  if (/^(cancel|stop|quit)$/i.test(text)) {
    state.step = null;
    return 'Okay, I have cancelled this booking. Let me know if you need anything else.';
  }

  switch (state.step) {
    case 'name':
      if (text.length < 2) return 'Please enter your full name.';
      state.data.name = text;
      state.step = 'email';
      return `Thanks, ${text}. What is your email address?`;

    case 'email':
      if (!/^\S+@\S+\.\S+$/.test(text)) return 'That email looks invalid. Please enter a valid email address.';
      state.data.email = text.toLowerCase();
      state.step = 'phone';
      return 'And your phone number?';

    case 'phone':
      if (text.replace(/\D/g, '').length < 7) return 'Please enter a valid phone number.';
      state.data.phone = text;
      state.step = 'telegram';
      return 'Optional: your Telegram username, or type "skip".';

    case 'telegram': {
      if (!/^skip$/i.test(text)) state.data.telegramUsername = text.replace(/^@/, '');
      state.step = 'confirm';
      const s = state.slot;
      const when = new Date(s.startTime).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
      return (
        `Please confirm your appointment:\n` +
        `Doctor: ${s.doctorName} (${s.specialty})\nTime: ${when}\n` +
        `Name: ${state.data.name}\nEmail: ${state.data.email}\nPhone: ${state.data.phone}\n\n` +
        `Reply YES to confirm or NO to cancel.`
      );
    }

    case 'confirm': {
      if (/^(y|yes|confirm|ok|okay)$/i.test(text)) {
        try {
          const update = { name: state.data.name, phone: state.data.phone };
          if (state.data.telegramUsername) update.telegramUsername = state.data.telegramUsername;
          const patient = await Patient.findOneAndUpdate(
            { email: state.data.email },
            update,
            { new: true, upsert: true, setDefaultsOnInsert: true }
          );
          await bookSlot({ slotId: state.slot.id, patientId: patient._id.toString(), reason: state.reason });
          state.patientId = patient._id.toString();
          state.step = null;
          const when = new Date(state.slot.startTime).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
          return `Confirmed! Your appointment with ${state.slot.doctorName} is booked for ${when}. You can now tell me your symptoms for the doctor.`;
        } catch (err) {
          state.step = null;
          return 'Sorry, that slot was just taken. Please ask me to book again and I will find another one.';
        }
      }
      if (/^(n|no)$/i.test(text)) {
        state.step = null;
        return 'No problem, the booking was not made. Let me know if you want another time.';
      }
      return 'Please reply YES to confirm or NO to cancel.';
    }

    default:
      state.step = null;
      return null;
  }
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

  // Booking conversation in progress: skip routing and continue collecting details
  let state = sessionState.get(sessionId);
  if (!state) {
    state = { step: null, data: {}, patientId: null };
    sessionState.set(sessionId, state);
  }
  if (!patientId && state.patientId) patientId = state.patientId;

  if (state.step) {
    const reply = await handleBookingConversation(state, message);
    if (reply) {
      if (state.patientId) patientId = state.patientId;
      await AgentTrace.create({
        sessionId, agentName: 'Scheduler', intent: 'book', confidence: 1.0,
        input: message, output: reply, toolCalls: [],
      });
      return { reply, agentName: 'Scheduler', intent: 'book', confidence: 1.0, escalated: false };
    }
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

  // Start details collection when a new patient wants to book
  if ((routing.intent === 'book' || routing.intent === 'reschedule') && !patientId) {
    const slots = await getSlots();
    if (slots.length === 0) {
      return {
        reply: 'Currently there are no open appointment slots. Please check back later.',
        agentName: 'Scheduler', intent: routing.intent, confidence: routing.confidence, escalated: false,
      };
    }
    state.step = 'name';
    state.data = {};
    state.slot = slots[0];
    state.reason = message;
    const reply = 'I can help you book that. First, what is your full name?';
    await AgentTrace.create({
      sessionId, agentName: 'Scheduler', intent: routing.intent, confidence: routing.confidence,
      input: message, output: reply, toolCalls: [{ toolName: 'getSlots', args: {}, result: [slots[0]] }],
    });
    return { reply, agentName: 'Scheduler', intent: routing.intent, confidence: routing.confidence, escalated: false };
  }

  if (routing.intent === 'intake' && !patientId) {
    const reply = 'Please book an appointment first so I can link your symptoms to you.';
    await AgentTrace.create({
      sessionId, agentName: 'Intake', intent: 'intake', confidence: routing.confidence,
      input: message, output: reply, toolCalls: [],
    });
    return { reply, agentName: 'Intake', intent: 'intake', confidence: routing.confidence, escalated: false };
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
          parts: [{ text: `${SAFETY_SYSTEM_PROMPT}\nPatient ID: ${patientId || 'unknown'}\nPatient message: ${message}` }],
        },
      ];

      let turns = 0;
      while (turns < 3) {
        turns++;
        const response = await generateWithRetry(ai, {
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
      const intakeRes = await saveIntake({ patientId, symptoms: [message] });
      executedToolCalls.push({ toolName: 'saveIntake', args: { patientId, symptoms: [message] }, result: intakeRes });
      finalReply = 'Thank you for providing your intake information. Your symptoms have been logged for the doctor.';
    }
    // }
    // else if (routing.intent === 'intake') {
    //   let pId = patientId;
    //   if (!pId) {
    //     finalReply = 'Please book an appointment first so I can link your symptoms to you.';
    //   } else {
    //     const intakeRes = await saveIntake({ patientId: pId, symptoms: [message] });
    //     executedToolCalls.push({ toolName: 'saveIntake', args: { patientId: pId, symptoms: [message] }, result: intakeRes });
    //     finalReply = 'Thank you for providing your intake information. Your symptoms have been logged for the doctor.';
    //   }

    // const intakeRes = await saveIntake({
    //   patientId: pId || 'default-patient',
    //   symptoms: [message],
    // });
    // executedToolCalls.push({ toolName: 'saveIntake', args: { patientId: pId, symptoms: [message] }, result: intakeRes });
    // finalReply = 'Thank you for providing your intake information. Your symptoms have been logged for the doctor.';
    // }
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
