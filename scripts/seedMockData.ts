import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function upsertUser(params: {
  email: string;
  phoneNumber?: string;
  role: "ADMIN" | "TEACHER" | "STUDENT" | "GOVERNMENT" | "PRINCIPAL";
  password: string;
  schoolId?: bigint;
  studentId?: bigint;
  teacherId?: bigint;
}) {
  const { password, ...rest } = params;
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findUnique({ where: { email: rest.email } });
  if (existing) {
    return existing;
  }
  return prisma.user.create({
    data: {
      ...rest,
      passwordHash,
      status: "active"
    }
  });
}

export async function seedMockData() {
  await prisma.notificationTarget.deleteMany();
  await prisma.notificationRead.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.studentAttendance.deleteMany();
  await prisma.attendanceSession.deleteMany();
  await prisma.classroomTimetable.deleteMany();

  const schoolName = "Mock Public School";
  let school = await prisma.school.findFirst({ where: { name: schoolName } });
  if (!school) {
    school = await prisma.school.create({
      data: { name: schoolName, district: "Mock District" }
    });
  }

  let grade = await prisma.grade.findFirst({ where: { schoolId: school.id, name: "Grade 8" } });
  if (!grade) {
    grade = await prisma.grade.create({
      data: { schoolId: school.id, name: "Grade 8", level: 8 }
    });
  }

  let section = await prisma.section.findFirst({ where: { gradeId: grade.id, label: "A" } });
  if (!section) {
    section = await prisma.section.create({ data: { gradeId: grade.id, label: "A" } });
  }

  let classroom = await prisma.classroom.findFirst({
    where: { gradeId: grade.id, sectionId: section.id, academicYear: "2025-2026" }
  });
  if (!classroom) {
    classroom = await prisma.classroom.create({
      data: {
        schoolId: school.id,
        gradeId: grade.id,
        sectionId: section.id,
        academicYear: "2025-2026"
      }
    });
  }

  let teacher = await prisma.teacher.findFirst({ where: { email: "teacher.mock@school.test" } });
  if (!teacher) {
    teacher = await prisma.teacher.create({
      data: {
        schoolId: school.id,
        firstName: "Tina",
        lastName: "Teacher",
        email: "teacher.mock@school.test"
      }
    });
  }

  let subject = await prisma.subject.findFirst({ where: { schoolId: school.id, code: "MATH8" } });
  if (!subject) {
    subject = await prisma.subject.create({
      data: {
        schoolId: school.id,
        code: "MATH8",
        name: "Mathematics Grade 8"
      }
    });
  }

  let teacherSubject = await prisma.teacherSubject.findFirst({
    where: {
      teacherId: teacher.id,
      subjectId: subject.id,
      classroomId: classroom.id ?? undefined,
      startDate: new Date("2025-06-01")
    }
  });
  if (!teacherSubject) {
    teacherSubject = await prisma.teacherSubject.create({
      data: {
        teacherId: teacher.id,
        subjectId: subject.id,
        classroomId: classroom.id,
        startDate: new Date("2025-06-01")
      }
    });
  }

  let student = await prisma.student.findFirst({ where: { schoolId: school.id, code: "STU-0001" } });
  if (!student) {
    student = await prisma.student.create({
      data: {
        schoolId: school.id,
        classroomId: classroom.id,
        code: "STU-0001",
        phoneNumber: "+15550001001",
        firstName: "Sanjay",
        lastName: "Student",
        gradeLevel: 8,
        sectionLabel: "A",
        enrolledAt: new Date("2025-06-03"),
        active: true,
        classTeacherId: teacher.id
      }
    });
  } else if (student.classTeacherId !== teacher.id) {
    student = await prisma.student.update({
      where: { id: student.id },
      data: { classTeacherId: teacher.id }
    });
  }

  const existingStudentSubject = await prisma.studentSubject.findFirst({
    where: { studentId: student.id, teacherSubjectId: teacherSubject.id }
  });
  if (!existingStudentSubject) {
    await prisma.studentSubject.create({
      data: {
        studentId: student.id,
        teacherSubjectId: teacherSubject.id,
        enrolledOn: new Date("2025-06-05")
      }
    });
  }

  const sessionDate = new Date("2025-06-10");
  sessionDate.setHours(0, 0, 0, 0);
  await prisma.studentAttendance.deleteMany({
    where: {
      attendanceSession: {
        classroomId: classroom.id,
        sessionDate
      },
      studentId: student.id
    }
  });

  await prisma.attendanceSession.deleteMany({
    where: {
      classroomId: classroom.id,
      sessionDate
    }
  });

  const session = await prisma.attendanceSession.create({
    data: {
      schoolId: school.id,
      classroomId: classroom.id,
      sessionDate,
      startsAt: new Date("2025-06-10T09:00:00Z"),
      endsAt: new Date("2025-06-10T10:00:00Z")
    }
  });

  await prisma.studentAttendance.create({
    data: {
      attendanceSessionId: session.id,
      studentId: student.id,
      status: "present"
    }
  });

  const adminUser = await upsertUser({
    email: "admin@mock.test",
    role: "ADMIN",
    password: "AdminPass123!",
    schoolId: school.id
  });

  const _teacherUser = await upsertUser({
    email: "teacher@mock.test",
    role: "TEACHER",
    password: "TeacherPass123!",
    schoolId: school.id,
    teacherId: teacher.id
  });

  const _studentUser = await upsertUser({
    email: "student@mock.test",
    role: "STUDENT",
    password: "StudentPass123!",
    schoolId: school.id,
    studentId: student.id
  });

  const _principalUser = await upsertUser({
    email: "principal@mock.test",
    role: "PRINCIPAL",
    password: "PrincipalPass123!",
    schoolId: school.id
  });

  console.log("Seed complete", {
    schoolId: school.id.toString(),
    classroomId: classroom.id.toString(),
    teacherId: teacher.id.toString(),
    studentId: student.id.toString(),
    adminUserId: adminUser.id.toString()
  });
}

if (require.main === module) {
  seedMockData()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
