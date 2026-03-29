import { registerBackgroundJob, startBackgroundJobWorker } from '../task-queue';
import { sendPushNotification } from '../push';
import { logger } from '../logger';

export function registerRuntimeJobs() {
  registerBackgroundJob('push_notification', async (payload) => {
    const recipientId = typeof payload.recipientId === 'string' ? payload.recipientId : '';
    if (!recipientId) return;

    await sendPushNotification(recipientId, {
      title: typeof payload.title === 'string' ? payload.title : 'New Message',
      body: typeof payload.body === 'string' ? payload.body : 'You have received a new encrypted message.',
      url: typeof payload.url === 'string' ? payload.url : '/chat',
    });
  });
}

export async function startRuntimeWorker() {
  await startBackgroundJobWorker();
  logger.info('Background job worker started.');
}
