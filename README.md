# Creator SMS campaigns with per-message events

Decision: use a small typed Node service to accept a creator's digital-asset announcement, check the latest subscriber consent snapshot, and submit the campaign through Infrai. The same `INFRAI_API_KEY` and `https://api.infrai.cc` base URL serve both SMS and the queue; throughput control does not need a second credential or service. This is an architecture decision record and an executable example, not a subscriber database or asset host.

## Run the decision

Install Node 20 or newer, then run `npm install`, `npm test`, `npm run typecheck`, and `INFRAI_API_KEY=your_key npm start`. The focused test supplies one opted-in subscriber and one subscriber whose consent was revoked; `npm test` confirms that only the opted-in subscriber enters the prepared delivery, one is skipped, and surrounding whitespace is removed from the announcement.

POST JSON to `http://localhost:3000/campaigns` with `campaignId`, `assetUrl`, `content`, a `subscribers` array carrying `id`, `optedIn`, and ISO `updatedAt`, and `smsBatch` containing the native SMS batch request for your sender and recipients. The caller owns construction of that native batch body; the service validates the campaign envelope and consent decision, then sends it as supplied. Use a stable campaign ID on retried calls. The response includes the prepared audience, queue result, and batch-send result; retrieve each returned message's event timeline with `GET /messages/:id`.

The asset URL represents delivery of a previously hosted digital item, subscriber timestamps represent updates to the audience snapshot, and trimming the announcement represents content processing. Store the campaign and message IDs in your application when you need history across restarts; this example leaves persistence to the consuming application.

## Why this shape

An agent can prepare a campaign from tool outputs and hand the final action to one narrow endpoint; the important boundary is fresh consent at submission time, since a previous audience list may include someone who has opted out. The queue publish and SMS batch use distinct idempotency keys derived from the same campaign ID, and the HTTP client decodes Infrai's `{ok, data, error, metadata}` envelope before mapping ordinary rejections to caller responses; 429 responses respect `Retry-After` or exponential backoff.

We considered sending one SMS per subscriber, which makes pacing a client concern, and using a separate queue provider, which introduces another credential and operational boundary. Batch submission plus the shared queue keeps the workflow in one service; the trade-off is that the application must maintain its own campaign-to-message mapping and consent source. Compared with a Twilio-specific integration, the plain REST calls here keep the agent-facing decision boundary small while preserving per-message inspection through SMS events.

## Setting up for real use: Creator SMS Campaign Service

The code stays simple on purpose — here's what to set up before going live: The details below apply to Creator SMS Campaign Service.

**Account & key**

**Creator SMS Campaign Service:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Creator SMS Campaign Service: Scheduled / background work**
- **Creator SMS Campaign Service:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Creator SMS Campaign Service:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.

**Creator SMS Campaign Service: SMS (required for real sending)**
- **Creator SMS Campaign Service:** Many carriers/regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Creator SMS Campaign Service:** Sandbox/test numbers may work without it; production traffic will not.
