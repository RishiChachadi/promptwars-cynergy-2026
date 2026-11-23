# LabLink

LabLink is a fictional campus lab workspace for PromptWars × Cynergy 2026. Phase 2 adds project-based equipment booking and conflict resolution to the equipment catalog and faculty review workflow.

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
3. **Project Assistant.** View the seeded project and follow the catalog link while recommendations are unavailable.

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
| GET | `/api/assistant/status` | Phase 1 assistant availability |

Account-scoped endpoints accept `x-lablink-demo-account` with an ID from `/api/demo-accounts`. Express checks student project ownership and faculty department permissions using SQLite. Account switching is intentionally open for the localhost demo. A real deployment would require authentication before exposing these routes.

## Structure and assumptions

- `client/src/pages/` contains the six React views. `client/src/components.tsx` contains shared cards, labels, and UI states.
- `server/schema.sql` defines users, projects, resources, availability, bookings, and faculty approvals. `server/seed.mjs` creates fictional fixtures on first launch and preserves subsequent decisions. Times display in IST.
- Sessions last 15 minutes to 8 hours, fit entirely within lab hours, and end by the project deadline when one is set. A session can start exactly when another session or maintenance block ends. Students can use suggested times to replace pending requests.
- Scheduling gives requests waiting at least 48 hours priority in submission order. For other requests, it considers the absence of a feasible alternative, time remaining before the project deadline, project equipment requirements, and minutes of equipment use over the previous 30 days. Submission order breaks ties. The approval transaction rechecks eligibility, availability, and priority before confirming a session.
- `server/assistant.mjs` is the server-only provider boundary. `GEMINI_API_KEY` and `GEMINI_MODEL` are optional and the status route works without credentials. Phase 1 performs no inference or synthetic recommendation generation.
- SQLite uses the built-in `node:sqlite` module. The build output, local database, npm dependencies, and local credentials are excluded by Git.
- Lab and equipment imagery in `client/public/images/` is illustrative and generated for the fictional demo.
