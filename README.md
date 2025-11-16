# Pragati Backend

Node.js + TypeScript service for the Pragati student attendance platform. It uses Express for HTTP handling and Prisma for MySQL persistence, mirroring the schema defined in `docs/data-model.md`.

## Prerequisites
- Node.js 20+
- MySQL 8+

## Setup
1. Install dependencies:
   ```powershell
   npm install
   ```
2. Copy environment template and adjust credentials:
   ```powershell
   Copy-Item .env.example .env
   ```
3. Update `.env` with a valid `DATABASE_URL` (e.g. `mysql://user:pass@localhost:3306/pragati`) and set `AUTH_JWT_SECRET` to a strong random string. `AUTH_JWT_EXPIRES_IN` defaults to `12h` if omitted.
4. Apply the schema to your database:
   ```powershell
   npx prisma migrate deploy
   ```
   Development tip: run `npx prisma migrate dev` when editing the schema so Prisma creates versioned migrations automatically.

## Scripts
- `npm run dev` – start the API with live reload.
- `npm run build` – emit compiled JS to `dist/`.
- `npm start` – run the compiled server.
- `npm run lint` – ESLint over `.ts` sources.
- `npm run typecheck` – strict TypeScript compile without emit.

## Authentication
`POST /api/auth/login` returns a signed JWT (`token`) plus the `userId`, role, and linked student/teacher IDs after verifying the email/password hash stored in the `users` table. Send the token on every protected request using the `Authorization: Bearer <token>` header. Role-based access is still enforced server-side:

- `ADMIN`/`GOVERNMENT` can manage all schools.
- `TEACHER` is restricted to their `schoolId` and, where applicable, their own `teacherId`.
- `STUDENT` may only access their own records.

Additional admin-only helpers live under `/api/auth/users` for creating accounts and toggling statuses. Teachers are scoped to their school and to the classrooms where they are set as the homeroom (`classTeacherId`); only those teachers or approved devices may create or update daily attendance sessions.

### Attendance devices
Set `ATTENDANCE_DEVICE_KEY` in `.env` if you have RFID/facial devices pushing attendance directly. Those devices can call `POST /api/attendance/sessions` or `POST /api/attendance/sessions/:sessionId/records` without a user account by supplying the matching secret in the `x-device-key` header. Otherwise, only authenticated teachers are allowed to create sessions or mark attendance.

## API Overview
Base path: `/api`

| Domain | Prefix | Key endpoints |
| --- | --- | --- |
| Health | `/api/health` | Service heartbeat |
| Auth | `/api/auth` | `POST /login`, `POST /users`, `GET /users`, `PATCH /users/:id/status` |
| Core entities | `/api/core` | `POST /schools`, `/grades`, `/sections`, `/classrooms`, `/teachers`, `/subjects`, `/students`, `GET /students/:id` |
| Enrollment | `/api/enrollment` | `POST /teacher-subjects`, `/student-subjects`, `/student-groups`, `/student-groups/:groupId/members`, `GET /student-groups` |
| Attendance | `/api/attendance` | `POST /sessions`, `/sessions/:sessionId/records`, `GET /students/:studentId`, `GET /students/summary`, `GET /classrooms/:classroomId/summary` |
| Assessments | `/api/assessments` | `POST /exams`, `/exam-results`, `GET /students/:studentId/latest` |
| Notifications | `/api/communications` | `POST /notifications`, `GET /notifications/active` |

Refer to `docs/data-model.md` for table-level details and to `docs/phased-roadmap.md` for the rollout plan.
