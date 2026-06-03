import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs/store";
import { runIntentStage } from "@/lib/pipeline/run";

export const maxDuration = 300;

export async function POST(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await getJob(jobId);

  if (!job) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }

  await runIntentStage(jobId);

  return NextResponse.json({ jobId });
}
