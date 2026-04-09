import cron from 'node-cron';
import { logger } from './lib/logger';

const API_URL = process.env.API_URL || 'http://localhost:3001';

export async function startKeepAlive() {
  if (process.env.NODE_ENV !== 'production') return;

  // Ping every 10 minutes to keep Render free tier awake
  cron.schedule('*/10 * * * *', async () => {
    try {
      const res = await fetch(`${API_URL}/health`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      logger.info('[KeepAlive] Ping enviado', { ts: new Date().toISOString() });
    } catch (err) {
      logger.warn('[KeepAlive] Erro no ping', { err: String(err) });
    }
  });

  // Daily review reminder at 08:00 BRT
  cron.schedule(
    '0 8 * * *',
    async () => {
      try {
        const { sendDailyReviewReminders } = await import('./services/pushService');
        await sendDailyReviewReminders();
      } catch (err) {
        logger.error('[KeepAlive] Falha ao enviar notificações push', { err: String(err) });
      }
    },
    { timezone: 'America/Sao_Paulo' }
  );

  logger.info('[KeepAlive] Iniciado — ping a cada 10 min, notificações às 08:00 BRT');
}
