import { Router, Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { validateBody } from "../../middleware/validateResource";
import { asyncHandler } from "../../utils/asyncHandler";
import { createAttendanceSessionSchema, recordAttendanceSchema } from "./attendance.schemas";
import { authorizeRoles } from "../../middleware/auth";
import { isHomeroomTeacherForClassroom, resolveTeacherClassroomAssociation } from "../../utils/classroomAccess";

const toDate = (value?: string) => (value ? new Date(value) : undefined);
const normalizeDateOnly = (value: Date) => {
  const normalized = new Date(value);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const EDIT_WINDOW_HOURS = 24;
const computeEditDeadline = (sessionDate: Date) => {
  const baseline = new Date(sessionDate);
  baseline.setHours(0, 0, 0, 0);
  baseline.setHours(baseline.getHours() + EDIT_WINDOW_HOURS);
  return baseline;
};
const isWithinEditWindow = (sessionDate: Date) => new Date() <= computeEditDeadline(sessionDate);

const ensureTeacherCanViewClassroom = async (
  req: Request,
  res: Response,
  classroomId: bigint,
  classroomSchoolId: bigint
) => {
  if (req.user?.role !== "TEACHER" || !req.user.teacher || !req.user.teacherId) {
    return undefined;
  }
  if (req.user.teacher.schoolId !== classroomSchoolId) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  const association = await resolveTeacherClassroomAssociation(req.user.teacherId, classroomId);
  if (!association.homeroom && !association.subject) {
    res.status(403).json({ message: "Teachers can only view classrooms they are assigned to" });
    return null;
  }
  return association;
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
      const ownsClassroom = await isHomeroomTeacherForClassroom(req.user.teacherId, rest.classroomId);
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
      select: { schoolId: true, classroomId: true, sessionDate: true }
    });

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    if (actor === "teacher" && req.user?.teacher && req.user.teacherId) {
      if (req.user.teacher.schoolId !== session.schoolId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const ownsClassroom = await isHomeroomTeacherForClassroom(req.user.teacherId, session.classroomId);
      if (!ownsClassroom) {
        return res.status(403).json({ message: "Teachers can only manage attendance for their homerooms" });
      }
      if (!isWithinEditWindow(session.sessionDate)) {
        return res
          .status(403)
          .json({ message: "Attendance can only be edited within 24 hours of the session date" });
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
  "/classrooms/:classroomId/sessions",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER", "PRINCIPAL"),
  asyncHandler(async (req, res) => {
    const classroomId = BigInt(req.params.classroomId);

    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      select: { schoolId: true }
    });
    if (!classroom) {
      return res.status(404).json({ message: "Classroom not found" });
    }

    const teacherAssociation = await ensureTeacherCanViewClassroom(req, res, classroomId, classroom.schoolId);
    if (teacherAssociation === null) {
      return;
    }

    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId || req.user.schoolId !== classroom.schoolId) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }

    const sessions = await prisma.attendanceSession.findMany({
      where: { classroomId },
      select: {
        id: true,
        sessionDate: true,
        startsAt: true,
        endsAt: true,
        _count: { select: { studentAttendance: true } }
      },
      orderBy: { sessionDate: "desc" }
    });

    const canTeacherEdit = Boolean(teacherAssociation?.homeroom);
    const payload = sessions.map((session) => {
      const editableUntil = computeEditDeadline(session.sessionDate);
      return {
        id: session.id,
        sessionDate: session.sessionDate,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        totalRecords: session._count.studentAttendance,
        editableUntil,
        canEdit: canTeacherEdit && new Date() <= editableUntil
      };
    });

    res.json({ classroomId, sessions: payload });
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

    const teacherAssociation = await ensureTeacherCanViewClassroom(req, res, classroomId, classroom.schoolId);
    if (teacherAssociation === null) {
      return;
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

    const canTeacherEdit = Boolean(teacherAssociation?.homeroom);
    const enrichedSessions = sessions.map((session) => {
      const editableUntil = computeEditDeadline(session.sessionDate);
      return {
        ...session,
        editableUntil,
        canEdit: canTeacherEdit && new Date() <= editableUntil
      };
    });

    res.json({ sessions: enrichedSessions, summary });
  })
);

attendanceRouter.get(
  "/sessions/:sessionId",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER", "PRINCIPAL"),
  asyncHandler(async (req, res) => {
    const sessionId = BigInt(req.params.sessionId);

    const session = await prisma.attendanceSession.findUnique({
      where: { id: sessionId },
      include: {
        classroom: {
          select: {
            id: true,
            schoolId: true,
            grade: { select: { id: true, name: true, level: true } },
            section: { select: { id: true, label: true } }
          }
        },
        studentAttendance: {
          include: { student: { select: { id: true, firstName: true, lastName: true, code: true } } },
          orderBy: { studentId: "asc" }
        }
      }
    });

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    const teacherAssociation = await ensureTeacherCanViewClassroom(
      req,
      res,
      session.classroomId,
      session.classroom.schoolId
    );
    if (teacherAssociation === null) {
      return;
    }

    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId || req.user.schoolId !== session.classroom.schoolId) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }

    const editableUntil = computeEditDeadline(session.sessionDate);
    const canTeacherEdit = Boolean(teacherAssociation?.homeroom) && new Date() <= editableUntil;

    res.json({
      id: session.id,
      classroomId: session.classroomId,
      sessionDate: session.sessionDate,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      classroom: session.classroom,
      studentAttendance: session.studentAttendance,
      editableUntil,
      canEdit: canTeacherEdit
    });
  })
);
