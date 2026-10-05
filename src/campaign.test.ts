import assert from "node:assert/strict";
import { test } from "node:test";
import { campaignSchema, prepareCampaign } from "./campaign.ts";

test("subscriber updates exclude a revoked consent before preparing delivery", () => {
  const input = campaignSchema.parse({ campaignId: "drop-42", assetUrl: "https://creator.example/download/42", content: "  New print is ready  ", smsBatch: {}, subscribers: [
    { id: "fan-a", optedIn: true, updatedAt: "2026-09-20T10:00:00Z" },
    { id: "fan-b", optedIn: false, updatedAt: "2026-09-21T10:00:00Z" },
  ] });
  const result = prepareCampaign(input);
  assert.deepEqual(result.recipients.map(r => r.subscriberId), ["fan-a"]);
  assert.equal(result.skipped, 1);
  assert.equal(result.content, "New print is ready");
});
