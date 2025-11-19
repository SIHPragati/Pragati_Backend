import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { validateBody } from "../../middleware/validateResource";
import { asyncHandler } from "../../utils/asyncHandler";
import { authorizeRoles } from "../../middleware/auth";
import {
  addGroupMembersSchema,
  createStudentGroupSchema,
  createStudentSubjectSchema,
  createTeacherSubjectSchema
} from "./enrollment.schemas";

export const enrollmentRouter = Router();

enrollmentRouter.post(
  "/teacher-subjects",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER", "PRINCIPAL"),
  validateBody(createTeacherSubjectSchema),
  asyncHandler(async (req, res) => {
    if (req.user?.role === "TEACHER" && req.user.teacherId !== req.body.teacherId) {
      return res.status(403).json({ message: "Teachers can only manage their own subjects" });
    }
    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId) {
        return res.status(400).json({ message: "Principal account must be linked to a school" });
      }
      const teacher = await prisma.teacher.findUnique({ where: { id: req.body.teacherId }, select: { schoolId: true } });
      if (!teacher || teacher.schoolId !== req.user.schoolId) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }
    
    // Check if this assignment already exists
    const existing = await prisma.teacherSubject.findFirst({
      where: {
        teacherId: req.body.teacherId,
        subjectId: req.body.subjectId,
        classroomId: req.body.classroomId,
        startDate: req.body.startDate
      }
    });
    
    if (existing) {
      return res.status(409).json({ 
        message: "This teacher is already assigned to this subject in this classroom with the same start date",
        existingRecord: existing
      });
    }
    
    const record = await prisma.teacherSubject.create({ data: req.body });
    res.status(201).json(record);
  })
);

enrollmentRouter.get(
  "/teacher-subjects",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER", "PRINCIPAL"),
  asyncHandler(async (req, res) => {
    const teacherId = req.query.teacherId ? BigInt(String(req.query.teacherId)) : undefined;
    const classroomId = req.query.classroomId ? BigInt(String(req.query.classroomId)) : undefined;
    const subjectId = req.query.subjectId ? BigInt(String(req.query.subjectId)) : undefined;
    
    const whereClause: {
      teacherId?: bigint;
      classroomId?: bigint;
      subjectId?: bigint;
      teacher?: { schoolId: bigint };
    } = {};
    
    // Apply filters
    if (teacherId) whereClause.teacherId = teacherId;
    if (classroomId) whereClause.classroomId = classroomId;
    if (subjectId) whereClause.subjectId = subjectId;
    
    // Role-based filtering
    if (req.user?.role === "TEACHER") {
      if (req.user.teacherId) {
        whereClause.teacherId = req.user.teacherId;
      }
    }
    
    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId) {
        return res.status(400).json({ message: "Principal account must be linked to a school" });
      }
      whereClause.teacher = {
        schoolId: req.user.schoolId
      };
    }
    
    const assignments = await prisma.teacherSubject.findMany({
      where: whereClause,
      include: {
        teacher: {
          select: {
            firstName: true,
            lastName: true
          }
        },
        subject: {
          select: {
            code: true,
            name: true
          }
        },
        classroom: {
          select: {
            grade: {
              select: {
                name: true
              }
            },
            section: {
              select: {
                label: true
              }
            }
          }
        }
      },
      orderBy: [
        { startDate: 'desc' },
        { classroom: { grade: { level: 'asc' } } }
      ]
    });
    
    res.json(assignments);
  })
);

enrollmentRouter.post(
  "/student-subjects",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER", "PRINCIPAL"),
  validateBody(createStudentSubjectSchema),
  asyncHandler(async (req, res) => {
    if (req.user?.role === "TEACHER") {
      const teacherSubject = await prisma.teacherSubject.findUnique({
        where: { id: req.body.teacherSubjectId },
        select: { teacherId: true }
      });
      if (!teacherSubject || teacherSubject.teacherId !== req.user.teacherId) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }
    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId) {
        return res.status(400).json({ message: "Principal account must be linked to a school" });
      }
      const student = await prisma.student.findUnique({ where: { id: req.body.studentId }, select: { schoolId: true } });
      if (!student || student.schoolId !== req.user.schoolId) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }
    
    // Check if this enrollment already exists
    const existing = await prisma.studentSubject.findUnique({
      where: {
        studentId_teacherSubjectId: {
          studentId: req.body.studentId,
          teacherSubjectId: req.body.teacherSubjectId
        }
      }
    });
    
    if (existing) {
      return res.status(409).json({ 
        message: "This student is already enrolled in this subject",
        existingRecord: existing
      });
    }
    
    const record = await prisma.studentSubject.create({ data: req.body });
    res.status(201).json(record);
  })
);

enrollmentRouter.get(
  "/student-subjects",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER", "PRINCIPAL"),
  asyncHandler(async (req, res) => {
    const studentId = req.query.studentId ? BigInt(String(req.query.studentId)) : undefined;
    const teacherSubjectId = req.query.teacherSubjectId ? BigInt(String(req.query.teacherSubjectId)) : undefined;
    const classroomId = req.query.classroomId ? BigInt(String(req.query.classroomId)) : undefined;
    
    const whereClause: {
      studentId?: bigint;
      teacherSubjectId?: bigint;
      teacherSubject?: { classroomId?: bigint; teacherId?: bigint };
      student?: { schoolId: bigint };
    } = {};
    
    // Apply filters
    if (studentId) whereClause.studentId = studentId;
    if (teacherSubjectId) whereClause.teacherSubjectId = teacherSubjectId;
    if (classroomId) {
      whereClause.teacherSubject = { classroomId };
    }
    
    // Role-based filtering
    if (req.user?.role === "TEACHER") {
      if (req.user.teacherId) {
        whereClause.teacherSubject = {
          ...whereClause.teacherSubject,
          teacherId: req.user.teacherId
        };
      }
    }
    
    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId) {
        return res.status(400).json({ message: "Principal account must be linked to a school" });
      }
      whereClause.student = {
        schoolId: req.user.schoolId
      };
    }
    
    const enrollments = await prisma.studentSubject.findMany({
      where: whereClause,
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            code: true
          }
        },
        teacherSubject: {
          include: {
            subject: {
              select: {
                name: true,
                code: true
              }
            },
            teacher: {
              select: {
                firstName: true,
                lastName: true
              }
            },
            classroom: {
              select: {
                grade: {
                  select: {
                    name: true
                  }
                },
                section: {
                  select: {
                    label: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: [
        { enrolledOn: 'desc' },
        { student: { firstName: 'asc' } }
      ]
    });
    
    res.json(enrollments);
  })
);

enrollmentRouter.post(
  "/student-groups",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER", "PRINCIPAL"),
  validateBody(createStudentGroupSchema),
  asyncHandler(async (req, res) => {
    if (req.user?.role === "TEACHER" && req.user.teacher && req.user.teacher.schoolId !== req.body.schoolId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (req.user?.role === "PRINCIPAL" && req.user.schoolId !== req.body.schoolId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const group = await prisma.studentGroup.create({ data: req.body });
    res.status(201).json(group);
  })
);

enrollmentRouter.post(
  "/student-groups/:groupId/members",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER", "PRINCIPAL"),
  validateBody(addGroupMembersSchema),
  asyncHandler(async (req, res) => {
    const groupId = BigInt(req.params.groupId);
    if (req.user?.role === "TEACHER" && req.user.teacher) {
      const group = await prisma.studentGroup.findUnique({ where: { id: groupId }, select: { schoolId: true } });
      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }
      if (group.schoolId !== req.user.teacher.schoolId) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }
    if (req.user?.role === "PRINCIPAL") {
      const group = await prisma.studentGroup.findUnique({ where: { id: groupId }, select: { schoolId: true } });
      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }
      if (!req.user.schoolId || group.schoolId !== req.user.schoolId) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }
    const payload = addGroupMembersSchema.parse(req.body);

    await prisma.$transaction(async (tx) => {
      for (const studentId of payload.studentIds) {
        await tx.studentGroupMember.upsert({
          where: {
            groupId_studentId: {
              groupId,
              studentId
            }
          },
          create: {
            groupId,
            studentId,
            addedBy: payload.addedBy
          },
          update: {}
        });
      }
    });

    res.json({ message: "Members synced" });
  })
);

enrollmentRouter.get(
  "/student-groups",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER", "PRINCIPAL"),
  asyncHandler(async (req, res) => {
    const teacherSchoolId = req.user?.role === "TEACHER" && req.user.teacher ? req.user.teacher.schoolId : undefined;
    const principalSchoolId = req.user?.role === "PRINCIPAL" ? req.user.schoolId : undefined;
    const schoolId = teacherSchoolId ?? principalSchoolId ?? (req.query.schoolId ? BigInt(String(req.query.schoolId)) : undefined);
    const groups = await prisma.studentGroup.findMany({
      where: schoolId ? { schoolId } : undefined,
      include: { members: true }
    });
    res.json(groups);
  })
);
