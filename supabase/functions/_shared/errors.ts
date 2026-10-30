// Error responses for edge functions. No Deno APIs or remote imports here,
// so the vitest suite (src/test/errors.test.ts) can import it directly.

/** An expected failure whose message is safe to show to the caller. */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

function json(body: Record<string, unknown>, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Response for a caught error. HttpError keeps its status and message.
 * Anything else is logged with a request id and answered with a generic 500,
 * so database, provider and stack details never reach the client.
 */
export function errorResponse(
  context: string,
  err: unknown,
  corsHeaders: Record<string, string>,
): Response {
  if (err instanceof HttpError) {
    return json({ error: err.message }, err.status, corsHeaders);
  }

  const requestId = crypto.randomUUID();
  console.error(`[${context}] request_id=${requestId}`, err);
  return json(
    {
      error: `Something went wrong. Please try again, or contact support with reference ${requestId}.`,
      request_id: requestId,
    },
    500,
    corsHeaders,
  );
}
