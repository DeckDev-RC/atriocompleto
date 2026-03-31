import { Job, Queue, Worker } from "bullmq";
import { queueRedis, workerRedis } from "../config/redis";
import { env } from "../config/env";
import { FileProcessor } from "./optimus/fileProcessor";

const QUEUE_NAME = "optimus-file-processing";

export const fileProcessingQueue = new Queue(QUEUE_NAME, {
  connection: queueRedis as any,
  prefix: env.BULLMQ_PREFIX,
});

const worker = new Worker(
  QUEUE_NAME,
  async (job: Job<{ uploadedFileId: string }>) => {
    await FileProcessor.processUploadedFile(job.data.uploadedFileId);
  },
  {
    connection: workerRedis as any,
    prefix: env.BULLMQ_PREFIX,
    concurrency: 2,
  },
);

worker.on("failed", (job, error) => {
  console.error(`[FileQueue] Job ${job?.id} failed:`, error);
});

worker.on("completed", (job) => {
  console.log(`[FileQueue] Job ${job.id} completed`);
});

export const FileProcessingQueueService = {
  enqueue(uploadedFileId: string) {
    return fileProcessingQueue.add(
      "process-file",
      { uploadedFileId },
      {
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
  },
};
