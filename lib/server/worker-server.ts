import { registerRuntimeJobs, startRuntimeWorker, stopBackupScheduler } from '@/lib/runtime/background-bootstrap';
import { stopBackgroundJobWorker } from '@/lib/task-queue';

export const startWorkerServer = async () => {
  registerRuntimeJobs();
  await startRuntimeWorker();
};

export const stopWorkerServer = async () => {
  stopBackupScheduler();
  await stopBackgroundJobWorker();
};
