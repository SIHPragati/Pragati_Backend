import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";
import { seedMockData } from "./seedMockData";
import type {} from "../src/types/express"; // ensure Express request augmentation is available for TS

async function runMockSmokeTest() {
  await seedMockData();

  const app = createApp();

  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: "admin@mock.test", password: "AdminPass123!" });

  if (loginRes.status !== 200) {
    console.error("Login failed", loginRes.status, loginRes.body);
    throw new Error("Login request failed");
  }

  const token = loginRes.body.token as string;
  if (!token) {
    throw new Error("Login response missing token");
  }

  const schoolsRes = await request(app)
    .get("/api/core/schools")
    .set("Authorization", `Bearer ${token}`);

  if (schoolsRes.status !== 200) {
    console.error("Schools request failed", schoolsRes.status, schoolsRes.body);
    throw new Error("Schools request failed");
  }

  const student = await prisma.student.findFirst({ select: { id: true }, where: { code: "STU-0001" } });
  if (!student) {
    throw new Error("Seed student not found");
  }

  const attendanceSummaryRes = await request(app)
    .get("/api/attendance/students/summary")
    .query({ studentId: student.id.toString() })
    .set("Authorization", `Bearer ${token}`);

  if (attendanceSummaryRes.status !== 200) {
    console.error(
      "Attendance summary failed",
      attendanceSummaryRes.status,
      attendanceSummaryRes.body
    );
    throw new Error("Attendance summary failed");
  }

  const notificationRes = await request(app)
    .get("/api/communications/notifications/active")
    .set("Authorization", `Bearer ${token}`);

  if (notificationRes.status !== 200) {
    console.error("Notification query failed", notificationRes.status, notificationRes.body);
    throw new Error("Notification query failed");
  }

  console.log("Mock smoke test complete", {
    login: { userId: loginRes.body.userId, role: loginRes.body.role },
    schoolsCount: schoolsRes.body.length,
    attendanceSummary: attendanceSummaryRes.body,
    activeNotifications: notificationRes.body.length
  });
}

runMockSmokeTest()
  .catch((error) => {
    console.error("Mock smoke test failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
