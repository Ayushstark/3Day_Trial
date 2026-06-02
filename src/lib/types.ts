import type { z } from "zod";
import type {
  appIntentSchema,
  appSpecSchema,
  dataSchemaSchema,
  integrationRegistrySchema,
  repairLogEntrySchema,
  validationErrorSchema
} from "./schemas";

export type AppIntent = z.infer<typeof appIntentSchema>;
export type DataSchema = z.infer<typeof dataSchemaSchema>;
export type AppSpec = z.infer<typeof appSpecSchema>;
export type IntegrationRegistry = z.infer<typeof integrationRegistrySchema>;
export type ValidationError = z.infer<typeof validationErrorSchema>;
export type RepairLogEntry = z.infer<typeof repairLogEntrySchema>;

export type PipelineStage = "intent" | "schema" | "appSpec";

export type StageStatus = "pending" | "running" | "complete" | "failed";

export type StageEventType =
  | "stage_start"
  | "stage_complete"
  | "stage_failed"
  | "generation_complete";

export type StageEvent = {
  id: number;
  type: StageEventType;
  stage: PipelineStage | "generation";
  timestamp: string;
  latencyMs?: number;
  output?: unknown;
  error?: {
    message: string;
    validationErrors?: ValidationError[];
    repairLog?: RepairLogEntry[];
  };
};

export type CostBreakdown = {
  stage: PipelineStage;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
};

export type GenerationJob = {
  id: string;
  prompt: string;
  status: StageStatus;
  createdAt: string;
  updatedAt: string;
  stages: Record<PipelineStage, StageStatus>;
  events: StageEvent[];
  intent?: AppIntent;
  dataSchema?: DataSchema;
  appSpec?: AppSpec;
  validationErrors: ValidationError[];
  repairLog: RepairLogEntry[];
  costBreakdown: CostBreakdown[];
  latencyByStage: Partial<Record<PipelineStage, number>>;
};
