// SSE endpoint for live session updates. Returns a ReadableStream wrapped in a
// Web Response, the underlying-Web-API pattern documented for Next 16 route
// handlers (node_modules/next/dist/docs/01-app/.../route.md:401-439). Each
// connection registers one Subscriber with the shared hub; the hub owns the
// single poller, so N tabs share one discovery loop.

import { MAX_BACKLOG, subscribe } from "@/lib/sessions/hub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(req: Request): Response {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (frame: string): boolean => {
        // Drop slow clients: a deeply negative desiredSize means frames are
        // backing up past the buffer; enqueue throws once the stream closes.
        if (controller.desiredSize !== null && controller.desiredSize < -MAX_BACKLOG) {
          return false;
        }
        try {
          controller.enqueue(encoder.encode(frame));
          return true;
        } catch {
          return false;
        }
      };

      unsubscribe = subscribe({ write });

      // Tear down the subscription when the client disconnects.
      const onAbort = () => {
        unsubscribe?.();
        unsubscribe = null;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      if (req.signal.aborted) onAbort();
      else req.signal.addEventListener("abort", onAbort, { once: true });
    },
    cancel() {
      unsubscribe?.();
      unsubscribe = null;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Defeat proxy/Next buffering so frames flush immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
