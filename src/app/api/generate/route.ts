import { NextResponse } from "next/server";
import { createJob } from "@/lib/jobs/store";
import { runIntentStage } from "@/lib/pipeline/run";

export async function POST(request: Request) {
  const body = (await request.json()) as { prompt?: unknown };

  if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const job = createJob(body.prompt.trim());

  void runIntentStage(job.id);

  return NextResponse.json({ jobId: job.id });
}
