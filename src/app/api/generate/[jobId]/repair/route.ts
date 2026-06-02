import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs/store";
import { runManualRepair } from "@/lib/repair/manualRepair";
import type { PipelineStage } from "@/lib/types";

const allowedStages = new Set<PipelineStage>(["intent", "schema", "appSpec"]);

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = getJob(jobId);

  if (!job) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }

  const body = (await request.json()) as { stage?: unknown; errorHint?: unknown };

  if (typeof body.stage !== "string" || !allowedStages.has(body.stage as PipelineStage)) {
    return NextResponse.json({ error: "stage must be one of intent, schema, appSpec" }, { status: 400 });
  }

  try {
    const result = runManualRepair(job, body.stage as PipelineStage, typeof body.errorHint === "string" ? body.errorHint : undefined);
    return NextResponse.json({
      job: result.job,
      beforeErrors: result.beforeErrors,
      afterErrors: result.afterErrors,
      repairLog: result.repairLog
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "manual repair failed" }, { status: 400 });
  }
}
