# LabLink

LabLink is a fictional campus lab workspace for PromptWars × Cynergy 2026. It includes a campus equipment catalog, project-based booking, faculty review, and a project assistant.

## Problem and vertical

**Education and campus lab operations.** Students need to find equipment that fits their project and reserve time around shared lab schedules. Faculty need a consistent way to resolve competing requests. LabLink connects project recommendations to the campus inventory, bookable times, and faculty decisions in one workspace.

## Run locally

Use Node.js 22.13+ (22 LTS recommended) and npm. Run these commands from the repository root.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. Express listens at http://127.0.0.1:3001, and Vite proxies `/api`. The server creates and seeds `data/lablink.sqlite` on first launch. The optional `.env.example` lists configuration keys. Copy it to `.env` to change the API port or database path.

```sh
npm run check     # TypeScript and server entry-point syntax
npm test          # SQLite and HTTP integration tests
npm run build     # Vite bundle and type check
npm start         # Serve the built frontend and API together on port 3001
```

## Demo walkthrough

1. **Student demo — Ananya Rao.** Open an equipment detail, select a project, and request a session within lab hours in IST. View confirmations, pending requests, and rescheduling options in **My Bookings**.
2. **Faculty demo.** Switch to the faculty account for the equipment's department and review its queue in **Faculty Approvals**. Dr. Meera Iyer reviews the seeded ECE FPGA requests. Switch back to see the updated status.
3. **Project Assistant.** Describe a project or load the seeded description. Review the equipment, catalog-based guidance, and the next bookable 30-minute slot. Select a saved project to check its deadline and prefill the booking form.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Local health check |
| GET | `/api/demo-accounts` | Available fictional identities |
| GET | `/api/resources` | Catalog, with optional `q`, `department`, `category`, and `status` filters |
| GET | `/api/resources/:id` | Specifications, location, access requirements, and future lab windows |
| GET | `/api/bookings`, `/api/projects` | Current demo account's records |
| POST | `/api/bookings` | Request a session using `resourceId`, `projectId`, `startsAt`, `endsAt`, and `purpose`. Supply time zone offsets and optionally `replaceRequestId` to reschedule a pending request. |
| GET | `/api/approvals` | Pending faculty requests for the faculty account's department |
| POST | `/api/approvals/:id` | Save an `approved` or `declined` decision using `{"decision":"approved"}` |
| GET | `/api/assistant/status` | Assistant configuration status |
| POST | `/api/assistant/recommendations` | Student recommendations for a `description` and optional owned `projectId` |

Account-scoped endpoints accept `x-lablink-demo-account` with an ID from `/api/demo-accounts`. Express checks student project ownership and faculty department permissions using SQLite. Account switching is intentionally open for the localhost demo. A real deployment would require authentication before exposing these routes.

## Structure and assumptions

- The React and Vite frontend calls an Express JSON API. SQLite stores the catalog, projects, lab windows, booking history, approval decisions, and daily AI usage. The scheduling service handles slot checks for both bookings and assistant recommendations. The backend sends structured requests to Gemini and validates its selections against the current catalog.
- `client/src/pages/` contains the six React views. `client/src/components.tsx` contains shared cards, labels, and UI states.
- `server/schema.sql` defines users, projects, resources, availability, bookings, and faculty approvals. `server/seed.mjs` creates fictional fixtures on first launch and preserves subsequent decisions. Times display in IST.
- Sessions last 15 minutes to 8 hours, fit entirely within lab hours, and end by the project deadline when one is set. A session can start exactly when another session or maintenance block ends. Students can use suggested times to replace pending requests.
- Scheduling gives requests waiting at least 48 hours priority in submission order. For other requests, it considers the absence of a feasible alternative, time remaining before the project deadline, project equipment requirements, and minutes of equipment use over the previous 30 days. Submission order breaks ties. The approval transaction rechecks eligibility, availability, and priority before confirming a session.
- Set `GEMINI_API_KEY` in `.env` to enable Gemini in `npm start`. `GEMINI_MODEL` defaults to `gemini-3.1-flash-lite`. Development scripts use catalog keyword matches unless `GEMINI_ENABLE_IN_DEV=true` explicitly enables live requests.
- `GEMINI_DAILY_REQUEST_CAP` defaults to 20 upstream attempts, including retries, and resets at midnight IST. Set it to `0` for keyword matching only. Each account gets four upstream attempts per rolling minute. Equivalent requests reuse verified recommendations for 10 minutes, while booking availability is checked on every response.
- LabLink sends the project description and catalog facts to Gemini. The server validates the returned catalog IDs, fact references, and project excerpts. Provider errors and usage limits switch to labeled keyword matching. Automated tests mock the provider.
- SQLite uses the built-in `node:sqlite` module. The build output, local database, npm dependencies, and local credentials are excluded by Git.
- Lab and equipment imagery in `client/public/images/` is illustrative and generated for the fictional demo.

## Demo limitations

- The demo identities are selectable without sign-in. Keep the running app on localhost with fictional data.
- Lab windows and project deadlines are seeded relative to the first database initialization. If the windows have expired, start a fresh disposable demo with `LABLINK_DB_PATH=:memory: npm run dev`.
- A suggested slot reflects the current schedule. Submitting or approving a booking rechecks that slot before it can be confirmed.
