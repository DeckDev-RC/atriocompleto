import { Job, Queue, Worker } from "bullmq";
import { env } from "../config/env";
import { queueRedis, workerRedis } from "../config/redis";
import { MemoryService } from "./optimus/memoryService";
import { buildMemoryRefreshJobId } from "./memory-processing-utils";

const QUEUE_NAME = "optimus-memory-processing";

type MemoryRefreshJob = {
  conversationId: string;
  userId: string;
  tenantId: string;
};

export const memoryProcessingQueue = new Queue<MemoryRefreshJob>(QUEUE_NAME, {
  connection: queueRedis as any,
  prefix: env.BULLMQ_PREFIX,
});

const worker = new Worker<MemoryRefreshJob>(
  QUEUE_NAME,
  async (job: Job<MemoryRefreshJob>) => {
    await MemoryService.refreshConversationArtifacts(job.data);
  },
  {
    connection: workerRedis as any,
    prefix: env.BULLMQ_PREFIX,
    concurrency: 2,
  },
);

worker.on("failed", (job, error) => {
  console.error(`[MemoryQueue] Job ${job?.id} failed:`, error);
});

worker.on("completed", (job) => {
  console.log(`[MemoryQueue] Job ${job.id} completed`);
});

export const MemoryProcessingQueueService = {
  async scheduleRefresh(jobData: MemoryRefreshJob) {
    const jobId = buildMemoryRefreshJobId(jobData.conversationId);
    const existingJob = await memoryProcessingQueue.getJob(jobId);
    if (existingJob) {
      await existingJob.remove().catch(() => undefined);
    }

    return memoryProcessingQueue.add(
      "refresh-conversation-memory",
      jobData,
      {
        jobId,
        delay: env.OPTIMUS_MEMORY_JOB_DELAY_MS,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
  },
};

export async function shutdownMemoryProcessingQueue(): Promise<void> {
  await Promise.allSettled([worker.close(), memoryProcessingQueue.close()]);
}
