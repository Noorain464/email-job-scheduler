# Email Scheduler

## Run the backend

Requirements: Node.js, MySQL, and Redis. In MySQL Workbench, create the `email_scheduler` schema, or set another schema name in `backend/.env`. The backend creates its tables when it starts.

Start Redis locally or with Docker:

```sh
docker run --name email-scheduler-redis -p 6379:6379 -d redis:7
```

Configure and start the API:

```sh
cd backend
npm install
cp .env.example .env
npm run dev
```

In a second terminal, start the BullMQ worker:

```sh
cd backend
npm run worker
```

The API runs at `http://localhost:3000`; its health endpoint is `http://localhost:3000/health`.

## Run the frontend

Create `frontend/.env` from the example, install dependencies, and start Vite:

```sh
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`.

## Ethereal Email and environment variables

Create an account at Ethereal Email and use the SMTP username and password it provides. Add one or more senders to `ETHEREAL_SENDERS` in `backend/.env`:

```env
ETHEREAL_SENDERS=[{"id":"sender-1","from":"Demo Sender <sender@example.com>","user":"ethereal-user","pass":"ethereal-password"}]
```

Ethereal captures test messages; it does not deliver them to real inboxes. The worker prints a preview URL for each sent message.

Set these backend variables in `backend/.env`:

| Variable | Purpose |
| --- | --- |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` | MySQL connection and schema settings. |
| `REDIS_URL` | Redis connection, normally `redis://127.0.0.1:6379`. |
| `GOOGLE_CLIENT_ID` | Google OAuth web client ID; use the same value as `VITE_GOOGLE_CLIENT_ID`. |
| `SESSION_SECRET` | Secret used to sign session cookies. |
| `FRONTEND_URL` | Frontend origin, normally `http://localhost:5173`. |
| `ETHEREAL_SENDERS` | JSON array of SMTP sender configurations. |
| `WORKER_CONCURRENCY` | Maximum jobs processed concurrently by one worker (default `5`). |
| `MIN_SEND_INTERVAL_MS` | Minimum interval between sends per sender (default `2000`). |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Per-sender rolling hourly limit (default `200`). |

Set these frontend variables in `frontend/.env`:

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Backend API URL, normally `http://localhost:3000`. |
| `VITE_GOOGLE_CLIENT_ID` | Same Google OAuth web client ID as `GOOGLE_CLIENT_ID`. Register `http://localhost:5173` as an authorized JavaScript origin in Google Cloud. |
| `VITE_DEFAULT_SENDER_ID` | Default configured sender ID for composing email. |

Keep `.env` files private; use the `.env.example` files as templates.

## Architecture overview

### Scheduling

The frontend sends a request for each recipient to the Express API. The API validates the request, stores the email in MySQL, and creates a delayed BullMQ job in Redis using the email ID as the job ID. The separate worker loads due emails and sends them through the configured Ethereal SMTP sender.

### Persistence on restart

MySQL stores email records and is the source of truth. BullMQ stores delayed jobs in Redis. When the API starts, it finds MySQL rows still marked `scheduled` and ensures a queue job exists for each, rebuilding missing jobs. Redis must use persistent storage to retain its queue across Redis container replacement.

Before sending, the worker atomically changes the email status from `scheduled` to `sending`. It then records `sent` or `failed`. This prevents a replayed job from claiming the same email again.

### Rate limiting and concurrency

`WORKER_CONCURRENCY` controls parallel jobs per worker. A Redis Lua script atomically reserves send times per sender, enforcing `MIN_SEND_INTERVAL_MS` and `MAX_EMAILS_PER_HOUR_PER_SENDER` across worker processes. Jobs that exceed a limit are delayed to a later available slot rather than dropped. When many jobs become due together, they remain queued and are sent across later slots and hourly windows.

## Implemented features

### Backend

- Express API for authenticated email scheduling and sender listing.
- MySQL persistence for accounts, email content, schedule times, and statuses.
- BullMQ delayed jobs in Redis with startup recovery from MySQL.
- Separate configurable worker concurrency.
- Redis-backed per-sender minimum send spacing and rolling hourly limits.
- Ethereal SMTP sending with `scheduled`, `sending`, `sent`, and `failed` statuses.
- Google OAuth login and email/password signup and login.

### Frontend

- Login and signup with Google or email and password.
- Dashboard with user profile, logout, Scheduled and Sent tabs, search, loading and empty states, and periodic status refresh.
- Compose screen with sender selection, typed recipients or CSV/text upload, email address detection, subject and formatted body, start time, delay, and hourly limit.
- Email tables showing recipient, subject, schedule/send time, and status.
