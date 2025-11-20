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
- **Description**: Basic readiness probe.
- **Response 200**
```json
{ "status": "ok" }
```

## Authentication

### Mock Credentials
After running the seed script (`npx ts-node scripts/seedMockData.ts`), these accounts are available:

| Role | Email | Password |
|------|-------|----------|
| ADMIN | admin@mock.test | AdminPass123! |
| GOVERNMENT | government@mock.test | GovPass123! |
| PRINCIPAL | principal@mock.test | PrincipalPass123! |
| TEACHER | teacher@mock.test | TeacherPass123! |
| STUDENT | student@mock.test | StudentPass123! |

### POST `/api/auth/login`
- **Roles**: Public
- **Description**: Exchange credentials for a JWT used across protected routes.
- **Request**
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
- **Roles**: `ADMIN`, `PRINCIPAL`
- **Description**: Create an application user mapped to optional teacher/student records. Principals can only create STUDENT user accounts for students in their own school.
- **Request**
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
- **Response 201**
```json
{
	"id": "12",
	"email": "teacher@mock.test",
	"phoneNumber": "+15550001002",
	"role": "TEACHER",
	"status": "active",
	"studentId": null,
	"teacherId": "7",
	"schoolId": "1",
	"createdAt": "2025-11-16T06:57:00.000Z",
	"updatedAt": "2025-11-16T06:57:00.000Z"
}
```
- **Notes**: Principals must set `role: "STUDENT"` and can only create accounts for students in their school. When `studentId` is provided, the system verifies it belongs to the principal's school.

### GET `/api/auth/users`
- **Roles**: `ADMIN`, `GOVERNMENT`, `PRINCIPAL`
- **Description**: List platform users. Principals can only view users from their own school.
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
		"createdAt": "2025-11-16T06:57:00.000Z",
		"updatedAt": "2025-11-16T06:57:00.000Z"
	}
]
```

### PATCH `/api/auth/users/:id/status`
- **Roles**: `ADMIN`
- **Description**: Block/unblock a user account.
- **Request**
```json
{ "status": "blocked" }
```
- **Response 200**
```json
{
	"id": "12",
	"status": "blocked",
	"updatedAt": "2025-11-17T03:15:00.000Z"
}
```

## Core Entities (`/api/core`)

All routes require authorization. Teachers automatically scope to their `schoolId` and may only read individual students when they are the assigned homeroom (`classTeacherId`).

### POST `/api/core/schools`
- **Roles**: `ADMIN`, `GOVERNMENT`
- **Description**: Register a school campus.
- **Request**
```json
{ "name": "Central High", "district": "Pune" }
```
- **Response 201**
```json
{ "id": "1", "name": "Central High", "district": "Pune", "isActive": true, "createdAt": "2025-05-01T09:00:00.000Z" }
```

### GET `/api/core/schools`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Description**: List schools. Teacher/principal callers automatically receive only their campus.
- **Response 200**
```json
[

### POST `/api/core/grades`
- **Roles**: `ADMIN`, `GOVERNMENT`, `PRINCIPAL`
- **Description**: Create an academic grade level for a school. Principals can create grades in their own school.
- **Request**
```json
{ "schoolId": "1", "name": "Grade 8", "level": 8 }
```
- **Response 201**
```json
{ "id": "10", "schoolId": "1", "name": "Grade 8", "level": 8, "isActive": true }
```

### POST `/api/core/grades/bulk`
- **Roles**: `ADMIN`, `GOVERNMENT`, `PRINCIPAL`
- **Description**: Bulk create multiple grades at once (e.g., Grade 1 through 12 with one API call). The `nameFormat` uses `{level}` as a placeholder. Principals can only create grades in their own school.
- **Request**
```json
{
	"schoolId": "1",
	"startLevel": 1,
	"endLevel": 12,
	"nameFormat": "Grade {level}"
}
```
- **Response 201**
```json
{
	"message": "Created 12 grades",
	"count": 12,
	"range": { "startLevel": 1, "endLevel": 12 }
}
```
- **Notes**: Uses `skipDuplicates: true`, so existing grades at the same level won't cause errors.

### GET `/api/core/grades`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Description**: List grades. Optional `schoolId` query (auto-set for school-scoped users).
- **Response 200**
```json
[
	{ "id": "10", "schoolId": "1", "name": "Grade 8", "level": 8 }
]
```

### PATCH `/api/core/grades/:id`
- **Roles**: `ADMIN`, `GOVERNMENT`, `PRINCIPAL`
- **Description**: Update grade name or toggle active status. Principals can only edit grades in their own school.
- **Request**
```json
{ "name": "Grade 8 Advanced", "isActive": false }
```
- **Response 200**
```json
{ "id": "10", "schoolId": "1", "name": "Grade 8 Advanced", "level": 8, "isActive": false }
```
- **Notes**: All fields are optional.

### POST `/api/core/sections`
- **Roles**: `ADMIN`, `GOVERNMENT`, `PRINCIPAL`
- **Description**: Create a section (division) within a grade. Principals can create sections in grades from their own school.
- **Request**
```json
{ "gradeId": "10", "label": "A" }
```
- **Response 201**
```json
{ "id": "4", "gradeId": "10", "label": "A" }
```

### POST `/api/core/sections/bulk`
- **Roles**: `ADMIN`, `GOVERNMENT`, `PRINCIPAL`
- **Description**: Bulk create multiple sections at once for a grade (e.g., A through F with one API call). Principals can only create sections in grades from their own school.
- **Request**
```json
{
	"gradeId": "10",
	"labels": ["A", "B", "C", "D", "E", "F"]
}
```
- **Response 201**
```json
{
	"message": "Created 6 sections",
	"count": 6,
	"labels": ["A", "B", "C", "D", "E", "F"]
}
```
- **Notes**: Uses `skipDuplicates: true`, so existing sections with the same label won't cause errors. Maximum 26 sections per request. Labels must be unique within the request.

### GET `/api/core/sections`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Description**: List sections, optionally filtered by `gradeId`.
- **Response 200**
```json
[
	{ "id": "4", "gradeId": "10", "label": "A" }
]
```

### PATCH `/api/core/sections/:id`
- **Roles**: `ADMIN`, `GOVERNMENT`, `PRINCIPAL`
- **Description**: Update section label. Principals can only edit sections in their own school.
- **Request**
```json
{ "label": "B" }
```
- **Response 200**
```json
{ "id": "4", "gradeId": "10", "label": "B" }
```

### POST `/api/core/classrooms`
- **Roles**: `ADMIN`, `GOVERNMENT`, `PRINCIPAL`
- **Description**: Create a classroom record linking school, grade, and section. Principals can create classrooms in their own school.
- **Request**
```json
{ "schoolId": "1", "gradeId": "10", "sectionId": "4", "academicYear": "2025-2026" }
```
- **Response 201**
```json
{ "id": "25", "schoolId": "1", "gradeId": "10", "sectionId": "4", "academicYear": "2025-2026" }
```

### GET `/api/core/classrooms`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Description**: List classrooms. Optional `schoolId` query. Responses embed grade/section to aid UI rendering.
- **Response 200**
```json
[
	{
		"id": "25",
		"schoolId": "1",
		"grade": { "id": "10", "name": "Grade 8" },
		"section": { "id": "4", "label": "A" },
		"academicYear": "2025-2026"
	}
]
```

### PATCH `/api/core/classrooms/:id`
- **Roles**: `ADMIN`, `GOVERNMENT`, `PRINCIPAL`
- **Description**: Update classroom details. Principals can only edit classrooms in their own school.
- **Request**
```json
{ "academicYear": "2026-2027" }
```
- **Response 200**
```json
{ "id": "25", "schoolId": "1", "gradeId": "10", "sectionId": "4", "academicYear": "2026-2027" }
```

### POST `/api/core/teachers`
- **Roles**: `ADMIN`, `GOVERNMENT`, `PRINCIPAL`
- **Description**: Create a teacher profile. Principals can create teachers in their own school.
- **Request**
```json
{ "schoolId": "1", "firstName": "Tina", "lastName": "Teacher", "email": "teacher@school.test" }
```
- **Response 201**
```json
{ "id": "7", "schoolId": "1", "firstName": "Tina", "lastName": "Teacher", "email": "teacher@school.test" }
```

### GET `/api/core/teachers`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Description**: List teachers. Optional `schoolId`. School-scoped roles only see their campus.
- **Response 200**
```json
[
	{ "id": "7", "schoolId": "1", "firstName": "Tina", "lastName": "Teacher" }
]
```

### PATCH `/api/core/teachers/:id`
- **Roles**: `ADMIN`, `GOVERNMENT`, `PRINCIPAL`
- **Description**: Update teacher details. Principals can only edit teachers in their own school.
- **Request**
```json
{ "firstName": "Updated", "email": "newemail@school.test" }
```
- **Response 200**
```json
{ "id": "7", "schoolId": "1", "firstName": "Updated", "lastName": "Teacher", "email": "newemail@school.test" }
```

### POST `/api/core/subjects`
- **Roles**: `ADMIN`, `GOVERNMENT`, `PRINCIPAL`
- **Description**: Create a subject catalog entry. Principals can create subjects in their own school.
- **Request**
```json
{ "schoolId": "1", "code": "MATH8", "name": "Mathematics" }
```
- **Response 201**
```json
{ "id": "3", "schoolId": "1", "code": "MATH8", "name": "Mathematics" }
```

### GET `/api/core/subjects`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Description**: List subjects, optionally filtered by `schoolId`.
- **Response 200**
```json
[
	{ "id": "3", "code": "MATH8", "name": "Mathematics", "schoolId": "1" }
]
```

### PATCH `/api/core/subjects/:id`
- **Roles**: `ADMIN`, `GOVERNMENT`, `PRINCIPAL`
- **Description**: Update subject name or code. Principals can only edit subjects in their own school.
- **Request**
```json
{ "name": "Advanced Mathematics", "code": "MATH8A" }
```
- **Response 200**
```json
{ "id": "3", "code": "MATH8A", "name": "Advanced Mathematics", "schoolId": "1" }
```
- **Notes**: All fields are optional.

### POST `/api/core/students`
- **Roles**: `ADMIN`, `GOVERNMENT`, `PRINCIPAL`
- **Description**: Create a student profile and tie it to a classroom. `gradeLevel`, `sectionLabel`, and `enrolledAt` are automatically set from the classroom. Principals can create students in their own school.
- **Request**
```json
{
	"schoolId": "1",
	"classroomId": "25",
	"code": "STU-0001",
	"phoneNumber": "+15550001001",
	"firstName": "Sanjay",
	"lastName": "Student",
	"gender": "M",
	"dateOfBirth": "2010-05-15",
	"classTeacherId": "7"
}
```
- **Response 201**
```json
{ 
	"id": "45", 
	"schoolId": "1", 
	"classroomId": "25", 
	"code": "STU-0001", 
	"firstName": "Sanjay", 
	"lastName": "Student",
	"gender": "M",
	"dateOfBirth": "2010-05-15",
	"gradeLevel": 8,
	"sectionLabel": "A",
	"enrolledAt": "2025-11-19",
	"active": true
}
```
- **Notes**: `gender` ("M", "F", "O"), `dateOfBirth`, and `classTeacherId` are optional.

### GET `/api/core/students`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Description**: List students. Optional `classroomId` query. Teachers must be the class teacher; principals see the entire school.
- **Response 200**
```json
[
	{ "id": "45", "classroomId": "25", "firstName": "Sanjay", "lastName": "Student", "active": true }
]
```

### GET `/api/core/students/:id`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`, `STUDENT`
- **Description**: Fetch a student with related subjects and attendance summaries.
- **Response 200**
```json
{
	"id": "45",
	"firstName": "Sanjay",
	"lastName": "Student",
	"gender": "M",
	"dateOfBirth": "2010-05-15",
	"classroom": { "id": "25", "grade": { "name": "Grade 8" }, "section": { "label": "A" } },
	"subjects": [ { "id": "3", "code": "MATH8", "name": "Mathematics" } ],
	"attendances": [ { "sessionDate": "2025-06-10", "status": "present" } ]
}
```
- **Notes**: Teachers must be the student's homeroom teacher; students may only fetch their own record.

### PATCH `/api/core/students/:id`
- **Roles**: `ADMIN`, `GOVERNMENT`, `PRINCIPAL`
- **Description**: Update student details. When `classroomId` is changed, `gradeLevel` and `sectionLabel` are automatically updated. Principals can only edit students in their own school.
- **Request**
```json
{
	"classroomId": "26",
	"firstName": "Updated",
	"phoneNumber": "+15550001002",
	"gender": "F",
	"active": false
}
```
- **Response 200**
```json
{ 
	"id": "45", 
	"schoolId": "1", 
	"classroomId": "26", 
	"firstName": "Updated",
	"gradeLevel": 9,
	"sectionLabel": "B",
	"active": false
}
```
- **Notes**: All fields are optional. Setting `active: false` effectively disables the student.

## Enrollment (`/api/enrollment`)

### POST `/api/enrollment/teacher-subjects`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Description**: Assign a teacher to a subject-classroom pairing.
- **Request**
```json
{
	"teacherId": "7",
	"subjectId": "3",
	"classroomId": "25",
	"startDate": "2025-06-01",
	"endDate": null
}
```
- **Response 201**
```json
{ "id": "12", "teacherId": "7", "subjectId": "3", "classroomId": "25", "startDate": "2025-06-01", "endDate": null }
```
- **Errors**: `409` if the same teacher-subject-classroom assignment with the same start date already exists.
- **Notes**: Teachers can only manage their own assignments; principals must belong to the same school.

### GET `/api/enrollment/teacher-subjects`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Description**: Fetch teacher-subject assignments with teacher, subject, and classroom details. Teachers automatically see only their own assignments; principals see all assignments in their school.
- **Query Parameters**: Optional `teacherId`, `classroomId`, `subjectId` for filtering.
- **Response 200**
```json
[
	{
		"id": "12",
		"teacherId": "7",
		"subjectId": "3",
		"classroomId": "25",
		"startDate": "2025-06-01",
		"endDate": null,
		"teacher": { "firstName": "John", "lastName": "Doe" },
		"subject": { "code": "MATH101", "name": "Mathematics" },
		"classroom": { "grade": { "name": "Grade 8" }, "section": { "label": "A" } }
	}
]
```

### POST `/api/enrollment/student-subjects`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Description**: Link a student to a teacher-subject record.
- **Request**
```json
{ "studentId": "45", "teacherSubjectId": "12", "enrolledOn": "2025-06-05", "status": "active" }
```
- **Response 201**
```json
{ "id": "33", "studentId": "45", "teacherSubjectId": "12", "status": "active" }
```
- **Errors**: `409` if the student is already enrolled in this subject.

### GET `/api/enrollment/student-subjects`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Description**: Fetch student-subject enrollments with student, teacher, subject, and classroom details. Teachers see only their own assignments; principals see all enrollments in their school.
- **Query Parameters**: Optional `studentId`, `teacherSubjectId`, `classroomId` for filtering.
- **Response 200**
```json
[
	{
		"id": "33",
		"studentId": "45",
		"teacherSubjectId": "12",
		"status": "active",
		"enrolledOn": "2025-06-05",
		"student": { "firstName": "John", "lastName": "Doe", "code": "STU-001" },
		"teacherSubject": {
			"subject": { "name": "Mathematics", "code": "MATH8" },
			"teacher": { "firstName": "Jane", "lastName": "Smith" },
			"classroom": { "grade": { "name": "Grade 8" }, "section": { "label": "A" } }
		}
	}
]
```

### POST `/api/enrollment/student-groups`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Description**: Create a reusable student cohort (manual or dynamic visibility).
- **Request**
```json
{ "schoolId": "1", "name": "Remediation Batch", "description": "Math help", "visibility": "manual" }
```
- **Response 201**
```json
{ "id": "3", "schoolId": "1", "name": "Remediation Batch", "visibility": "manual" }
```

### POST `/api/enrollment/student-groups/:groupId/members`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Description**: Add or re-add members to a group. Operation is idempotent.
- **Request**
```json
{ "studentIds": ["45", "46"], "addedBy": "7" }
```
- **Response 200**
```json
{ "groupId": "3", "totalMembers": 2 }
```

### GET `/api/enrollment/student-groups`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Description**: List student groups (auto-scoped to caller's school unless admin/government).
- **Query**: optional `schoolId`
- **Response 200**
```json
[
	{ "id": "3", "schoolId": "1", "name": "Remediation Batch", "members": [ { "studentId": "45" } ] }
]
```

## Attendance (`/api/attendance`)

Homeroom teachers (matching `classTeacherId`) or devices with `x-device-key` can manage attendance. Each classroom may have only one session per day.

### POST `/api/attendance/sessions`
- **Headers**: `Authorization: Bearer <token>` (homeroom teacher) *or* `x-device-key`
- **Description**: Start a new attendance session for a classroom/date pair.
- **Request**
```json
{
	"schoolId": "1",
	"classroomId": "25",
	"sessionDate": "2025-06-10",
	"startsAt": "2025-06-10T09:00:00.000Z",
	"endsAt": "2025-06-10T10:00:00.000Z"
}
```
- **Response 201**
```json
{ "id": "90", "classroomId": "25", "sessionDate": "2025-06-10", "startsAt": "2025-06-10T09:00:00.000Z" }
```
- **Errors**: `409` if a session already exists for `[classroomId, sessionDate]`.

### POST `/api/attendance/sessions/:sessionId/records`
- **Roles**: Homeroom teachers, principals, admins, government, or device with `x-device-key`
- **Description**: Bulk upsert attendance entries for a session.
- **Request**
```json
{
	"entries": [
		{ "studentId": "45", "status": "present" },
		{ "studentId": "46", "status": "absent" }
	]
}
```
- **Response 200**
```json
{ "message": "Attendance synced", "updated": 2 }
```
- **Notes**: Teachers can only modify records within 24 hours of the `sessionDate`; after the window closes the API responds with `403`.

### GET `/api/attendance/students/:studentId`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`, `STUDENT`
- **Description**: Raw attendance records for a student within an optional date range.
- **Query**: optional `from`, `to` ISO dates.
- **Response 200**
```json
[
	{
		"sessionId": "90",
		"status": "present",
		"attendanceSession": {
			"sessionDate": "2025-06-10",
			"startsAt": "2025-06-10T09:00:00.000Z",
			"endsAt": "2025-06-10T10:00:00.000Z"
		}
	}
]
```

### GET `/api/attendance/students/summary`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`, `STUDENT`
- **Description**: Aggregate attendance stats for a student looked up by ID or phone.
- **Query**: `studentId=<id>` or `phone=<E.164>`
- **Response 200**
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
- **Description**: Daily classroom roll-up plus per-student statuses. Teachers can view classrooms they homeroom or teach via subject assignments; only homeroom teachers receive `canEdit=true` during the 24-hour edit window.
- **Query**: optional `date=YYYY-MM-DD` (normalized to midnight).
- **Response 200**
```json
{
	"sessions": [
		{
			"id": "90",
			"sessionDate": "2025-06-10",
			"editableUntil": "2025-06-11T00:00:00.000Z",
			"canEdit": true,
			"studentAttendance": [
				{
					"studentId": "45",
					"status": "present",
					"student": { "id": "45", "firstName": "Sanjay", "lastName": "Student", "code": "STU-0001" }
				}
			]
		}
	],
	"summary": { "total": 30, "totals": { "present": 25, "absent": 3, "late": 1, "excused": 1 } }
}
```

### GET `/api/attendance/classrooms/:classroomId/sessions`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Description**: Lightweight list of all attendance sessions for the classroom with edit-state metadata for UI calendars.
- **Response 200**
```json
{
	"classroomId": "25",
	"sessions": [
		{
			"id": "90",
			"sessionDate": "2025-06-10",
			"startsAt": "2025-06-10T09:00:00.000Z",
			"endsAt": "2025-06-10T10:00:00.000Z",
			"totalRecords": 30,
			"editableUntil": "2025-06-11T00:00:00.000Z",
			"canEdit": true
		}
	]
}
```

### GET `/api/attendance/sessions/:sessionId`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Description**: Retrieve a single attendance register (students + statuses) for a given session date. Response echoes `canEdit` so the UI can toggle edit mode based on the 24-hour rule.
- **Response 200**
```json
{
	"id": "90",
	"classroomId": "25",
	"sessionDate": "2025-06-10",
	"startsAt": "2025-06-10T09:00:00.000Z",
	"endsAt": "2025-06-10T10:00:00.000Z",
	"classroom": {
		"id": "25",
		"grade": { "id": "10", "name": "Grade 8", "level": 8 },
		"section": { "id": "4", "label": "A" }
	},
	"studentAttendance": [
		{
			"studentId": "45",
			"status": "present",
			"student": { "id": "45", "firstName": "Sanjay", "lastName": "Student", "code": "STU-0001" }
		}
	],
	"editableUntil": "2025-06-11T00:00:00.000Z",
	"canEdit": false
}
```

## Reports (`/api/reports`)

### GET `/api/reports/attendance/principal`
- **Roles**: `PRINCIPAL`, `GOVERNMENT`, `ADMIN`
- **Description**: Generates an attendance summary for every classroom in the principal’s school between the supplied `start` and `end` dates (ISO strings). Useful for exporting figures to the government portal.
- **Query**: `start=YYYY-MM-DD`, `end=YYYY-MM-DD`
- **Response 200**
```json
{
	"schoolId": "1",
	"range": { "start": "2025-06-01T00:00:00.000Z", "end": "2025-06-30T23:59:59.999Z" },
	"totals": {
		"sessions": 45,
		"totalRecords": 1350,
		"present": 1230,
		"absent": 90,
		"late": 20,
		"excused": 10,
		"attendanceRate": 0.91
	},
	"classrooms": [
		{
			"classroomId": "25",
			"grade": { "id": "10", "name": "Grade 8", "level": 8 },
			"section": { "id": "4", "label": "A" },
			"totalSessions": 15,
			"totalRecords": 450,
			"present": 420,
			"absent": 20,
			"late": 5,
			"excused": 5,
			"attendanceRate": 0.93
		}
	],
	"topClassrooms": [ { "classroomId": "25", "attendanceRate": 0.93, "totalRecords": 450 } ],
	"bottomClassrooms": [ { "classroomId": "29", "attendanceRate": 0.82, "totalRecords": 420 } ],
	"generatedAt": "2025-06-30T12:05:00.000Z"
}
```

### GET `/api/reports/attendance/principal/pdf`
- **Roles**: `PRINCIPAL`, `GOVERNMENT`, `ADMIN`
- **Description**: Same payload as the JSON endpoint but streamed as a PDF (content type `application/pdf`). Frontends should pass the same `start`/`end` query parameters.

### GET `/api/reports/attendance/teacher`
- **Roles**: `TEACHER`
- **Description**: Returns rich attendance analytics for the authenticated teacher’s classrooms, including per-classroom roles (homeroom vs subject support) and daily trend points for plotting charts. Optional `classroomId` query restricts output to a single class.
- **Query**: `start=YYYY-MM-DD`, `end=YYYY-MM-DD`, optional `classroomId=<id>`
- **Response 200**
```json
{
	"teacherId": "7",
	"schoolId": "1",
	"range": { "start": "2025-06-01T00:00:00.000Z", "end": "2025-06-30T23:59:59.999Z" },
	"classrooms": [
		{
			"classroomId": "25",
			"grade": { "id": "10", "name": "Grade 8", "level": 8 },
			"section": { "id": "4", "label": "A" },
			"roles": {
				"homeroom": true,
				"subjects": [ { "subjectId": "3", "subjectCode": "MATH8", "subjectName": "Mathematics" } ]
			},
			"totalSessions": 12,
			"totalRecords": 360,
			"present": 332,
			"absent": 20,
			"late": 6,
			"excused": 2,
			"attendanceRate": 0.92,
			"trend": [
				{
					"date": "2025-06-05T00:00:00.000Z",
					"present": 28,
					"absent": 2,
					"late": 0,
					"excused": 0,
					"attendanceRate": 0.93
				}
			]
		}
	],
	"generatedAt": "2025-06-30T12:05:00.000Z"
}
```

### GET `/api/reports/attendance/teacher/pdf`
- **Roles**: `TEACHER`
- **Description**: Streams the teacher report as a PDF, mirroring the JSON query parameters and scoping rules. Ideal for downloading/shareable documents that include summary lines for each classroom.

## Complaints (`/api/complaints`)

Supported categories (enum `ComplaintCategory`): `lack_of_proper_drinking_water`, `toilets`, `girls_toilets`, `liberty`, `proper_electricity`, `computers`. Complaint statuses flow through `open → in_progress → resolved|dismissed`.

### POST `/api/complaints`
- **Roles**: `STUDENT`
- **Description**: Students submit a complaint. By default their profile (name/classroom) is attached, but sending `isAnonymous=true` hides it from principals.
- **Body**
```json
{
	"category": "computers",
	"description": "Only 3 of the lab machines power on. We need working systems before the practical exams.",
	"isAnonymous": false
}
```
- **Response 201** (student always sees their own details)
```json
{
	"id": "42",
	"category": "computers",
	"description": "Only 3 of the lab machines power on...",
	"status": "open",
	"isAnonymous": false,
	"classroomId": "25",
	"student": { "id": "300", "firstName": "Rekha", "lastName": "Yadav", "code": "STU-300" },
	"classroom": {
		"id": "25",
		"grade": { "id": "10", "name": "Grade 8", "level": 8 },
		"section": { "id": "4", "label": "A" }
	},
	"resolutionNote": null,
	"resolvedBy": null,
	"createdAt": "2025-11-16T09:12:00.000Z"
}
```

### GET `/api/complaints/mine`
- **Roles**: `STUDENT`
- **Description**: Lists the logged-in student's complaints. Optional `status` query narrows results to a single state.
- **Response 200**
```json
{
	"total": 2,
	"items": [
		{
			"id": "42",
			"category": "computers",
			"status": "in_progress",
			"description": "Only 3 of the lab machines power on...",
			"student": { "id": "300", "firstName": "Rekha", "lastName": "Yadav", "code": "STU-300" },
			"classroom": { "id": "25", "grade": { "name": "Grade 8" }, "section": { "label": "A" } },
			"resolvedBy": { "id": "9", "role": "PRINCIPAL", "email": "principal@school.in" },
			"resolutionNote": "Vendor visit scheduled",
			"resolvedAt": "2025-11-19T10:00:00.000Z"
		}
	]
}
```

### GET `/api/complaints`
- **Roles**: `PRINCIPAL`, `ADMIN`
- **Description**: Principals automatically scope to their school. Admins must provide `schoolId`. Filters include `status`, `category`, `anonymous` (`true|false|1|0`), and `studentId`.
- **Response 200**
```json
{
	"schoolId": "1",
	"total": 3,
	"items": [
		{
			"id": "42",
			"category": "computers",
			"status": "in_progress",
			"isAnonymous": false,
			"student": { "id": "300", "firstName": "Rekha", "lastName": "Yadav", "code": "STU-300" },
			"classroom": { "id": "25", "grade": { "name": "Grade 8" }, "section": { "label": "A" } },
			"resolutionNote": "Vendor visit scheduled",
			"resolvedBy": { "id": "9", "role": "PRINCIPAL", "email": "principal@school.in" }
		},
		{
			"id": "45",
			"category": "girls_toilets",
			"status": "open",
			"isAnonymous": true,
			"student": null,
			"classroom": { "id": "18", "grade": { "name": "Grade 6" }, "section": { "label": "B" } },
			"resolutionNote": null,
			"resolvedBy": null
		}
	]
}
```

### PATCH `/api/complaints/:complaintId`
- **Roles**: `PRINCIPAL`, `ADMIN`
- **Description**: Update the complaint `status` and/or leave a `resolutionNote`. Moving to `resolved` or `dismissed` automatically stamps the acting user and timestamp; moving back to `open/in_progress` clears those fields.
- **Body**
```json
{
	"status": "resolved",
	"resolutionNote": "New RO filter installed in Block B"
}
```
- **Response 200**: Returns the updated complaint payload (student info hidden when `isAnonymous=true`).

## Assessments (`/api/assessments`)

### POST `/api/assessments/exams`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Description**: Create an assessment definition tied to a classroom and teacher.
- **Request**
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
- **Response 201**
```json
{ "id": "15", "subjectId": "3", "teacherId": "7", "classroomId": "25", "examDate": "2025-07-01" }
```
- **Notes**: Teachers must match `teacherId`; principals must share the school.

### POST `/api/assessments/exam-results`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Description**: Bulk upsert scores for an exam.
- **Request**
```json
{
	"examId": "15",
	"results": [
		{ "studentId": "45", "score": 88, "grade": "B+" },
		{ "studentId": "46", "score": 95, "grade": "A" }
	]
}
```
- **Response 200**
```json
{ "message": "Exam results synced", "updated": 2 }
```

### GET `/api/assessments/students/:studentId/latest`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`, `STUDENT`
- **Description**: Fetch the 10 most recent exam results for a student with embedded exam metadata.
- **Response 200**
```json
[
	{
		"exam": { "id": "15", "name": "Midterm", "totalMarks": 100, "examDate": "2025-07-01" },
		"score": 88,
		"grade": "B+"
	}
]
```
- **Notes**: Students may only fetch themselves; teachers/principals/government must share the school.

## Notifications (`/api/communications`)

### POST `/api/communications/notifications`
- **Roles**: `ADMIN`, `GOVERNMENT`, `TEACHER`, `PRINCIPAL`
- **Description**: Create a notification broadcast with explicit targets.
- **Request**
```json
{
	"schoolId": "1",
	"title": "PTA Meeting",
	"body": "Parents meet on Friday",
	"category": "general",
	"activeFrom": "2025-06-12T04:00:00.000Z",
	"activeTill": "2025-06-15T23:59:59.000Z",
	"priority": 3,
	"isPublic": false,
	"createdBy": "7",
	"targets": {
		"studentIds": ["45"],
		"studentGroupIds": ["3"],
		"teacherIds": [],
		"classroomIds": ["25"]
	}
}
```
- **Response 201**
```json
{
	"notification": {
		"id": "20",
		"schoolId": "1",
		"title": "PTA Meeting",
		"priority": 3,
		"activeFrom": "2025-06-12T04:00:00.000Z",
		"activeTill": "2025-06-15T23:59:59.000Z"
	},
	"targets": 3
}
```
- **Notes**: At least one target bucket must contain IDs unless `isPublic=true`, which publishes the message to the public feed. Teachers/principals must belong to the same school they target.

### GET `/api/communications/notifications/active`
- **Roles**: Any authenticated role
- **Description**: List notifications where `activeFrom <= now <= activeTill`.
- **Response 200**
```json
[
	{
		"id": "20",
		"title": "PTA Meeting",
		"body": "Parents meet on Friday",
		"category": "general",
		"priority": 3,
		"activeTill": "2025-06-15T23:59:59.000Z",
		"targets": [ { "type": "student", "studentId": "45" } ]
	}
]
```

### GET `/api/communications/notifications/public`
- **Roles**: Public
- **Description**: Fetch active campus-wide notices flagged as public (a digital notice board). Optional `schoolId` query scopes to one campus; otherwise returns every public notice.
- **Response 200**
```json
{
	"total": 2,
	"items": [
		{
			"id": "90",
			"schoolId": "1",
			"title": "Science Fair",
			"body": "Visitors welcome on Friday 4 PM.",
			"category": "general",
			"priority": 2,
			"isPublic": true,
			"activeFrom": "2025-11-18T02:00:00.000Z",
			"activeTill": "2025-11-21T23:59:59.000Z"
		}
	]
}
```

## Timetables (`/api/timetables`)

### PUT `/api/timetables/classrooms/:classroomId`
- **Roles**: `ADMIN`, `PRINCIPAL`
- **Description**: Replace the entire weekly timetable for a classroom. Duplicate `(weekDay, period)` pairs are rejected.
- **Request**
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
- **Response 200**
```json
{ "classroomId": "25", "totalEntries": 2 }
```

### GET `/api/timetables/classrooms/:classroomId`
- **Roles**: `ADMIN`, `GOVERNMENT`, `PRINCIPAL`, `TEACHER`, `STUDENT`
- **Description**: Fetch the timetable for a classroom with teacher/subject enrichments when linked via `teacherSubjectId`.
- **Response 200**
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
- **Notes**: Teachers must be the homeroom (`classTeacherId`); principals can view any classroom; students can view only their assigned classroom.

### GET `/api/timetables/students/:studentId`
- **Roles**: `ADMIN`, `GOVERNMENT`, `PRINCIPAL`, `TEACHER`, `STUDENT`
- **Description**: Convenience endpoint that resolves the student's classroom and returns the same payload as the classroom view.
- **Response 200**
```json
{
	"studentId": "45",
	"classroomId": "25",
	"entries": [
		{
			"id": "10",
			"weekDay": 1,
			"period": 1,
			"label": "Mathematics",
			"startTime": "09:00",
			"endTime": "09:45",
			"teacher": { "id": "7", "firstName": "Tina", "lastName": "Teacher" },
			"subject": { "id": "3", "code": "MATH8", "name": "Mathematics" }
		}
	]
}
```
- **Notes**: Students may only fetch their own timetable; teachers must be the student's homeroom teacher; principals can access any student.

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
