import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { seedMockData } from "./seedMockData";

const adminCredentials = { email: "admin@mock.test", password: "AdminPass123!" };
const teacherCredentials = { email: "teacher@mock.test", password: "TeacherPass123!" };
const principalCredentials = { email: "principal@mock.test", password: "PrincipalPass123!" };

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

const expectStatus = (res: request.Response, status: number, context: string) => {
  if (res.status !== status) {
    console.error(`[SMOKE][FAIL] ${context}`, res.status, res.body);
    throw new Error(`${context} failed with status ${res.status}`);
  }
};

async function login(app: ReturnType<typeof createApp>, credentials: typeof adminCredentials) {
  const res = await request(app).post("/api/auth/login").send(credentials);
  expectStatus(res, 200, `login ${credentials.email}`);
  if (!res.body.token) {
    throw new Error(`Login response for ${credentials.email} missing token`);
  }
  return res.body as {
    token: string;
    userId: string;
    role: string;
    studentId: string | null;
    teacherId: string | null;
    schoolId: string | null;
  };
}

async function runFullSmokeTest() {
  console.log("[SMOKE] Resetting data via seed script...");
  await seedMockData();

  const app = createApp();
  const admin = await login(app, adminCredentials);
  const teacher = await login(app, teacherCredentials);
  const principal = await login(app, principalCredentials);

  const uniqueSuffix = Date.now();

  const schoolsRes = await request(app).get("/api/core/schools").set(authHeader(admin.token));
  expectStatus(schoolsRes, 200, "list schools");
  const school = schoolsRes.body[0];
  if (!school) {
    throw new Error("No schools returned");
  }
  const schoolId = String(school.id);

  const classroomsRes = await request(app).get("/api/core/classrooms").set(authHeader(admin.token));
  expectStatus(classroomsRes, 200, "list classrooms");
  const classroom = classroomsRes.body[0];
  if (!classroom) {
    throw new Error("No classrooms returned");
  }
  const classroomId = String(classroom.id);

  const teachersRes = await request(app).get("/api/core/teachers").set(authHeader(admin.token));
  expectStatus(teachersRes, 200, "list teachers");
  const teachers = teachersRes.body as Array<{ id: string | number; email?: string }>;
  const teacherRecord = teachers.find((t) => t.email === teacherCredentials.email) ?? teachers[0];
  if (!teacherRecord) {
    throw new Error("No teachers returned");
  }
  const teacherId = String(teacherRecord.id);

  console.log("[SMOKE] Creating subject...");
  const subjectRes = await request(app)
    .post("/api/core/subjects")
    .set(authHeader(admin.token))
    .send({
      schoolId,
      code: `SCI-${uniqueSuffix}`,
      name: "Science Smoke"
    });
  expectStatus(subjectRes, 201, "create subject");
  const subjectId = String(subjectRes.body.id);

  console.log("[SMOKE] Assigning teacher to subject...");
  const teacherSubjectRes = await request(app)
    .post("/api/enrollment/teacher-subjects")
    .set(authHeader(admin.token))
    .send({
      teacherId,
      subjectId,
      classroomId,
      startDate: new Date().toISOString()
    });
  expectStatus(teacherSubjectRes, 201, "create teacher-subject");
  const teacherSubjectId = String(teacherSubjectRes.body.id);

  console.log("[SMOKE] Creating student...");
  const studentRes = await request(app)
    .post("/api/core/students")
    .set(authHeader(admin.token))
    .send({
      schoolId,
      classroomId,
      classTeacherId: teacherId,
      code: `STU-${uniqueSuffix}`,
      phoneNumber: `+1555${uniqueSuffix.toString().slice(-7)}`,
      firstName: "Smoke",
      lastName: "Student",
      gradeLevel: 8,
      sectionLabel: "A",
      enrolledAt: new Date().toISOString()
    });
  expectStatus(studentRes, 201, "create student");
  const studentId = String(studentRes.body.id);

  console.log("[SMOKE] Enrolling student to subject...");
  const studentSubjectRes = await request(app)
    .post("/api/enrollment/student-subjects")
    .set(authHeader(admin.token))
    .send({
      studentId,
      teacherSubjectId,
      enrolledOn: new Date().toISOString(),
      status: "active"
    });
  expectStatus(studentSubjectRes, 201, "create student-subject");

  console.log("[SMOKE] Creating student group...");
  const groupRes = await request(app)
    .post("/api/enrollment/student-groups")
    .set(authHeader(admin.token))
    .send({
      schoolId,
      name: `Smoke Group ${uniqueSuffix}`,
      description: "Automated smoke test group",
      visibility: "manual"
    });
  expectStatus(groupRes, 201, "create student group");
  const groupId = String(groupRes.body.id);

  console.log("[SMOKE] Adding student to group...");
  const addMemberRes = await request(app)
    .post(`/api/enrollment/student-groups/${groupId}/members`)
    .set(authHeader(admin.token))
    .send({
      studentIds: [studentId],
      addedBy: teacherId
    });
  expectStatus(addMemberRes, 200, "add group member");

  const sessionDate = new Date();
  sessionDate.setDate(sessionDate.getDate() + 1);
  sessionDate.setUTCHours(0, 0, 0, 0);
  const sessionDateIso = sessionDate.toISOString();
  const sessionDateParam = sessionDateIso.split("T")[0];

  console.log("[SMOKE] Creating attendance session...");
  const sessionRes = await request(app)
    .post("/api/attendance/sessions")
    .set(authHeader(teacher.token))
    .send({
      schoolId,
      classroomId,
      sessionDate: sessionDateIso,
      startsAt: new Date(sessionDate.getTime() + 9 * 3600000).toISOString(),
      endsAt: new Date(sessionDate.getTime() + 10 * 3600000).toISOString()
    });
  expectStatus(sessionRes, 201, "create attendance session");
  const sessionId = String(sessionRes.body.id);

  console.log("[SMOKE] Recording attendance...");
  const attendanceRes = await request(app)
    .post(`/api/attendance/sessions/${sessionId}/records`)
    .set(authHeader(teacher.token))
    .send({
      entries: [{ studentId, status: "present" }]
    });
  expectStatus(attendanceRes, 200, "record attendance");

  console.log("[SMOKE] Fetching attendance summaries...");
  const attendanceSummaryRes = await request(app)
    .get("/api/attendance/students/summary")
    .query({ studentId })
    .set(authHeader(admin.token));
  expectStatus(attendanceSummaryRes, 200, "student attendance summary");

  const classroomSummaryRes = await request(app)
    .get(`/api/attendance/classrooms/${classroomId}/summary`)
    .query({ date: sessionDateParam })
    .set(authHeader(teacher.token));
  expectStatus(classroomSummaryRes, 200, "classroom attendance summary");

  const attendanceDetailRes = await request(app)
    .get(`/api/attendance/students/${studentId}`)
    .set(authHeader(admin.token));
  expectStatus(attendanceDetailRes, 200, "student attendance detail");

  console.log("[SMOKE] Creating exam...");
  const examRes = await request(app)
    .post("/api/assessments/exams")
    .set(authHeader(teacher.token))
    .send({
      subjectId,
      teacherId,
      classroomId,
      name: `Smoke Exam ${uniqueSuffix}`,
      totalMarks: 100,
      examDate: sessionDateIso
    });
  expectStatus(examRes, 201, "create exam");
  const examId = String(examRes.body.id);

  console.log("[SMOKE] Recording exam results...");
  const examResultsRes = await request(app)
    .post("/api/assessments/exam-results")
    .set(authHeader(teacher.token))
    .send({
      examId,
      results: [{ studentId, score: 94, grade: "A" }]
    });
  expectStatus(examResultsRes, 200, "record exam results");

  const latestResultsRes = await request(app)
    .get(`/api/assessments/students/${studentId}/latest`)
    .set(authHeader(admin.token));
  expectStatus(latestResultsRes, 200, "fetch latest exam results");

  console.log("[SMOKE] Creating notification...");
  const notificationRes = await request(app)
    .post("/api/communications/notifications")
    .set(authHeader(admin.token))
    .send({
      schoolId,
      title: "Smoke Alert",
      body: "Automated notification",
      category: "general",
      activeFrom: new Date().toISOString(),
      activeTill: new Date(Date.now() + 2 * 24 * 3600000).toISOString(),
      priority: 3,
      createdBy: teacherId,
      targets: {
        studentIds: [studentId],
        studentGroupIds: [groupId],
        teacherIds: [teacherId],
        classroomIds: [classroomId]
      }
    });
  expectStatus(notificationRes, 201, "create notification");

  const activeNotificationsRes = await request(app)
    .get("/api/communications/notifications/active")
    .set(authHeader(admin.token));
  expectStatus(activeNotificationsRes, 200, "list active notifications");

  console.log("[SMOKE] Upserting classroom timetable as principal...");
  const timetableUpsertRes = await request(app)
    .put(`/api/timetables/classrooms/${classroomId}`)
    .set(authHeader(principal.token))
    .send({
      entries: [
        {
          weekDay: 1,
          period: 1,
          startTime: "09:00",
          endTime: "09:45",
          teacherSubjectId,
          label: "Mathematics"
        },
        {
          weekDay: 1,
          period: 2,
          startTime: "09:50",
          endTime: "10:30",
          label: "Advisory"
        }
      ]
    });
  expectStatus(timetableUpsertRes, 200, "upsert classroom timetable");

  const classroomTimetableRes = await request(app)
    .get(`/api/timetables/classrooms/${classroomId}`)
    .set(authHeader(admin.token));
  expectStatus(classroomTimetableRes, 200, "get classroom timetable");

  const studentTimetableRes = await request(app)
    .get(`/api/timetables/students/${studentId}`)
    .set(authHeader(admin.token));
  expectStatus(studentTimetableRes, 200, "get student timetable");

  console.log("[SMOKE] Fetching student detail to ensure associations");
  const studentDetailRes = await request(app)
    .get(`/api/core/students/${studentId}`)
    .set(authHeader(admin.token));
  expectStatus(studentDetailRes, 200, "student detail");

  console.log("[SMOKE] Endpoint smoke suite completed successfully", {
    schoolId,
    classroomId,
    teacherId,
    subjectId,
    studentId,
    groupId,
    sessionId,
    examId
  });
}

runFullSmokeTest()
  .catch((error) => {
    console.error("[SMOKE] Full smoke suite failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
