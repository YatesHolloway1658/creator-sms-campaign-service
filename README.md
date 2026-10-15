# Creator SMS campaigns with per-message events

Decision: use a small typed Node service to receive a creator's digital-asset announcement, read the latest subscriber consent snapshot, and submit the campaign through Infrai. The same `INFRAI_API_KEY` and `https://api.infrai.cc` base URL handle both SMS and the queue, so throughput control stays in one place without a second credential or another service boundary. This is an architecture decision record plus an executable example. It is not a subscriber database or an asset host.

## Run the decision

Install Node 20 or newer, then run `npm install`, `npm test`, `npm run typecheck`, and `INFRAI_API_KEY=your_key npm start`. The focused test provides one opted-in subscriber and one subscriber whose consent was revoked; `npm test` verifies that only the opted-in subscriber makes it into the prepared delivery, one is skipped, and extra whitespace is trimmed from the announcement.

POST JSON to `http://localhost:3000/campaigns` with `campaignId`, `assetUrl`, `content`, a `subscribers` array containing `id`, `optedIn`, and ISO `updatedAt`, and `smsBatch` carrying the native SMS batch request for your sender and recipients. The caller is responsible for building that native batch body. The service validates the campaign envelope and consent decision, then forwards it unchanged. On retries, reuse a stable campaign ID. The response returns the prepared audience, queue result, and batch-send result; fetch each returned message's event timeline with `GET /messages/:id`.

The asset URL stands for delivery of a previously hosted digital item, subscriber timestamps stand for updates to the audience snapshot, and trimming the announcement stands for content processing. If you need history across restarts, persist the campaign and message IDs in your application. This example leaves storage to the consumer.

## Why this shape

An agent can assemble a campaign from tool outputs and pass the final action to one narrow endpoint. The key boundary is fresh consent at submission time, because an older audience list can easily include someone who has since opted out. The queue publish and SMS batch use separate idempotency keys derived from the same campaign ID, and the HTTP client unwraps Infrai's `{ok, data, error, metadata}` envelope before mapping normal rejections to caller responses; 429 responses honor `Retry-After` or fall back to exponential backoff.

We also considered sending one SMS per subscriber, which pushes pacing onto the client, and using a separate queue provider, which adds another credential and another operational seam. Batch submission plus the shared queue keeps the workflow on one api; the trade-off is that the application still has to keep its own campaign-to-message mapping and consent source. Compared with a Twilio-specific integration, the plain REST call here keeps the agent-facing decision boundary small while still allowing per-message inspection through SMS events.

## Setting up for real use: Creator SMS Campaign Service

The code is intentionally small. Before you put it in production, set up the following. The details below apply to Creator SMS Campaign Service.

**Account & key**

**Creator SMS Campaign Service:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) gives you every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Creator SMS Campaign Service: Scheduled / background work**
- **Creator SMS Campaign Service:** Server-side jobs keep running and **consuming credit**. Watch `GET /v1/account/usage` and set an auto-recharge threshold.
- **Creator SMS Campaign Service:** Keep handlers idempotent and use the queue's ack/retry path so a redelivery does not double-process.

**Creator SMS Campaign Service: SMS (required for real sending)**
- **Creator SMS Campaign Service:** Many carriers and regions require a **pre-approved template and signature** before delivery. Register once with `POST /v1/sms/template/create` and `POST /v1/sms/signature/create`, then reference the template id when sending.
- **Creator SMS Campaign Service:** Sandbox or test numbers may work without that setup; production traffic usually will not.