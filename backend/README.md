# Email scheduler backend

## Run locally

Start MySQL and Redis first. Copy `.env.example` to `.env`, fill in the database and Redis settings, and set:

- `GOOGLE_CLIENT_ID` to the same OAuth client ID used by `VITE_GOOGLE_CLIENT_ID` in `frontend/.env`.
- `SESSION_SECRET` to a long random string.
- `FRONTEND_URL` to the frontend origin (usually `http://localhost:5173`).

From `backend/`, run `npm run dev` to start the API at `http://localhost:3000`. Start the email worker in a second terminal with `npm run worker`. The API health endpoint is `http://localhost:3000/health`.

## Accounts

Users can create an account with name, email, and password (`POST /auth/signup`), sign in with email and password (`POST /auth/login`), or use Google sign-in. Passwords are stored as salted scrypt hashes; successful sign-in creates the same signed HttpOnly session cookie used by the other auth flow.

## Scheduling and delivery

`POST /emails` validates the request and stores it in MySQL. BullMQ stores a delayed job in Redis with the MySQL email ID as its job ID. The worker loads the record from MySQL when the job becomes due and sends it through the Ethereal SMTP account selected by `senderId`.

The API also scans MySQL for rows still marked `scheduled` at startup and ensures they have a BullMQ job. This rebuilds missing jobs after an API restart or Redis data loss. Run Redis with a persistent volume if you want the Redis queue itself to survive container replacement; MySQL remains the source used for recovery.

## Worker throughput and limits

Configuration is read from `.env`:

- `WORKER_CONCURRENCY` sets how many jobs one worker can process in parallel (default: `5`).
- `MIN_SEND_INTERVAL_MS` sets the minimum gap between send reservations for the same sender (default: `2000`, or 2 seconds).
- `MAX_EMAILS_PER_HOUR_PER_SENDER` sets the maximum send reservations per sender in a rolling hour (default: `200`).

The worker uses a Redis Lua script to reserve each sender's next allowed send time atomically. This shares the spacing and hourly count across multiple worker processes. If a job has to wait, the worker moves that BullMQ job to the reserved time; it does not discard or permanently fail it for hitting the limit. Reservations are counted even if SMTP later fails, which is conservative. Scheduling order follows Redis reservation order; parallel workers do not guarantee strict creation-time order.

For example, if 1,000 emails for one sender become due together, they are processed up to the configured worker concurrency, then reserved at least 2 seconds apart, and spread across subsequent rolling-hour windows after the hourly cap is reached. They remain queued while waiting.

## Delivery idempotency limit

Before sending, the worker atomically changes the MySQL row from `scheduled` to `sending`. A replayed job cannot claim that row a second time. After a successful SMTP response the row becomes `sent`; an SMTP error changes it to `failed`.

SMTP does not provide an idempotency key. If the worker stops after the SMTP server accepts a message but before MySQL records `sent`, the row can remain `sending`. The worker will not resend it automatically, to avoid duplicates, so that ambiguous result needs manual review.

## Slack notification status

Slack notifications are not implemented. The worker logs when a sender reaches its hourly cap; it does not send a Slack message.
