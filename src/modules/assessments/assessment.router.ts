import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { validateBody } from "../../middleware/validateResource";
import { asyncHandler } from "../../utils/asyncHandler";
import { authorizeRoles } from "../../middleware/auth";
import { createExamSchema, recordExamResultsSchema } from "./assessment.schemas";

export const assessmentRouter = Router();

assessmentRouter.post(
  "/exams",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER"),
  validateBody(createExamSchema),
  asyncHandler(async (req, res) => {
    if (req.user?.role === "TEACHER" && req.user.teacherId !== req.body.teacherId) {
      return res.status(403).json({ message: "Teachers can only schedule their own exams" });
    }
    const exam = await prisma.exam.create({ data: req.body });
    res.status(201).json(exam);
  })
);

assessmentRouter.post(
  "/exam-results",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER"),
  validateBody(recordExamResultsSchema),
  asyncHandler(async (req, res) => {
    const { examId, results } = req.body;

    if (req.user?.role === "TEACHER") {
      const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { teacherId: true } });
      if (!exam) {
        return res.status(404).json({ message: "Exam not found" });
      }
      if (exam.teacherId !== req.user.teacherId) {
        return res.status(403).json({ message: "Teachers can only grade their own exams" });
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const result of results) {
        await tx.studentExamResult.upsert({
          where: {
            examId_studentId: {
              examId,
              studentId: result.studentId
            }
          },
          create: {
            examId,
            studentId: result.studentId,
            score: result.score,
            grade: result.grade
          },
          update: {
            score: result.score,
            grade: result.grade,
            gradedAt: new Date()
          }
        });
      }
    });

    res.json({ message: "Exam results synced" });
  })
);

assessmentRouter.get(
  "/students/:studentId/latest",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER", "PRINCIPAL", "STUDENT"),
  asyncHandler(async (req, res) => {
    const studentId = BigInt(req.params.studentId);
    if (req.user?.role === "STUDENT") {
      const userStudentId = req.user.studentId ? BigInt(req.user.studentId) : null;
      if (userStudentId !== studentId) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }
    if (
      (req.user?.role === "TEACHER" && req.user.teacher) ||
      (req.user?.role === "PRINCIPAL" && req.user.schoolId)
    ) {
      const student = await prisma.student.findUnique({ where: { id: studentId }, select: { schoolId: true } });
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }
      if (req.user.role === "TEACHER" && req.user.teacher?.schoolId !== student.schoolId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (req.user.role === "PRINCIPAL" && req.user.schoolId !== student.schoolId) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }
    const results = await prisma.studentExamResult.findMany({
      where: { studentId },
      include: {
        exam: true
      },
      orderBy: { gradedAt: "desc" },
      take: 10
    });

    res.json(results);
  })
);
