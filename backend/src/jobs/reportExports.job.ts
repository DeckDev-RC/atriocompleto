import { Job, Queue, Worker } from "bullmq";
import { env } from "../config/env";
import { queueRedis, workerRedis } from "../config/redis";
import { ReportExporterService } from "../services/reportExporter.service";

const QUEUE_NAME = "report-exports";

type ReportExportJob = {
  exportId: string;
};

export const reportExportsQueue = new Queue<ReportExportJob>(QUEUE_NAME, {
  connection: queueRedis as never,
  prefix: env.BULLMQ_PREFIX,
});

const worker = new Worker<ReportExportJob>(
  QUEUE_NAME,
  async (job: Job<ReportExportJob>) => {
    const result = await ReportExporterService.processExport(job.data.exportId);
    return result.id;
  },
  {
    connection: workerRedis as never,
    prefix: env.BULLMQ_PREFIX,
    concurrency: 2,
  },
);

worker.on("completed", (job) => {
  console.log(`[ReportExports] Job ${job.id} completed`);
});

worker.on("failed", (job, error) => {
  console.error(`[ReportExports] Job ${job?.id} failed:`, error);
});

export const ReportExportsQueueService = {
  async enqueue(exportId: string) {
    return reportExportsQueue.add(
      "generate-report-export",
      { exportId },
      {
        jobId: `report-export-${exportId}`,
        removeOnComplete: 100,
        removeOnFail: 100,
        attempts: 2,
        backoff: {
          type: "fixed",
          delay: 30_000,
        },
        timeout: 15 * 60 * 1000,
      } as never,
    );
  },
};

export async function shutdownReportExportsQueue(): Promise<void> {
  await Promise.allSettled([worker.close(), reportExportsQueue.close()]);
}
