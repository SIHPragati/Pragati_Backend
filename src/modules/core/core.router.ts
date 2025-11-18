import { Router, Request } from "express";
import {
  createClassroomSchema,
  createGradeSchema,
  createSchoolSchema,
  createSectionSchema,
  createStudentSchema,
  createSubjectSchema,
  createTeacherSchema
} from "./core.schemas";
import { validateBody } from "../../middleware/validateResource";
import { asyncHandler } from "../../utils/asyncHandler";
import { prisma } from "../../lib/prisma";
import { authorizeRoles } from "../../middleware/auth";

const getScopedSchoolId = (req: Request) => {
  if (req.user?.role === "TEACHER" && req.user.teacher) {
    return req.user.teacher.schoolId;
  }
  if (req.user?.role === "PRINCIPAL" && req.user.schoolId) {
    return req.user.schoolId;
  }
  return undefined;
};

export const coreRouter = Router();

coreRouter.post(
  "/schools",
  authorizeRoles("ADMIN", "GOVERNMENT"),
  validateBody(createSchoolSchema),
  asyncHandler(async (req, res) => {
    const school = await prisma.school.create({ data: req.body });
    res.status(201).json(school);
  })
);

coreRouter.get(
  "/schools",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER", "PRINCIPAL"),
  asyncHandler(async (req, res) => {
    const scopedSchoolId = getScopedSchoolId(req);
    const schools = await prisma.school.findMany({
      where: scopedSchoolId ? { id: scopedSchoolId } : undefined
    });
    res.json(schools);
  })
);

coreRouter.post(
  "/grades",
  authorizeRoles("ADMIN", "GOVERNMENT"),
  validateBody(createGradeSchema),
  asyncHandler(async (req, res) => {
    const grade = await prisma.grade.create({ data: req.body });
    res.status(201).json(grade);
  })
);

coreRouter.get(
  "/grades",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER", "PRINCIPAL"),
  asyncHandler(async (req, res) => {
    const scopedSchoolId = getScopedSchoolId(req);
    const schoolId = scopedSchoolId ?? (req.query.schoolId ? BigInt(String(req.query.schoolId)) : undefined);
    const grades = await prisma.grade.findMany({
      where: schoolId ? { schoolId } : undefined,
      include: { sections: true }
    });
    res.json(grades);
  })
);

coreRouter.post(
  "/sections",
  authorizeRoles("ADMIN", "GOVERNMENT"),
  validateBody(createSectionSchema),
  asyncHandler(async (req, res) => {
    const section = await prisma.section.create({ data: req.body });
    res.status(201).json(section);
  })
);

coreRouter.get(
  "/sections",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER", "PRINCIPAL"),
  asyncHandler(async (req, res) => {
    const gradeId = req.query.gradeId ? BigInt(String(req.query.gradeId)) : undefined;
    const scopedSchoolId = getScopedSchoolId(req);
    const sections = await prisma.section.findMany({
      where: {
        ...(gradeId ? { gradeId } : {}),
        ...(scopedSchoolId
          ? {
              grade: {
                schoolId: scopedSchoolId
              }
            }
          : {})
      }
    });
    res.json(sections);
  })
);

coreRouter.post(
  "/classrooms",
  authorizeRoles("ADMIN", "GOVERNMENT", "PRINCIPAL"),
  validateBody(createClassroomSchema),
  asyncHandler(async (req, res) => {
    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId) {
        return res.status(400).json({ message: "Principal account must be linked to a school" });
      }
      if (req.body.schoolId !== req.user.schoolId) {
        return res.status(403).json({ message: "Principals can only create classrooms in their own school" });
      }
    }
    const classroom = await prisma.classroom.create({ data: req.body });
    res.status(201).json(classroom);
  })
);

coreRouter.get(
  "/classrooms",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER", "PRINCIPAL"),
  asyncHandler(async (req, res) => {
    const scopedSchoolId = getScopedSchoolId(req);
    const schoolId = scopedSchoolId ?? (req.query.schoolId ? BigInt(String(req.query.schoolId)) : undefined);
    const classrooms = await prisma.classroom.findMany({
      where: schoolId ? { schoolId } : undefined,
      include: { grade: true, section: true }
    });
    res.json(classrooms);
  })
);

coreRouter.post(
  "/teachers",
  authorizeRoles("ADMIN", "GOVERNMENT", "PRINCIPAL"),
  validateBody(createTeacherSchema),
  asyncHandler(async (req, res) => {
    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId) {
        return res.status(400).json({ message: "Principal account must be linked to a school" });
      }
      if (req.body.schoolId !== req.user.schoolId) {
        return res.status(403).json({ message: "Principals can only create teachers in their own school" });
      }
    }
    const teacher = await prisma.teacher.create({ data: req.body });
    res.status(201).json(teacher);
  })
);

coreRouter.get(
  "/teachers",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER", "PRINCIPAL"),
  asyncHandler(async (req, res) => {
    const scopedSchoolId = getScopedSchoolId(req);
    const schoolId = scopedSchoolId ?? (req.query.schoolId ? BigInt(String(req.query.schoolId)) : undefined);
    const teachers = await prisma.teacher.findMany({
      where: schoolId ? { schoolId } : undefined
    });
    res.json(teachers);
  })
);

coreRouter.post(
  "/subjects",
  authorizeRoles("ADMIN", "GOVERNMENT"),
  validateBody(createSubjectSchema),
  asyncHandler(async (req, res) => {
    const subject = await prisma.subject.create({ data: req.body });
    res.status(201).json(subject);
  })
);

coreRouter.get(
  "/subjects",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER", "PRINCIPAL"),
  asyncHandler(async (req, res) => {
    const scopedSchoolId = getScopedSchoolId(req);
    const schoolId = scopedSchoolId ?? (req.query.schoolId ? BigInt(String(req.query.schoolId)) : undefined);
    const subjects = await prisma.subject.findMany({
      where: schoolId ? { schoolId } : undefined
    });
    res.json(subjects);
  })
);

coreRouter.post(
  "/students",
  authorizeRoles("ADMIN", "GOVERNMENT", "PRINCIPAL"),
  validateBody(createStudentSchema),
  asyncHandler(async (req, res) => {
    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId) {
        return res.status(400).json({ message: "Principal account must be linked to a school" });
      }
      if (req.body.schoolId !== req.user.schoolId) {
        return res.status(403).json({ message: "Principals can only create students in their own school" });
      }
    }
    
    // Fetch classroom to get gradeLevel and sectionLabel
    const classroom = await prisma.classroom.findUnique({
      where: { id: req.body.classroomId },
      include: {
        grade: true,
        section: true
      }
    });
    
    if (!classroom) {
      return res.status(404).json({ message: "Classroom not found" });
    }
    
    if (classroom.schoolId !== req.body.schoolId) {
      return res.status(400).json({ message: "Classroom does not belong to the specified school" });
    }
    
    const student = await prisma.student.create({
      data: {
        ...req.body,
        gradeLevel: classroom.grade.level,
        sectionLabel: classroom.section.label,
        enrolledAt: new Date()
      }
    });
    res.status(201).json(student);
  })
);

coreRouter.get(
  "/students",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER", "PRINCIPAL"),
  asyncHandler(async (req, res) => {
    const classroomId = req.query.classroomId ? BigInt(String(req.query.classroomId)) : undefined;
    const scopedSchoolId = getScopedSchoolId(req);
    const teacherId = req.user?.role === "TEACHER" ? req.user.teacherId : undefined;
    const students = await prisma.student.findMany({
      where: {
        ...(classroomId ? { classroomId } : {}),
        ...(teacherId ? { classTeacherId: teacherId } : scopedSchoolId ? { schoolId: scopedSchoolId } : {})
      }
    });
    res.json(students);
  })
);

coreRouter.get(
  "/students/:id",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER", "PRINCIPAL", "STUDENT"),
  asyncHandler(async (req, res) => {
    const student = await prisma.student.findUnique({
      where: { id: BigInt(req.params.id) },
      include: { subjects: true, attendances: true }
    });
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }
    if (req.user?.role === "STUDENT" && req.user.studentId !== student.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (req.user?.role === "TEACHER") {
      if (!req.user.teacher || req.user.teacher.schoolId !== student.schoolId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      if (req.user.teacherId !== student.classTeacherId) {
        return res.status(403).json({ message: "Teachers can only view their homeroom students" });
      }
    }
    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId || req.user.schoolId !== student.schoolId) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }
    res.json(student);
  })
);
