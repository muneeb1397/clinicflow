import express from 'express';
import { processAgentMessage, routeMessage } from '../services/agentService.js';
import { AgentTrace } from '../models/AgentTrace.js';

const router = express.Router();

// POST /api/chat - Process patient message through multi-agent system
router.post('/chat', async (req, res) => {
  try {
    const { message, sessionId, patientId } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const result = await processAgentMessage({
      message,
      sessionId: sessionId || 'demo-session',
      patientId,
    });

    res.json(result);
  } catch (err) {
    console.error('Chat endpoint error:', err);
    res.status(500).json({ error: err.message || 'Failed to process message' });
  }
});

// POST /api/router - Directly run Router agent for testing
router.post('/router', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    const classification = await routeMessage(message, sessionId || 'router-test');
    res.json(classification);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/traces - Retrieve agent trace logs for dashboard
router.get('/traces', async (req, res) => {
  try {
    const { sessionId } = req.query;
    const query = sessionId ? { sessionId } : {};
    const traces = await AgentTrace.find(query).sort({ timestamp: -1 }).limit(100);
    res.json(traces);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
