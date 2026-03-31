import { Job, Queue, Worker } from "bullmq";
import { env } from "../config/env";
import { queueRedis, workerRedis } from "../config/redis";
import { ReportSchedulerService } from "../services/reportScheduler.service";
import { type ScheduledReportRow } from "../services/reportScheduler.utils";

const QUEUE_NAME = "scheduled-reports";

type ScheduledReportJob = {
  scheduleId: string;
  executionType: "scheduled";
};

export const scheduledReportsQueue = new Queue<ScheduledReportJob>(QUEUE_NAME, {
  connection: queueRedis as never,
  prefix: env.BULLMQ_PREFIX,
});

const worker = new Worker<ScheduledReportJob>(
  QUEUE_NAME,
  async (job: Job<ScheduledReportJob>) => {
    const result = await ReportSchedulerService.executeReport(job.data.scheduleId, {
      executionType: "scheduled",
      attemptNumber: job.attemptsMade + 1,
    });

    if (result.nextRunAt && result.schedule.status === "active") {
      await ScheduledReportsQueueService.enqueueSchedule(result.schedule, result.nextRunAt);
    }

    return result.execution.id;
  },
  {
    connection: workerRedis as never,
    prefix: env.BULLMQ_PREFIX,
    concurrency: 2,
  },
);

worker.on("completed", (job) => {
  console.log(`[ScheduledReports] Job ${job.id} completed`);
});

worker.on("failed", async (job, error) => {
  console.error(`[ScheduledReports] Job ${job?.id} failed:`, error);

  if (!job) return;
  const attempts = job.opts.attempts ?? 1;
  if (job.attemptsMade >= attempts) {
    await ReportSchedulerService.handlePermanentFailure(job.data.scheduleId, error.message);
  }
});

async function getPendingJobs() {
  return scheduledReportsQueue.getJobs(["waiting", "delayed", "prioritized"] as never);
}

export const ScheduledReportsQueueService = {
  async enqueueSchedule(schedule: ScheduledReportRow, runAtIso?: string | null) {
    const runAt = runAtIso ? new Date(runAtIso) : schedule.next_run_at ? new Date(schedule.next_run_at) : null;
    if (!runAt || Number.isNaN(runAt.getTime())) return null;

    const delay = Math.max(runAt.getTime() - Date.now(), 0);
    const jobId = `scheduled-report:${schedule.id}:${runAt.getTime()}`;

    return scheduledReportsQueue.add(
      "execute-scheduled-report",
      {
        scheduleId: schedule.id,
        executionType: "scheduled",
      },
      {
        jobId,
        delay,
        attempts: 3,
        backoff: {
          type: "fixed",
          delay: 60 * 60 * 1000,
        },
        removeOnComplete: 100,
        removeOnFail: 100,
        timeout: 10 * 60 * 1000,
      } as never,
    );
  },

  async removePendingJobs(scheduleId: string) {
    const jobs = await getPendingJobs();
    const matches = jobs.filter((job) => job.data?.scheduleId === scheduleId);
    await Promise.all(matches.map((job) => job.remove().catch(() => undefined)));
  },

  async syncActiveSchedules() {
    const schedules = await ReportSchedulerService.getActiveSchedules();
    for (const schedule of schedules) {
      await this.removePendingJobs(schedule.id);
      await this.enqueueSchedule(schedule);
    }
  },
};
