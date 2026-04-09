import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

let webpush: typeof import('web-push') | null = null;

async function getWebpush() {
  if (!webpush) {
    try {
      webpush = await import('web-push');
      webpush.setVapidDetails(
        'mailto:suporte@neurostudy.app',
        process.env.VAPID_PUBLIC_KEY!,
        process.env.VAPID_PRIVATE_KEY!
      );
    } catch {
      logger.warn('web-push not available or VAPID keys missing');
      return null;
    }
  }
  return webpush;
}

export async function sendDailyReviewReminders(): Promise<void> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  const wp = await getWebpush();
  if (!wp) return;

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000);

  const usersWithReviews = await prisma.user.findMany({
    where: {
      pushEnabled: true,
      pushSubscription: { not: null },
      reviews: {
        some: {
          nextReviewDate: { lte: today },
          updatedAt: { lt: eightHoursAgo },
        },
      },
    },
    include: {
      _count: {
        select: {
          reviews: { where: { nextReviewDate: { lte: today }, updatedAt: { lt: eightHoursAgo } } },
        },
      },
    },
  });

  for (const user of usersWithReviews) {
    try {
      const sub = JSON.parse(user.pushSubscription!);
      await wp.sendNotification(
        sub,
        JSON.stringify({
          title: 'NeuroStudy — Revisões pendentes',
          body: `Você tem ${user._count.reviews} revisão(ões) para fazer hoje. 5 minutos são suficientes!`,
          icon: '/icons/icon-192.png',
          badge: '/icons/badge-72.png',
          tag: 'daily-review',
          renotify: false,
          data: { url: '/reviews' },
        })
      );
    } catch (err) {
      logger.warn('Push notification failed — disabling for user', { userId: user.id });
      await prisma.user.update({
        where: { id: user.id },
        data: { pushEnabled: false, pushSubscription: null },
      });
    }
  }

  logger.info('Daily review reminders sent', { count: usersWithReviews.length });
}
