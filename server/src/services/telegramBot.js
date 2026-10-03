import TelegramBot from 'node-telegram-bot-api';
import { processAgentMessage } from './agentService.js';
import { processReminderReply } from './reminderService.js';

let bot = null;

export function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('[Telegram Bot] TELEGRAM_BOT_TOKEN not provided; Telegram bot polling disabled.');
    return null;
  }

  try {
    bot = new TelegramBot(token, { polling: true });
    console.log('[Telegram Bot] Started successfully with polling mode.');

    bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text || '';
      if (!text || text.startsWith('/start')) {
        return bot.sendMessage(
          chatId,
          '🩺 Welcome to Clinic Agent Bot! You can book appointments, complete intake forms, check insurance, or manage reminders here.'
        );
      }

      // Check if user is replying to a reminder ("confirm" or "cancel")
      const lower = text.toLowerCase();
      if (lower.includes('confirm') || lower.includes('cancel')) {
        // If message is reply to reminder
        try {
          const agentRes = await processAgentMessage({
            message: text,
            sessionId: `telegram-${chatId}`,
          });
          return bot.sendMessage(chatId, agentRes.reply);
        } catch (err) {
          console.error('Telegram reply error:', err.message);
        }
      }

      // Pass message to multi-agent system
      try {
        const agentRes = await processAgentMessage({
          message: text,
          sessionId: `telegram-${chatId}`,
        });

        bot.sendMessage(chatId, agentRes.reply);
      } catch (err) {
        bot.sendMessage(chatId, 'Sorry, I encountered an error processing your request. Our staff has been notified.');
      }
    });

    return bot;
  } catch (err) {
    console.error('[Telegram Bot] Failed to initialize:', err.message);
    return null;
  }
}
