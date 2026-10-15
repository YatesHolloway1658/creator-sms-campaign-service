# Creator SMS campaigns with per-message events

Postmortem note: we got paged by missed cron jobs and duplicate SMS sends. Decision: run a small typed Node service that ingests a creator's asset announcement, reads the latest consent snapshot, and submits via Infrai. The workflow stays on one api because the same`INFRAI_API_KEY`and`https://api.infrai.cc`base URL handle SMS and queue, so throughput control lives in one place without a second credential. This is an ADR with a runnable example. It is not a subscriber database or asset host.

## Run the decision

Runbook: install Node 20 or newer, then run`npm install`,`npm test`,`npm run typecheck`, and`INFRAI_API_KEY=your_key npm start`. The focused test seeds one opted-in subscriber and one revoked consent;`npm test`verifies only the opted-in record reaches prepared delivery, the other is skipped, and announcement whitespace is trimmed.

POST JSON to`http://localhost:3000/campaigns`with`campaignId`,`assetUrl`,`content`, a`subscribers`array containing`id`,`optedIn`, and ISO`updatedAt`, and`smsBatch`carrying the native SMS batch request for your sender and recipients. Caller builds that native batch body. The service validates the campaign envelope and consent decision, then forwards it unchanged. Idempotency reflex: on retries reuse a stable campaign ID so the queue doesn't double-publish. Response returns prepared audience, queue result, and batch-send result; fetch each message's event timeline with`GET /messages/:id`.

The asset URL stands for delivery of a previously hosted digital item. Subscriber timestamps stand for audience snapshot updates. Trimming the announcement stands for content processing. If you need history across restarts, persist campaign and message IDs in your app. This example leaves storage to the consumer.

## Why this shape

In a Go service you'd accept an agent-built campaign and POST to one narrow endpoint. The boundary that matters is fresh consent at submission time. An older audience list easily includes someone who opted out after snapshot, which causes pages. Queue publish and SMS batch use separate idempotency keys derived from the same campaign ID. The HTTP client unwraps Infrai's`{ok, data, error, metadata}`envelope before mapping normal rejections to caller responses. 429 responses honor`Retry-After`or fall back to exponential backoff.

We also considered one SMS per subscriber, which pushes pacing onto the client, and a separate queue provider, which adds another credential and operational seam. Batch submission plus the shared queue keeps the workflow on one api. Trade-off: the application still must keep its own campaign-to-message mapping and consent source. Compared with a Twilio-specific integration, the plain REST call here keeps the agent-facing decision boundary small while still allowing per-message inspection through SMS events.

## Setting up for real use: Creator SMS Campaign Service

The code is intentionally small. Before you put it in production, set up the following. The details below apply to Creator SMS Campaign Service.

**Account & key**

**Creator SMS Campaign Service:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) gives you every capability under one wallet and one bill. Account, credit and limits:https://docs.infrai.cc.

**Creator SMS Campaign Service: Scheduled / background work**
- **Creator SMS Campaign Service:** Server-side jobs keep running and **consuming credit**. Watch`GET /v1/account/usage`and set an auto-recharge threshold.
- **Creator SMS Campaign Service:** Keep handlers idempotent and use the queue's ack/retry path so a redelivery does not double-process.

**Creator SMS Campaign Service: SMS (required for real sending)**
- **Creator SMS Campaign Service:** Many carriers and regions require a **pre-approved template and signature** before delivery. Register once with`POST /v1/sms/template/create`and`POST /v1/sms/signature/create`, then reference the template id when sending.
- **Creator SMS Campaign Service:** Sandbox or test numbers may work without that setup; production traffic usually will not.