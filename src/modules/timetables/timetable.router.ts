import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { validateBody } from "../../middleware/validateResource";
import { upsertTimetableSchema } from "./timetable.schemas";

export const timetableRouter = Router();

type UpsertTimetablePayload = z.infer<typeof upsertTimetableSchema>;

const formatTime = (value?: Date | null) => (value ? value.toISOString().substring(11, 16) : null);

const toTimeValue = (value?: string | null) => (value ? new Date(`1970-01-01T${value}:00.000Z`) : null);

const classroomScope = async (classroomId: bigint) =>
  prisma.classroom.findUnique({ where: { id: classroomId }, select: { id: true, schoolId: true } });

const ensureCanViewClassroom = async (req: Request, res: Response, classroomId: bigint) => {
  const classroom = await classroomScope(classroomId);
  if (!classroom) {
    res.status(404).json({ message: "Classroom not found" });
    return null;
  }

  if (req.user?.role === "PRINCIPAL") {
    if (!req.user.schoolId || req.user.schoolId !== classroom.schoolId) {
      res.status(403).json({ message: "Principals can only view their school" });
      return null;
    }
  }

  if (req.user?.role === "TEACHER" && req.user.teacher) {
    if (req.user.teacher.schoolId !== classroom.schoolId) {
      res.status(403).json({ message: "Forbidden" });
      return null;
    }
  }

  if (req.user?.role === "STUDENT" && req.user.studentId) {
    const student = await prisma.student.findUnique({
      where: { id: req.user.studentId },
      select: { classroomId: true }
    });
    if (!student || student.classroomId !== classroomId) {
      res.status(403).json({ message: "Students can only view their own timetable" });
      return null;
    }
  }

  return classroom;
};

const fetchTimetable = async (classroomId: bigint) =>
  prisma.classroomTimetable.findMany({
    where: { classroomId },
    include: {
      teacherSubject: {
        include: {
          subject: true,
          teacher: true
        }
      }
    },
    orderBy: [
      { weekDay: "asc" },
      { period: "asc" }
    ]
  });

type TimetableRows = Awaited<ReturnType<typeof fetchTimetable>>;

const mapEntries = (records: TimetableRows) =>
  records.map((row) => ({
    id: row.id,
    classroomId: row.classroomId,
    weekDay: row.weekDay,
    period: row.period,
    label: row.label,
    location: row.location,
    notes: row.notes,
    startTime: formatTime(row.startTime),
    endTime: formatTime(row.endTime),
    teacherSubjectId: row.teacherSubjectId,
    teacher: row.teacherSubject?.teacher
      ? {
          id: row.teacherSubject.teacher.id,
          firstName: row.teacherSubject.teacher.firstName,
          lastName: row.teacherSubject.teacher.lastName,
          email: row.teacherSubject.teacher.email
        }
      : null,
    subject: row.teacherSubject?.subject
      ? {
          id: row.teacherSubject.subject.id,
          code: row.teacherSubject.subject.code,
          name: row.teacherSubject.subject.name
        }
      : null
  }));

const minutes = (value: string) => {
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
};

timetableRouter.get(
  "/classrooms/:classroomId",
  authorizeRoles("ADMIN", "GOVERNMENT", "PRINCIPAL", "TEACHER", "STUDENT"),
  asyncHandler(async (req, res) => {
    const classroomId = BigInt(req.params.classroomId);
    const classroom = await ensureCanViewClassroom(req, res, classroomId);
    if (!classroom) {
      return;
    }
    const entries = await fetchTimetable(classroomId);
    res.json({ classroomId: classroom.id, schoolId: classroom.schoolId, entries: mapEntries(entries) });
  })
);

timetableRouter.get(
  "/students/:studentId",
  authorizeRoles("ADMIN", "GOVERNMENT", "PRINCIPAL", "TEACHER", "STUDENT"),
  asyncHandler(async (req, res) => {
    const studentId = BigInt(req.params.studentId);
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { classroomId: true, schoolId: true }
    });
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    if (req.user?.role === "STUDENT" && req.user.studentId !== studentId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (req.user?.role === "TEACHER" && req.user.teacher && req.user.teacher.schoolId !== student.schoolId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (req.user?.role === "PRINCIPAL" && (!req.user.schoolId || req.user.schoolId !== student.schoolId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const entries = await fetchTimetable(student.classroomId);
    res.json({ studentId, classroomId: student.classroomId, schoolId: student.schoolId, entries: mapEntries(entries) });
  })
);

timetableRouter.put(
  "/classrooms/:classroomId",
  authorizeRoles("ADMIN", "PRINCIPAL"),
  validateBody(upsertTimetableSchema),
  asyncHandler(async (req, res) => {
    const classroomId = BigInt(req.params.classroomId);
    const classroom = await classroomScope(classroomId);
    if (!classroom) {
      return res.status(404).json({ message: "Classroom not found" });
    }

    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId || req.user.schoolId !== classroom.schoolId) {
        return res.status(403).json({ message: "Principals can only update their school" });
      }
    }

    const payload = req.body as UpsertTimetablePayload;
    const duplicateSlots = new Set<string>();
    for (const entry of payload.entries) {
      const key = `${entry.weekDay}-${entry.period}`;
      if (duplicateSlots.has(key)) {
        return res
          .status(400)
          .json({ message: `Duplicate entry for weekday ${entry.weekDay} period ${entry.period}` });
      }
      duplicateSlots.add(key);
      if (entry.startTime && entry.endTime && minutes(entry.endTime) <= minutes(entry.startTime)) {
        return res.status(400).json({ message: "endTime must be later than startTime" });
      }
    }

    const teacherSubjectIds = Array.from(
      new Set(
        payload.entries
          .map((entry) => entry.teacherSubjectId)
          .filter((id): id is bigint => typeof id === "bigint")
      )
    );

    const teacherSubjects = teacherSubjectIds.length
      ? await prisma.teacherSubject.findMany({
          where: { id: { in: teacherSubjectIds } },
          select: {
            id: true,
            classroomId: true,
            subject: { select: { name: true } },
            teacher: { select: { id: true, schoolId: true } }
          }
        })
      : [];

    if (teacherSubjects.length !== teacherSubjectIds.length) {
      return res.status(400).json({ message: "One or more teacherSubjectId values are invalid" });
    }

    const teacherSubjectMap = new Map(teacherSubjects.map((row) => [row.id, row]));

    for (const entry of payload.entries) {
      if (!entry.teacherSubjectId) {
        continue;
      }
      const assignment = teacherSubjectMap.get(entry.teacherSubjectId);
      if (!assignment) {
        return res.status(400).json({ message: "Invalid teacherSubjectId" });
      }
      if (assignment.teacher.schoolId !== classroom.schoolId) {
        return res.status(400).json({ message: "Teacher assignment belongs to a different school" });
      }
      if (assignment.classroomId && assignment.classroomId !== classroomId) {
        return res
          .status(400)
          .json({ message: "Teacher assignment is not mapped to this classroom" });
      }
    }

    const rows = payload.entries.map((entry) => {
      const startTime = toTimeValue(entry.startTime);
      const endTime = toTimeValue(entry.endTime);
      const resolvedLabel =
        entry.label ??
        (entry.teacherSubjectId ? teacherSubjectMap.get(entry.teacherSubjectId)?.subject.name : undefined) ??
        "Scheduled Period";
      return {
        schoolId: classroom.schoolId,
        classroomId,
        weekDay: entry.weekDay,
        period: entry.period,
        startTime: startTime ?? undefined,
        endTime: endTime ?? undefined,
        label: resolvedLabel,
        location: entry.location ?? undefined,
        notes: entry.notes ?? undefined,
        teacherSubjectId: entry.teacherSubjectId ?? undefined
      };
    });

    await prisma.$transaction(async (tx) => {
      await tx.classroomTimetable.deleteMany({ where: { classroomId } });
      if (rows.length) {
        await tx.classroomTimetable.createMany({ data: rows });
      }
    });

    const refreshed = await fetchTimetable(classroomId);
    res.json({ classroomId, schoolId: classroom.schoolId, entries: mapEntries(refreshed) });
  })
);
