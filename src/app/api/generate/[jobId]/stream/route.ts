import { getJob } from "@/lib/jobs/store";

export async function GET(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let lastEventId = 0;
      const sendEvents = async () => {
        const job = await getJob(jobId);
        if (!job) {
          controller.enqueue(encoder.encode(`event: stage_failed\ndata: ${JSON.stringify({ message: "job not found" })}\n\n`));
          controller.close();
          return;
        }

        for (const event of job.events.filter((candidate) => candidate.id > lastEventId)) {
          controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
          lastEventId = event.id;
        }

        if (job.stages.appSpec === "complete" || job.stages.intent === "failed" || job.stages.schema === "failed" || job.stages.appSpec === "failed") {
          controller.close();
          return;
        }

        setTimeout(() => void sendEvents(), 250);
      };

      void sendEvents();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
