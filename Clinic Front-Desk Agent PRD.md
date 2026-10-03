# PRD: Clinic Front-Desk Agent

**Version:** 1.0 | **Type:** Hackathon MVP | **Data:** Synthetic only

## 1. Problem

Small clinics handle booking, intake, insurance checks and reminders by phone and paper. Each booking takes \~5 minutes of staff time, no-shows are common, and staff re-enter data across systems.

## 2. Goal

A multi-agent assistant that handles the patient-facing front-desk workflow end to end, with staff approval on key actions.

**Success metrics**

- Booking time: \~5 min (phone) → under 60 sec
- Intake completeness: 90%+ required fields captured
- Router accuracy: 90%+ on a 30-message test set
- Reminder confirm/cancel handled without staff: 80%+

## 3. Users

| User | Need |
| --- | --- |
| Patient | Book/reschedule, complete intake, check coverage, get reminders |
| Front-desk staff | Review summaries, approve/override, see agent activity |
| Doctor | Receive clean pre-visit summary |

## 4. Scope

**In:** chat widget, Telegram bot, scheduling, intake, mock insurance check, reminders, staff dashboard, agent trace panel. **Out:** WhatsApp, real insurer integration, payments, EHR integration, real patient data, medical advice or diagnosis.

## 5. Functional Requirements

| ID | Requirement | Priority |
| --- | --- | --- |
| F1 | Router agent classifies messages: book, reschedule, intake, insurance, other | P0 |
| F2 | Scheduler agent lists doctor availability and books/reschedules/cancels slots via tools | P0 |
| F3 | Intake agent collects symptoms, history, and forms conversationally into structured JSON | P0 |
| F4 | Insurance agent validates policy against mock API, returns coverage status | P1 |
| F5 | Reminder agent sends email/Telegram reminders and processes confirm/cancel replies | P1 |
| F6 | Summary agent produces a staff handoff summary per appointment | P0 |
| F7 | Staff dashboard: appointments, summaries, approve/override button (human-in-the-loop) | P0 |
| F8 | Trace panel shows agent hand-offs and tool calls live | P1 |
| F9 | "Other"/low-confidence intents escalate to staff | P0 |
| F10 | Safety: agent never gives diagnosis; shows demo disclaimer | P0 |

## 6. Agent Design

| Agent | Input | Tools | Output |
| --- | --- | --- | --- |
| Router | Patient message | none | Intent + confidence |
| Scheduler | Booking intent | `getSlots`, `bookSlot`, Calendar API | Confirmed appointment |
| Intake | Intake intent | `saveIntake` | Structured JSON |
| Insurance | Policy details | `checkInsurance` | Coverage status |
| Reminder | Upcoming appointments | cron, email/Telegram | Reminder + reply handling |
| Summary | Appointment + intake + coverage | none | Staff handoff note |

**Flow:** message → Router → specialist agent → tool calls → DB → Summary agent → staff dashboard (approve/override).

## 7. Technical Architecture

| Layer | Choice |
| --- | --- |
| LLM | Gemini API free tier or Groq free tier |
| Orchestration | LangGraph or plain function calling |
| Frontend | React + Vite (Vercel/Netlify) |
| Backend | Node/Express (Render free tier) |
| Database | MongoDB Atlas M0 |
| Scheduling | Google Calendar API |
| Reminders | node-cron + Nodemailer or Resend |
| Channels | Web chat widget, Telegram bot |
| Insurance | Mock JSON API |

**Data models:** `patients`, `doctors`, `slots`, `appointments`, `intakes`, `agent_traces`.

**Tool endpoints:** `getSlots`, `bookSlot`, `saveIntake`, `checkInsurance`.

## 8. Non-Functional Requirements

- Response latency under 5 sec per agent turn
- Cache repeated LLM calls to survive free-tier rate limits
- Synthetic data only; no real PII stored
- Every agent action logged to `agent_traces`
- Graceful fallback to staff on LLM or tool failure

## 9. Milestones

| # | Milestone |
| --- | --- |
| 1 | Mongo schemas |
| 2 | Express tool endpoints |
| 3 | Single LLM with function calling |
| 4 | Split into Router + specialist agents |
| 5 | Cron reminders |
| 6 | Staff dashboard + approve/override |
| 7 | Deploy, record demo |

## 10. Demo Plan

1. Patient books via chat (trace panel visible).
2. Intake and insurance check run in the same conversation.
3. Staff dashboard shows summary; staff approves.
4. Reminder fires; patient confirms.
5. Show metric: 5 min by phone vs \~40 sec.
6. Keep a pre-recorded fallback.

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| Free-tier rate limits | Response caching, fallback recording |
| Render cold starts | Warm-up ping before demo |
| LLM hallucination in booking | Tool-only writes, staff approval step |
| Scope creep | P0 first; cut P1 if behind |

## 12. Open Questions

- LangGraph vs plain function calling?
- Telegram only, or web widget only, if time is short?