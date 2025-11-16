# Pragati Backend API Guide

The Pragati backend exposes a JSON API rooted at `/api`. All identifiers are stored as MySQL `BIGINT` and serialized to strings (via a `BigInt.toJSON` override). Unless stated otherwise, endpoints require an authenticated caller.

## Conventions & Headers

- `Content-Type: application/json` for every request with a body.
- `Authorization: Bearer <token>` is required on all protected routes. Tokens are obtained from `POST /api/auth/login` and are signed with `AUTH_JWT_SECRET`.
- `x-device-key: <secret>` can replace the Authorization header **only** for `POST /api/attendance/sessions` and `POST /api/attendance/sessions/:id/records`, and only when the key matches `ATTENDANCE_DEVICE_KEY`.
- Role enforcement mirrors `users.role` (`ADMIN`, `GOVERNMENT`, `PRINCIPAL`, `TEACHER`, `STUDENT`). Teachers and principals are scoped to their `schoolId`; teachers additionally must match `classTeacherId` for student/attendance data, while principals can review school-wide reports and manage timetables for their campus.
- Validation failures return `400` with `{ "message": "Validation failed", "errors": { ... } }`. Authorization errors use `403`, missing records use `404`, duplicate attendance sessions use `409`.

## Health

### GET `/api/health`
- **Roles**: Public
- **Description**: Readiness probe.
- **Response 200**
```json
{ "status": "ok" }
```

## Authentication

### POST `/api/auth/login`
- **Roles**: Public
- **Body**
```json
{
	"email": "admin@mock.test",
	"password": "AdminPass123!"
}
```
- **Response 200**
```json
{
	"token": "<jwt>",
	"expiresIn": "12h",
	"userId": "1",
	"role": "ADMIN",
	"studentId": null,
	"teacherId": null,
	"schoolId": "1"
}
```
- **Errors**: `401` invalid credentials, `403` user blocked.

### POST `/api/auth/users`
- **Roles**: `ADMIN`
- **Body**
```json
{
  "email": "teacher@mock.test",
  "password": "TeacherPass123!",
  "phoneNumber": "+15550001002",
  "role": "TEACHER",
  "schoolId": "1",
  "teacherId": "7"
}
```
- **Response 201**: Created user minus password hash.

### GET `/api/auth/users`
- **Roles**: `ADMIN`, `GOVERNMENT`
- **Response 200**
```json
[
  {
    "id": "1",
    "email": "admin@mock.test",
    "phoneNumber": null,
    "role": "ADMIN",
    "status": "active",
    "studentId": null,
    "teacherId": null,
    "schoolId": "1",
    "createdAt": "2025-11-16T06:57:00.000Z"
  }
]
```

### PATCH `/api/auth/users/:id/status`
- **Roles**: `ADMIN`
- **Body**
```json
{ "status": "blocked" }
```
- **Response 200**: Updated user record (without password hash).

## Core Entities (`/api/core`)

All routes require an Authorization header. Teachers automatically scope to their `schoolId` and may only read individual students when they are the assigned homeroom (`classTeacherId`).

### POST `/api/core/schools`
Body `{ "name": "Central High", "district": "Pune" }`. Roles: `ADMIN`, `GOVERNMENT`. Response: created school row with `id`, timestamps, and `isActive` flag.

### GET `/api/core/schools`
Roles: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`. School-scoped roles (teachers/principals) automatically receive only their campus.

### POST `/api/core/grades`
Body `{ "schoolId": "1", "name": "Grade 8", "level": 8 }`. Roles: `ADMIN`, `GOVERNMENT`.

### GET `/api/core/grades`
Roles: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`. Optional `schoolId` query (teachers/principals are forced to their school). Response includes sections for each grade.

### POST `/api/core/sections`
Body `{ "gradeId": "10", "label": "A" }`. Roles: `ADMIN`, `GOVERNMENT`.

### GET `/api/core/sections`
Roles: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`. Optional `gradeId` query. School-scoped roles are implicitly filtered through the grade relation.

### POST `/api/core/classrooms`
Body `{ "schoolId": "1", "gradeId": "10", "sectionId": "4", "academicYear": "2025-2026" }`. Roles: `ADMIN`, `GOVERNMENT`.

### GET `/api/core/classrooms`
Roles: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`. Optional `schoolId` query. Response includes grade and section objects for context; teachers/principals are scoped to their school automatically.

### POST `/api/core/teachers`
Body `{ "schoolId": "1", "firstName": "Tina", "lastName": "Teacher", "email": "teacher@school.test" }`.

### GET `/api/core/teachers`
Roles: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`. Optional `schoolId`. School-scoped roles only see their own campus.

### POST `/api/core/subjects`
Body `{ "schoolId": "1", "code": "MATH8", "name": "Mathematics" }`.

### GET `/api/core/subjects`
Roles: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`. Optional `schoolId` filter; school-scoped roles are limited to their campus.

### POST `/api/core/students`
Roles: `ADMIN`, `GOVERNMENT`.
```json
{
  "schoolId": "1",
  "classroomId": "25",
  "classTeacherId": "7",
  "code": "STU-0001",
  "phoneNumber": "+15550001001",
  "firstName": "Sanjay",
  "lastName": "Student",
  "gradeLevel": 8,
  "sectionLabel": "A",
  "enrolledAt": "2025-06-03"
}
```

### GET `/api/core/students`
Roles: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`. Optional `classroomId` query. Teachers only see students where `classTeacherId` equals their `teacherId`; principals may view all students in their assigned school.

### GET `/api/core/students/:id`
Roles: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`, `STUDENT`. Returns the student plus `subjects` and `attendances`. Teachers must be the student's homeroom teacher; principals can view students within their school; students may only view themselves.

## Enrollment (`/api/enrollment`)

### POST `/api/enrollment/teacher-subjects`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Body**
```json
{
	"teacherId": "7",
	"subjectId": "3",
	"classroomId": "25",
	"startDate": "2025-06-01",
	"endDate": null
}
```
- Teachers can only manage their own assignments. Principals must belong to the same school as the teacher/classroom they are updating.

### POST `/api/enrollment/student-subjects`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Body** `{ "studentId": "45", "teacherSubjectId": "12", "enrolledOn": "2025-06-05", "status": "active" }`
- Teachers are limited to `teacherSubject` rows they own; principals must operate within their assigned school.

### POST `/api/enrollment/student-groups`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Body** `{ "schoolId": "1", "name": "Remediation Batch", "description": "Math help", "visibility": "manual" }`
- Teachers and principals must belong to the same school they are mutating.

### POST `/api/enrollment/student-groups/:groupId/members`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Body** `{ "studentIds": ["45", "46"], "addedBy": "7" }`
- Members are upserted—re-adding a student updates nothing but succeeds idempotently. School-scoped roles must belong to the group's school.

### GET `/api/enrollment/student-groups`
Roles: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`. Optional `schoolId`. Response includes each group with `members` array; teachers/principals are auto-scoped to their school.

## Attendance (`/api/attendance`)

Homeroom teachers (matching `classTeacherId`) or devices with `x-device-key` can manage attendance. Each classroom may have only one session per day.

### POST `/api/attendance/sessions`
- **Headers**: `Authorization: Bearer <token>` (homeroom teacher) *or* `x-device-key`
- **Body**
```json
{
	"schoolId": "1",
	"classroomId": "25",
	"sessionDate": "2025-06-10",
	"startsAt": "2025-06-10T09:00:00.000Z",
	"endsAt": "2025-06-10T10:00:00.000Z"
}
```
- **Response 201**: Created session.
- **Errors**: `409` if a session already exists for `[classroomId, sessionDate]`.

### POST `/api/attendance/sessions/:sessionId/records`
- **Body**
```json
{
  "entries": [
    { "studentId": "45", "status": "present" },
    { "studentId": "46", "status": "absent" }
  ]
}
```
- **Response 200**: `{ "message": "Attendance synced" }`.

### GET `/api/attendance/students/:studentId`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`, `STUDENT`
- **Query**: optional `from`, `to` ISO dates.
- **Response**: Array of attendance records, each with nested `attendanceSession` including `sessionDate`, `startsAt`, `endsAt`.

### GET `/api/attendance/students/summary`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`, `STUDENT`
- **Query**: either `studentId=<id>` or `phone=<E.164>`.
- **Response**
```json
{
	"studentId": "45",
	"today": { "total": 1, "present": 1, "absent": 0, "late": 0, "excused": 0, "attendanceRate": 1 },
	"thisWeek": { "total": 5, "present": 4, "absent": 1, "late": 0, "excused": 0, "attendanceRate": 0.8 },
	"overall": { "total": 120, "present": 110, "absent": 8, "late": 1, "excused": 1, "attendanceRate": 0.92 }
}
```

### GET `/api/attendance/classrooms/:classroomId/summary`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Query**: optional `date=YYYY-MM-DD` (normalized to midnight).
- **Response**
```json
{
	"sessions": [
		{
			"id": "90",
			"sessionDate": "2025-06-10",
			"studentAttendance": [
				{ "studentId": "45", "status": "present", "student": { "id": "45", "firstName": "Sanjay", "lastName": "Student", "code": "STU-0001" } }
			]
		}
	],
	"summary": { "total": 30, "totals": { "present": 25, "absent": 3, "late": 1, "excused": 1 } }
}
```

## Assessments (`/api/assessments`)

### POST `/api/assessments/exams`
Body
```json
{
	"subjectId": "3",
	"teacherId": "7",
	"classroomId": "25",
	"name": "Midterm",
	"totalMarks": 100,
	"examDate": "2025-07-01"
}
```
Teachers must match `teacherId`.

### POST `/api/assessments/exam-results`
Body
```json
{
	"examId": "15",
	"results": [
		{ "studentId": "45", "score": 88, "grade": "B+" },
		{ "studentId": "46", "score": 95, "grade": "A" }
	]
}
```
Response `{ "message": "Exam results synced" }`.

### GET `/api/assessments/students/:studentId/latest`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`, `STUDENT`
- **Response**: Returns up to 10 most recent `studentExamResult` rows with embedded `exam` info. Students can only view themselves; teachers/principals must share the student's school.

## Notifications (`/api/communications`)

### POST `/api/communications/notifications`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Body**
```json
{
	"schoolId": "1",
	"title": "PTA Meeting",
	"body": "Parents meet on Friday",
	"category": "general",
	"activeFrom": "2025-06-12T04:00:00.000Z",
	"activeTill": "2025-06-15T23:59:59.000Z",
	"priority": 3,
	"createdBy": "7",
	"targets": {
		"studentIds": ["45"],
		"studentGroupIds": ["3"],
		"teacherIds": [],
		"classroomIds": ["25"]
	}
}
```
At least one target bucket must contain IDs. Teachers/principals must belong to the same school. Response `{ "notification": {...}, "targets": 3 }` where `targets` equals the total number of rows inserted into `notification_targets`.

### GET `/api/communications/notifications/active`
Available to any authenticated role. Returns notifications whose `activeFrom <= now <= activeTill`, ordered by `activeTill`, each with a `targets` array.

## Timetables (`/api/timetables`)

### PUT `/api/timetables/classrooms/:classroomId`
- **Roles**: `ADMIN`, `PRINCIPAL`
- **Body**
```json
{
	"entries": [
		{
			"weekDay": 1,
			"period": 1,
			"startTime": "09:00",
			"endTime": "09:45",
			"teacherSubjectId": "42",
			"label": "Mathematics",
			"location": "Room 201"
		},
		{
			"weekDay": 1,
			"period": 2,
			"startTime": "09:50",
			"endTime": "10:30",
			"label": "Advisory"
		}
	]
}
```
- Replaces the entire weekly timetable for the classroom. `weekDay` is 1-7, `period` is the slot number, and optional times use `HH:MM` 24h format. Duplicate `(weekDay, period)` pairs are rejected.

### GET `/api/timetables/classrooms/:classroomId`
- **Roles**: `ADMIN`, `GOVERNMENT`, `PRINCIPAL`, `TEACHER`, `STUDENT`
- **Response**
```json
{
	"classroomId": "25",
	"schoolId": "1",
	"entries": [
		{
			"id": "10",
			"weekDay": 1,
			"period": 1,
			"label": "Mathematics",
			"startTime": "09:00",
			"endTime": "09:45",
			"teacherSubjectId": "42",
			"teacher": { "id": "7", "firstName": "Tina", "lastName": "Teacher" },
			"subject": { "id": "3", "code": "MATH8", "name": "Mathematics" }
		}
	]
}
```
- School-scoped roles can only read timetables for their own campus; students can only view their assigned classroom.

### GET `/api/timetables/students/:studentId`
- **Roles**: `ADMIN`, `GOVERNMENT`, `PRINCIPAL`, `TEACHER`, `STUDENT`
- **Description**: Convenience endpoint that resolves the student's classroom and returns the same payload as the classroom view. Students may only fetch their own timetable; teachers/principals are limited to their school.

## Error Reference

| Status | Meaning | Example |
| --- | --- | --- |
| 400 | Schema validation failed | `{ "message": "Validation failed", "errors": { ... } }` |
| 401 | Login failure | `{ "message": "Invalid credentials" }` |
| 403 | Caller lacks role/scope | `{ "message": "Forbidden" }` |
| 404 | Entity missing | `{ "message": "Student not found" }` |
| 409 | Duplicate attendance session | `{ "message": "Attendance already exists for this classroom on the selected date" }` |
| 500 | Unhandled error | `{ "message": "Something went wrong" }` |

Refer to the Zod schemas in `src/modules/**` for the authoritative field definitions used by each route.
