# SET background rest alerts

Cloudflare Worker with one SQLite Durable Object. Durable alarms wake the scheduler without an open app or incoming requests. Subscriptions, token hashes, VAPID keys and pending deadlines persist inside the Durable Object. Workout records stay on the device.

## Deploy from GitHub

- Workers & Pages > Create application > Connect GitHub.
- Repository: RoyalkABRO/RoyalkABRO.github.io; branch: main.
- Worker name: set-notifications.
- Root directory: set-notifications.
- Build command: npm test
- Deploy command: npx wrangler deploy
- Stay on Workers Free. No custom domain is needed.
- After deployment, Settings > Variables and Secrets > Add secret: PAIRING_CODE. Choose a private random code with at least 16 characters. Do not commit it or post it in chat. Add it as a runtime secret, not a build variable.
- Open the worker URL + /health: it must return {"ok":true}. Before setting PAIRING_CODE, it deliberately returns setupRequired with HTTP 503.
- Configure the public worker URL in SET, then enter the pairing code directly on the phone. On iPhone use the app installed on the Home Screen and allow notifications.

## Verification

Run npm test inside this directory. Tests cover real SQLite persistence and service scheduling/authentication. Cloudflare build/runtime, a real push subscription, and locked-screen phone delivery still require deployment verification; unit tests do not establish these.

The worker uses web-push for VAPID and encrypted request creation, then native fetch for delivery. It never logs secrets or subscriptions. A timer update replaces the older deadline; cancellation advances the sequence, so a delayed request cannot resurrect it. Transient delivery failures retry briefly; stale timers expire after 60 seconds. Internet and OS notification permissions are required, and delivery time/sound remains subject to network and phone settings.
