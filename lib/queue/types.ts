export type QueueName = 'push-notifications' | 'message-delivery' | 'cleanup' | 'email';

export type PushNotificationJobPayload = {
  recipientId: string;
  title?: string;
  body?: string;
  url?: string;
};

export type MessageDeliveryJobPayload = {
  userId: string;
  messageIds: string[];
};

export type CleanupJobPayload = {
  task: 'retention_cleanup' | 'scheduled_backup';
};

export type EmailJobPayload = {
  to: string;
  subject: string;
  template: string;
  vars?: Record<string, string | number | boolean>;
};

export type QueuePayloadMap = {
  'push-notifications': PushNotificationJobPayload;
  'message-delivery': MessageDeliveryJobPayload;
  cleanup: CleanupJobPayload;
  email: EmailJobPayload;
};

export type BackgroundJobName = 'push_notification' | 'retention_cleanup' | 'scheduled_backup';

export type BackgroundJobPayload = Record<string, unknown>;
