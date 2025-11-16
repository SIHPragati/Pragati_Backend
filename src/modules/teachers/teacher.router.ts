import { Request, Response, Router } from "express";
import { authorizeRoles } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { prisma } from "../../lib/prisma";
import { resolveTeacherClassroomAssociation } from "../../utils/classroomAccess";

export const teacherRouter = Router();

const getTeacherContext = (req: Request, res: Response) => {
  if (!req.user?.teacherId || !req.user.teacher) {
    res.status(403).json({ message: "Teacher profile missing" });
    return null;
  }
  return { teacherId: req.user.teacherId, schoolId: req.user.teacher.schoolId };
};

teacherRouter.get(
  "/me/classrooms",
  authorizeRoles("TEACHER"),
  asyncHandler(async (req, res) => {
    const ctx = getTeacherContext(req, res);
    if (!ctx) {
      return;
    }

    const [subjectAssignments, homeroomClassrooms] = await Promise.all([
      prisma.teacherSubject.findMany({
        where: {
          teacherId: ctx.teacherId,
          classroomId: { not: null },
          classroom: { schoolId: ctx.schoolId }
        },
        include: {
          classroom: { include: { grade: true, section: true } },
          subject: { select: { id: true, name: true, code: true } }
        }
      }),
      prisma.classroom.findMany({
        where: {
          schoolId: ctx.schoolId,
          students: { some: { classTeacherId: ctx.teacherId } }
        },
        include: { grade: true, section: true }
      })
    ]);

    type ClassroomEntry = {
      id: bigint;
      academicYear: string;
      grade: { id: bigint; name: string; level: number };
      section: { id: bigint; label: string };
      studentCount: number;
      roles: {
        homeroom: boolean;
        subjects: Array<{ teacherSubjectId: bigint; subjectId: bigint; subjectCode: string; subjectName: string }>;
      };
    };

    const map = new Map<bigint, ClassroomEntry>();
    const ensureEntry = (classroom: {
      id: bigint;
      academicYear: string;
      grade: { id: bigint; name: string; level: number };
      section: { id: bigint; label: string };
    }) => {
      if (!map.has(classroom.id)) {
        map.set(classroom.id, {
          id: classroom.id,
          academicYear: classroom.academicYear,
          grade: classroom.grade,
          section: classroom.section,
          studentCount: 0,
          roles: { homeroom: false, subjects: [] }
        });
      }
      return map.get(classroom.id)!;
    };

    for (const classroom of homeroomClassrooms) {
      const entry = ensureEntry(classroom);
      entry.roles.homeroom = true;
    }

    for (const assignment of subjectAssignments) {
      if (!assignment.classroom) {
        continue;
      }
      const entry = ensureEntry(assignment.classroom);
      entry.roles.subjects.push({
        teacherSubjectId: assignment.id,
        subjectId: assignment.subject.id,
        subjectCode: assignment.subject.code,
        subjectName: assignment.subject.name
      });
    }

    const classroomIds = Array.from(map.keys());
    if (classroomIds.length) {
      const counts = await prisma.student.groupBy({
        by: ["classroomId"],
        where: { classroomId: { in: classroomIds } },
        _count: { _all: true }
      });
      const countMap = new Map(counts.map((row) => [row.classroomId, row._count._all]));
      for (const entry of map.values()) {
        entry.studentCount = countMap.get(entry.id) ?? 0;
      }
    }

    const classrooms = Array.from(map.values()).sort((a, b) => {
      if (a.grade.level !== b.grade.level) {
        return a.grade.level - b.grade.level;
      }
      if (a.section.label !== b.section.label) {
        return a.section.label.localeCompare(b.section.label);
      }
      return Number(a.id - b.id);
    });

    res.json({ classrooms });
  })
);

teacherRouter.get(
  "/me/classrooms/:classroomId/students",
  authorizeRoles("TEACHER"),
  asyncHandler(async (req, res) => {
    const ctx = getTeacherContext(req, res);
    if (!ctx) {
      return;
    }

    const classroomId = BigInt(req.params.classroomId);
    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      select: { schoolId: true }
    });

    if (!classroom) {
      return res.status(404).json({ message: "Classroom not found" });
    }

    if (classroom.schoolId !== ctx.schoolId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const association = await resolveTeacherClassroomAssociation(ctx.teacherId, classroomId);
    if (!association.homeroom && !association.subject) {
      return res.status(403).json({ message: "Teachers can only view classrooms they are assigned to" });
    }

    const students = await prisma.student.findMany({
      where: { classroomId },
      select: { id: true, firstName: true, lastName: true, code: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }]
    });

    const studentIds = students.map((student) => student.id);
    const statsMap = new Map<
      bigint,
      { total: number; present: number; absent: number; late: number; excused: number }
    >();

    if (studentIds.length) {
      const grouped = await prisma.studentAttendance.groupBy({
        by: ["studentId", "status"],
        where: {
          studentId: { in: studentIds },
          attendanceSession: { classroomId }
        },
        _count: { _all: true }
      });
      for (const row of grouped) {
        const current =
          statsMap.get(row.studentId) ?? { total: 0, present: 0, absent: 0, late: 0, excused: 0 };
        const increment = row._count._all;
        current.total += increment;
        switch (row.status) {
          case "present":
            current.present += increment;
            break;
          case "absent":
            current.absent += increment;
            break;
          case "late":
            current.late += increment;
            break;
          case "excused":
            current.excused += increment;
            break;
          default:
            break;
        }
        statsMap.set(row.studentId, current);
      }
    }

    const result = students.map((student) => {
      const stats = statsMap.get(student.id) ?? { total: 0, present: 0, absent: 0, late: 0, excused: 0 };
      const attendanceRate = stats.total ? Number((stats.present / stats.total).toFixed(2)) : 0;
      return {
        ...student,
        attendance: {
          totalSessions: stats.total,
          present: stats.present,
          absent: stats.absent,
          late: stats.late,
          excused: stats.excused,
          attendanceRate
        }
      };
    });

    res.json({
      classroomId,
      canEditAttendance: association.homeroom,
      students: result
    });
  })
);
