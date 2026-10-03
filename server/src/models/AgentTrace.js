import mongoose from 'mongoose';

const agentTraceSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    agentName: {
      type: String,
      required: true,
      enum: ['Router', 'Scheduler', 'Intake', 'Insurance', 'Reminder', 'Summary'],
    },
    intent: { type: String },
    input: { type: String },
    output: { type: String },
    toolCalls: [
      {
        toolName: { type: String },
        args: { type: mongoose.Schema.Types.Mixed },
        result: { type: mongoose.Schema.Types.Mixed },
      },
    ],
    confidence: { type: Number },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const AgentTrace = mongoose.model('AgentTrace', agentTraceSchema);
