# LabLink

LabLink is a fictional campus lab workspace for PromptWars × Cynergy 2026. Phase 1 includes equipment discovery, seeded bookings, a faculty review demo, and an assistant status page.

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

1. **Student demo — Ananya Rao.** Browse ECE, CSE, and Mechanical equipment. Search for `ESP32`, combine filters, or open an equipment detail for lab windows and access requirements. View the seeded reservations in **My Bookings**.
2. **Faculty demo — Dr. Meera Iyer.** Use the account selector at the bottom of the sidebar. Review an ECE FPGA request in **Faculty Approvals**, then switch back to see the updated booking status in the student view. One FPGA request belongs to Ananya and the other belongs to a second fictional student.
3. **Project Assistant.** View the seeded project and follow the catalog link while recommendations are unavailable.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Local health check |
| GET | `/api/demo-accounts` | Available fictional identities |
| GET | `/api/resources` | Catalog, with optional `q`, `department`, `category`, and `status` filters |
| GET | `/api/resources/:id` | Specifications, location, access requirements, and future lab windows |
| GET | `/api/bookings`, `/api/projects` | Current demo account's records |
| GET | `/api/approvals` | Pending faculty requests for the faculty account's department |
| POST | `/api/approvals/:id` | Save an `approved` or `declined` decision using `{"decision":"approved"}` |
| GET | `/api/assistant/status` | Phase 1 assistant availability |

Account-scoped endpoints accept `x-lablink-demo-account: demo-student` or `demo-faculty`. Express looks up the role and department in SQLite and checks both before recording a faculty decision. Decisions and booking status updates commit together. Account switching is intentionally open for the localhost demo. A real deployment would require authentication before exposing these routes.

## Structure and assumptions

- `client/src/pages/` contains the six React views. `client/src/components.tsx` contains shared cards, labels, and UI states.
- `server/schema.sql` defines users, projects, resources, availability, bookings, and faculty approvals. `server/seed.mjs` creates fictional fixtures on first launch and preserves subsequent decisions. Times display in IST.
- Availability rows describe lab hours or maintenance blocks. Booking creation, availability enforcement, overlap detection, and fair conflict resolution are reserved for a separate scheduling service in a later phase. The approval demo operates on existing fixture bookings.
- `server/assistant.mjs` is the server-only provider boundary. `GEMINI_API_KEY` and `GEMINI_MODEL` are optional and the status route works without credentials. Phase 1 performs no inference or synthetic recommendation generation.
- SQLite uses the built-in `node:sqlite` module. The build output, local database, npm dependencies, and local credentials are excluded by Git.
- Lab and equipment imagery in `client/public/images/` is illustrative and generated for the fictional demo.
