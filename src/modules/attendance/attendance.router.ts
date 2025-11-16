import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { validateBody } from "../../middleware/validateResource";
import { asyncHandler } from "../../utils/asyncHandler";
import { createAttendanceSessionSchema, recordAttendanceSchema } from "./attendance.schemas";
import { authorizeRoles } from "../../middleware/auth";

const toDate = (value?: string) => (value ? new Date(value) : undefined);
const normalizeDateOnly = (value: Date) => {
  const normalized = new Date(value);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};
const isClassTeacherForClassroom = async (teacherId: bigint, classroomId: bigint) => {
  const homeroomStudent = await prisma.student.findFirst({
    where: {
      classroomId,
      classTeacherId: teacherId
    },
    select: { id: true }
  });
  return Boolean(homeroomStudent);
};

const ensureTeacherOrDevice = (req: Request, res: Response) => {
  if (req.user?.role === "TEACHER" && req.user.teacher) {
    return "teacher" as const;
  }
  if (req.deviceAuth) {
    return "device" as const;
  }
  res.status(403).json({ message: "Only teachers or authorized devices can mark attendance" });
  return null;
};

export const attendanceRouter = Router();

attendanceRouter.post(
  "/sessions",
  validateBody(createAttendanceSessionSchema),
  asyncHandler(async (req, res) => {
    const actor = ensureTeacherOrDevice(req, res);
    if (!actor) {
      return;
    }
    const { sessionDate, startsAt, endsAt, ...rest } = req.body;
    if (actor === "teacher" && req.user?.teacher && req.user.teacherId) {
      if (req.user.teacher.schoolId !== rest.schoolId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const ownsClassroom = await isClassTeacherForClassroom(req.user.teacherId, rest.classroomId);
      if (!ownsClassroom) {
        return res.status(403).json({ message: "Teachers can only manage attendance for their homerooms" });
      }
    }

    const normalizedDate = normalizeDateOnly(sessionDate);
    const existingSession = await prisma.attendanceSession.findUnique({
      where: {
        classroomId_sessionDate: {
          classroomId: rest.classroomId,
          sessionDate: normalizedDate
        }
      }
    });

    if (existingSession) {
      return res.status(409).json({ message: "Attendance already exists for this classroom on the selected date" });
    }

    const session = await prisma.attendanceSession.create({
      data: {
        ...rest,
        sessionDate: normalizedDate,
        startsAt: toDate(startsAt),
        endsAt: toDate(endsAt)
      }
    });
    res.status(201).json(session);
  })
);

attendanceRouter.post(
  "/sessions/:sessionId/records",
  validateBody(recordAttendanceSchema),
  asyncHandler(async (req, res) => {
    const actor = ensureTeacherOrDevice(req, res);
    if (!actor) {
      return;
    }
    const attendanceSessionId = BigInt(req.params.sessionId);
    const session = await prisma.attendanceSession.findUnique({
      where: { id: attendanceSessionId },
      select: { schoolId: true, classroomId: true }
    });

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    if (actor === "teacher" && req.user?.teacher && req.user.teacherId) {
      if (req.user.teacher.schoolId !== session.schoolId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const ownsClassroom = await isClassTeacherForClassroom(req.user.teacherId, session.classroomId);
      if (!ownsClassroom) {
        return res.status(403).json({ message: "Teachers can only manage attendance for their homerooms" });
      }
    }
    const payload = recordAttendanceSchema.parse(req.body);

    await prisma.$transaction(async (tx) => {
      for (const entry of payload.entries) {
        await tx.studentAttendance.upsert({
          where: {
            attendanceSessionId_studentId: {
              attendanceSessionId,
              studentId: entry.studentId
            }
          },
          create: {
            attendanceSessionId,
            studentId: entry.studentId,
            status: entry.status
          },
          update: {
            status: entry.status
          }
        });
      }
    });

    res.json({ message: "Attendance synced" });
  })
);

attendanceRouter.get(
  "/students/summary",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER", "PRINCIPAL", "STUDENT"),
  asyncHandler(async (req, res) => {
    const studentIdParam = req.query.studentId as string | undefined;
    const phone = req.query.phone as string | undefined;

    if (!studentIdParam && !phone) {
      return res.status(400).json({ message: "Provide studentId or phone query param" });
    }

    const student = await prisma.student.findFirst({
      where: studentIdParam
        ? { id: BigInt(studentIdParam) }
        : { phoneNumber: phone },
      select: { id: true, schoolId: true }
    });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    if (req.user?.role === "STUDENT" && req.user.studentId !== student.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (req.user?.role === "TEACHER" && req.user.teacher && req.user.teacher.schoolId !== student.schoolId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (req.user?.role === "PRINCIPAL" && req.user.schoolId !== student.schoolId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const startOfWeek = new Date(startOfToday);
    const day = startOfWeek.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday as first day
    startOfWeek.setDate(startOfWeek.getDate() - diff);

    const buildWhere = (dateFilter?: { equals?: Date; gte?: Date; lte?: Date }) => ({
      studentId: student.id,
      ...(dateFilter
        ? {
            attendanceSession: {
              sessionDate: dateFilter
            }
          }
        : {})
    });

    const summarize = async (dateFilter?: { equals?: Date; gte?: Date; lte?: Date }) => {
      const grouped = await prisma.studentAttendance.groupBy({
        by: ["status"],
        _count: { _all: true },
        where: buildWhere(dateFilter)
      });
      const total = grouped.reduce((sum, row) => sum + row._count._all, 0);
      const present = grouped.find((row) => row.status === "present")?._count._all ?? 0;
      const absent = grouped.find((row) => row.status === "absent")?._count._all ?? 0;
      const late = grouped.find((row) => row.status === "late")?._count._all ?? 0;
      const excused = grouped.find((row) => row.status === "excused")?._count._all ?? 0;
      return {
        total,
        present,
        absent,
        late,
        excused,
        attendanceRate: total ? Number((present / total).toFixed(2)) : 0
      };
    };

    const today = await summarize({ equals: startOfToday });
    const thisWeek = await summarize({ gte: startOfWeek, lte: endOfToday });
    const overall = await summarize();

    res.json({ studentId: student.id, today, thisWeek, overall });
  })
);

attendanceRouter.get(
  "/students/:studentId",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER", "PRINCIPAL", "STUDENT"),
  asyncHandler(async (req, res) => {
    const studentId = BigInt(req.params.studentId);
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;

    if (req.user?.role === "STUDENT" && req.user.studentId !== studentId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (req.user?.role === "TEACHER" && req.user.teacher) {
      const student = await prisma.student.findUnique({ where: { id: studentId } });
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }
      if (req.user.teacher.schoolId !== student.schoolId) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }

    if (req.user?.role === "PRINCIPAL" && req.user.schoolId) {
      const student = await prisma.student.findUnique({ where: { id: studentId }, select: { schoolId: true } });
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }
      if (student.schoolId !== req.user.schoolId) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }

    const attendances = await prisma.studentAttendance.findMany({
      where: {
        studentId,
        attendanceSession: {
          sessionDate: {
            gte: from,
            lte: to
          }
        }
      },
      include: {
        attendanceSession: true
      },
      orderBy: [{ attendanceSession: { sessionDate: "desc" } }]
    });

    res.json(attendances);
  })
);

attendanceRouter.get(
  "/classrooms/:classroomId/summary",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER", "PRINCIPAL"),
  asyncHandler(async (req, res) => {
    const classroomId = BigInt(req.params.classroomId);
    const date = req.query.date ? new Date(String(req.query.date)) : undefined;

    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      select: { schoolId: true }
    });
    if (!classroom) {
      return res.status(404).json({ message: "Classroom not found" });
    }

    if (req.user?.role === "TEACHER" && req.user.teacher) {
      if (classroom.schoolId !== req.user.teacher.schoolId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (req.user.teacherId) {
        const ownsClassroom = await isClassTeacherForClassroom(req.user.teacherId, classroomId);
        if (!ownsClassroom) {
          return res.status(403).json({ message: "Teachers can only view attendance for their homerooms" });
        }
      }
    }

    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId || req.user.schoolId !== classroom.schoolId) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }

    const sessions = await prisma.attendanceSession.findMany({
      where: {
        classroomId,
        ...(date ? { sessionDate: normalizeDateOnly(date) } : {})
      },
      include: {
        studentAttendance: {
          include: { student: { select: { id: true, firstName: true, lastName: true, code: true } } }
        }
      },
      orderBy: { sessionDate: "desc" }
    });

    const summary = sessions.reduce(
      (acc, session) => {
        for (const record of session.studentAttendance) {
          acc.totals[record.status] = (acc.totals[record.status] ?? 0) + 1;
          acc.total += 1;
        }
        return acc;
      },
      { total: 0, totals: { present: 0, absent: 0, late: 0, excused: 0 } as Record<string, number> }
    );

    res.json({ sessions, summary });
  })
);
