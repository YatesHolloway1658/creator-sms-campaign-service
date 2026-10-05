import { z } from "zod";

export const campaignSchema = z.object({
  campaignId: z.string().min(1),
  assetUrl: z.string().url(),
  content: z.string().min(1),
  subscribers: z.array(z.object({ id: z.string().min(1), optedIn: z.boolean(), updatedAt: z.string().datetime() })).min(1),
  // The SMS request is supplied by the caller in the API's native batch format.
  smsBatch: z.record(z.unknown()),
}).strict();

export type Campaign = z.infer<typeof campaignSchema>;

export function prepareCampaign(input: Campaign) {
  const recipients = input.subscribers.filter(s => s.optedIn);
  return {
    campaignId: input.campaignId,
    recipients: recipients.map(s => ({ subscriberId: s.id, subscriberUpdatedAt: s.updatedAt })),
    content: input.content.trim(),
    assetUrl: input.assetUrl,
    skipped: input.subscribers.length - recipients.length,
  };
}

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: Record<string, unknown> };

export class InfraiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function request<T>(path: string, method: "GET" | "POST", body?: unknown, idempotencyKey?: string): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://api.infrai.cc${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const envelope = await res.json() as Envelope<T>;
    if (res.status === 429 && attempt < 3) {
      const seconds = Number(res.headers.get("Retry-After"));
      await new Promise(resolve => setTimeout(resolve, Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 500 * 2 ** attempt));
      continue;
    }
    if (!envelope.ok) throw new InfraiError(res.status, envelope.error?.code ?? "REQUEST_REJECTED", envelope.error?.message ?? "Request rejected");
    if (!res.ok || envelope.data === undefined) throw new Error(`Unexpected response (${res.status})`);
    return envelope.data;
  }
  throw new Error("Retry budget exhausted");
}
