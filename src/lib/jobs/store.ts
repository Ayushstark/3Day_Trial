import type { GenerationJob, PipelineStage, StageEvent, StageStatus } from "@/lib/types";

type JobGlobalState = {
  jobs: Map<string, GenerationJob>;
  eventCounter: number;
};

const globalJobState = globalThis as typeof globalThis & {
  __oneAtlasJobs?: JobGlobalState;
};

const state =
  globalJobState.__oneAtlasJobs ??
  (globalJobState.__oneAtlasJobs = {
    jobs: new Map<string, GenerationJob>(),
    eventCounter: 0
  });

export function createJob(prompt: string): GenerationJob {
  const now = new Date().toISOString();
  const job: GenerationJob = {
    id: crypto.randomUUID(),
    prompt,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    stages: {
      intent: "pending",
      schema: "pending",
      appSpec: "pending"
    },
    events: [],
    validationErrors: [],
    repairLog: [],
    costBreakdown: [],
    latencyByStage: {}
  };

  state.jobs.set(job.id, job);
  return job;
}

export function getJob(jobId: string): GenerationJob | undefined {
  return state.jobs.get(jobId);
}

export function listJobs(): GenerationJob[] {
  return Array.from(state.jobs.values());
}

export function updateJob(jobId: string, updater: (job: GenerationJob) => GenerationJob): GenerationJob | undefined {
  const existing = state.jobs.get(jobId);
  if (!existing) {
    return undefined;
  }

  const updated = updater({
    ...existing,
    stages: { ...existing.stages },
    events: [...existing.events],
    validationErrors: [...existing.validationErrors],
    repairLog: [...existing.repairLog],
    costBreakdown: [...existing.costBreakdown],
    latencyByStage: { ...existing.latencyByStage }
  });
  updated.updatedAt = new Date().toISOString();
  state.jobs.set(jobId, updated);
  return updated;
}

export function pushEvent(job: GenerationJob, event: Omit<StageEvent, "id" | "timestamp">): GenerationJob {
  return {
    ...job,
    events: [
      ...job.events,
      {
        ...event,
        id: ++state.eventCounter,
        timestamp: new Date().toISOString()
      }
    ]
  };
}

export function setStage(job: GenerationJob, stage: PipelineStage, status: StageStatus): GenerationJob {
  return {
    ...job,
    status,
    stages: {
      ...job.stages,
      [stage]: status
    }
  };
}
