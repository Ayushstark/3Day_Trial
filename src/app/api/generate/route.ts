import { NextResponse } from "next/server";
import { createJob } from "@/lib/jobs/store";

export async function POST(request: Request) {
  const body = (await request.json()) as { prompt?: unknown };

  if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const job = await createJob(body.prompt.trim());

  return NextResponse.json({ jobId: job.id });
}
