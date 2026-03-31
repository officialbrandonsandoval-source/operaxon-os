// Copyright (c) 2026 Operaxon Inc. MIT License — see LICENSE.

export interface CronJob {
  id: string;
  name: string;
  schedule: string; // cron expression
  handler: () => Promise<void>;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
}

export class CronEngine {
  private jobs: Map<string, CronJob> = new Map();
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private running = false;

  register(job: Omit<CronJob, 'lastRun' | 'nextRun'>): void {
    const fullJob: CronJob = { ...job, lastRun: null, nextRun: null };
    fullJob.nextRun = this.calculateNextRun(job.schedule);
    this.jobs.set(job.id, fullJob);
  }

  start(): void {
    this.running = true;
    for (const job of this.jobs.values()) {
      if (job.enabled) this.scheduleJob(job);
    }
  }

  stop(): void {
    this.running = false;
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  private scheduleJob(job: CronJob): void {
    if (!this.running) return;

    const nextRun = this.calculateNextRun(job.schedule);
    if (!nextRun) return;

    const delay = new Date(nextRun).getTime() - Date.now();
    if (delay < 0) return;

    const timer = setTimeout(() => {
      job.lastRun = new Date().toISOString();
      void (async () => {
        try {
          await job.handler();
        } catch {
          // Log but don't crash — cron must be resilient
        }
        job.nextRun = this.calculateNextRun(job.schedule);
        this.scheduleJob(job); // reschedule
      })();
    }, delay);

    this.timers.set(job.id, timer);
  }

  private calculateNextRun(schedule: string): string | null {
    // Simple interval-based scheduling for v0.1
    // Format: "every:3600000" for every hour, or "at:HH:MM" for daily
    if (schedule.startsWith('every:')) {
      const ms = parseInt(schedule.slice(6), 10);
      if (isNaN(ms)) return null;
      return new Date(Date.now() + ms).toISOString();
    }
    if (schedule.startsWith('at:')) {
      const timePart = schedule.slice(3);
      const parts = timePart.split(':');
      const hoursStr = parts[0];
      const minutesStr = parts[1];
      if (hoursStr === undefined || minutesStr === undefined) return null;
      const hours = Number(hoursStr);
      const minutes = Number(minutesStr);
      if (isNaN(hours) || isNaN(minutes)) return null;
      const next = new Date();
      next.setHours(hours, minutes, 0, 0);
      if (next.getTime() <= Date.now()) {
        next.setDate(next.getDate() + 1);
      }
      return next.toISOString();
    }
    return null;
  }

  getJobs(): CronJob[] {
    return Array.from(this.jobs.values());
  }
}
