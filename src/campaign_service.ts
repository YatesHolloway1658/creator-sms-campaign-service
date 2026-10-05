import { createServer } from "node:http";
import { campaignSchema, InfraiError, prepareCampaign, request } from "./campaign.ts";

const server = createServer(async (req, res) => {
  const send = (status: number, value: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
  try {
    if (req.method === "POST" && req.url === "/campaigns") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const parsed = campaignSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      if (!parsed.success) return send(400, { error: parsed.error.flatten() });
      const campaign = prepareCampaign(parsed.data);
      if (campaign.recipients.length === 0) return send(422, { error: "No opted-in subscribers" });
      const queued = await request<unknown>("/v1/queue/publish_batch", "POST", {
        queue: "sms-campaigns",
        messages: [campaign],
        idempotency_key: `${campaign.campaignId}:queue`,
      });
      const sent = await request<unknown>("/v1/sms/batch/send", "POST", parsed.data.smsBatch, `${campaign.campaignId}:sms`);
      return send(202, { campaign, queued, sent });
    }
    if (req.method === "GET" && req.url?.startsWith("/messages/")) {
      const id = req.url.slice("/messages/".length);
      if (!id || id.includes("/")) return send(400, { error: "Invalid message id" });
      const events = await request<unknown>(`/v1/sms/events/${encodeURIComponent(id)}`, "GET");
      return send(200, { messageId: id, events });
    }
    return send(404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof InfraiError) return send(error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.code, message: error.message });
    return send(error instanceof SyntaxError ? 400 : 502, { error: error instanceof Error ? error.message : "Request failed" });
  }
});

server.listen(Number(process.env.PORT ?? 3000), () => console.log("Campaign service listening"));
