# Outbox frontend

React, TypeScript, and Vite frontend for the email scheduler.

## Local setup

1. Create a Google OAuth **Web application** client in Google Cloud. Add `http://localhost:5173` as an authorized JavaScript origin.
2. Copy `.env.example` to `.env` and set `VITE_GOOGLE_CLIENT_ID` to that OAuth client ID. Use the same ID as `GOOGLE_CLIENT_ID` in `backend/.env`.
3. Set `SESSION_SECRET` and `FRONTEND_URL=http://localhost:5173` in `backend/.env`. Keep both `.env` files out of source control.
4. Start MySQL, Redis, the backend API, and the BullMQ worker using the backend instructions. Start this app with `npm run dev`.

Google Identity Services returns a real ID token. The backend verifies it with Google and issues a signed, HttpOnly session cookie. Users can also create an account and sign in with email and password; passwords are salted and hashed with scrypt in MySQL. Email API calls include the session cookie, and email records are scoped to the authenticated account. The dashboard is at `/dashboard` after login.

The compose form accepts typed recipients or CSV/text files, extracts unique email addresses, and schedules one API record per address in small batches. Its formatting controls send both text and HTML content. The selected start time, delay, and hourly cap determine each record's initial scheduled time; the backend's Redis limiter also enforces its configured per-sender limits. The dashboard refreshes email status every five seconds and when the browser tab regains focus.

The provided Figma link was not accessible in this session, so the current visual implementation follows the supplied product requirements rather than claiming a pixel-accurate match. Connect the Figma integration to refine spacing, typography, and component details against the source design.
