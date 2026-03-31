import cron from 'node-cron';

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  handler: () => Promise<void> | void;
  enabled: boolean;
  lastRun?: Date;
  lastError?: string;
  runCount: number;
}

export class CronScheduler {
  private jobs: Map<string, { job: CronJob; task: cron.ScheduledTask }> = new Map();

  register(
    id: string,
    name: string,
    schedule: string,
    handler: () => Promise<void> | void
  ): CronJob {
    if (!cron.validate(schedule)) {
      throw new Error(`Invalid cron schedule: ${schedule}`);
    }

    const job: CronJob = {
      id,
      name,
      schedule,
      handler,
      enabled: true,
      runCount: 0,
    };

    const task = cron.schedule(schedule, async () => {
      job.lastRun = new Date();
      job.runCount++;
      console.log(`[Cron] Running job: ${name} (${id})`);

      try {
        await handler();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        job.lastError = msg;
        console.error(`[Cron] Job ${id} failed:`, msg);
      }
    });

    this.jobs.set(id, { job, task });
    console.log(`[Cron] Registered job "${name}" (${id}) — ${schedule}`);
    return job;
  }

  pause(id: string): boolean {
    const entry = this.jobs.get(id);
    if (!entry) return false;
    entry.task.stop();
    entry.job.enabled = false;
    console.log(`[Cron] Paused job: ${id}`);
    return true;
  }

  resume(id: string): boolean {
    const entry = this.jobs.get(id);
    if (!entry) return false;
    entry.task.start();
    entry.job.enabled = true;
    console.log(`[Cron] Resumed job: ${id}`);
    return true;
  }

  remove(id: string): boolean {
    const entry = this.jobs.get(id);
    if (!entry) return false;
    entry.task.destroy();
    this.jobs.delete(id);
    console.log(`[Cron] Removed job: ${id}`);
    return true;
  }

  list(): CronJob[] {
    return [...this.jobs.values()].map((e) => e.job);
  }

  async runNow(id: string): Promise<void> {
    const entry = this.jobs.get(id);
    if (!entry) throw new Error(`Job ${id} not found`);
    await entry.job.handler();
  }

  shutdown(): void {
    this.jobs.forEach(({ task }) => task.destroy());
    this.jobs.clear();
    console.log('[Cron] Scheduler shut down');
  }
}
