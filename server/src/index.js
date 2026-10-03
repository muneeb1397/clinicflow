import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './db.js';
import toolsRouter from './routes/tools.js';
import chatRouter from './routes/chat.js';
import staffRouter from './routes/staff.js';
import { initReminderCron } from './services/reminderService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Tool, Chat, & Staff endpoints
app.use('/api/tools', toolsRouter);
app.use('/api', toolsRouter);
app.use('/api', chatRouter);
app.use('/api', staffRouter);

async function startServer() {
  await connectDB();
  initReminderCron();
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

// Start server if main module
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
