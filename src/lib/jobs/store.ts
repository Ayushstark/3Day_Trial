import type { GenerationJob, PipelineStage, StageEvent, StageStatus } from "@/lib/types";

type JobGlobalState = {
  jobs: Map<string, GenerationJob>;
  eventCounter: number;
};

type RedisEnvelope<T> = {
  result?: T;
  error?: string;
};

const jobTtlSeconds = 60 * 60 * 24;
const globalJobState = globalThis as typeof globalThis & {
  __oneAtlasJobs?: JobGlobalState;
};

const state =
  globalJobState.__oneAtlasJobs ??
  (globalJobState.__oneAtlasJobs = {
    jobs: new Map<string, GenerationJob>(),
    eventCounter: 0
  });

export async function createJob(prompt: string): Promise<GenerationJob> {
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

  await saveJob(job);
  return job;
}

export async function getJob(jobId: string): Promise<GenerationJob | undefined> {
  const redis = getRedisConfig();
  if (!redis) {
    return state.jobs.get(jobId);
  }

  const value = await redisCommand<string>(redis, ["GET", jobKey(jobId)]);
  if (!value) {
    return undefined;
  }

  const parsed = JSON.parse(value) as GenerationJob;
  state.jobs.set(jobId, parsed);
  return parsed;
}

export async function updateJob(jobId: string, updater: (job: GenerationJob) => GenerationJob): Promise<GenerationJob | undefined> {
  const existing = await getJob(jobId);
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
  await saveJob(updated);
  return updated;
}

export function pushEvent(job: GenerationJob, event: Omit<StageEvent, "id" | "timestamp">): GenerationJob {
  return {
    ...job,
    events: [
      ...job.events,
      {
        ...event,
        id: nextEventId(job),
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

async function saveJob(job: GenerationJob): Promise<void> {
  state.jobs.set(job.id, job);

  const redis = getRedisConfig();
  if (!redis) {
    return;
  }

  await redisCommand(redis, ["SET", jobKey(job.id), JSON.stringify(job), "EX", String(jobTtlSeconds)]);
}

function nextEventId(job: GenerationJob): number {
  const latestJobEvent = job.events.reduce((max, event) => Math.max(max, event.id), 0);
  state.eventCounter = Math.max(state.eventCounter, latestJobEvent) + 1;
  return state.eventCounter;
}

function jobKey(jobId: string): string {
  return `oneatlas:job:${jobId}`;
}

function getRedisConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  return { url, token };
}

async function redisCommand<T = unknown>(config: { url: string; token: string }, command: string[]): Promise<T | undefined> {
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  if (!response.ok) {
    throw new Error(`Redis command failed with ${response.status}: ${await response.text()}`);
  }

  const envelope = (await response.json()) as RedisEnvelope<T>;
  if (envelope.error) {
    throw new Error(`Redis command failed: ${envelope.error}`);
  }

  return envelope.result;
}
