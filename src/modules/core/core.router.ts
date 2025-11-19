import { Router, Request } from "express";
import {
  createClassroomSchema,
  createGradeSchema,
  createSchoolSchema,
  createSectionSchema,
  createStudentSchema,
  createSubjectSchema,
  createTeacherSchema,
  updateStudentSchema,
  updateClassroomSchema,
  updateTeacherSchema,
  bulkCreateGradesSchema,
  bulkCreateSectionsSchema,
  updateGradeSchema,
  updateSectionSchema,
  updateSubjectSchema
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
  authorizeRoles("ADMIN", "GOVERNMENT", "PRINCIPAL"),
  validateBody(createGradeSchema),
  asyncHandler(async (req, res) => {
    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId) {
        return res.status(400).json({ message: "Principal account must be linked to a school" });
      }
      if (req.body.schoolId !== req.user.schoolId) {
        return res.status(403).json({ message: "Principals can only create grades in their own school" });
      }
    }
    const grade = await prisma.grade.create({ data: req.body });
    res.status(201).json(grade);
  })
);

coreRouter.post(
  "/grades/bulk",
  authorizeRoles("ADMIN", "GOVERNMENT", "PRINCIPAL"),
  validateBody(bulkCreateGradesSchema),
  asyncHandler(async (req, res) => {
    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId) {
        return res.status(400).json({ message: "Principal account must be linked to a school" });
      }
      if (req.body.schoolId !== req.user.schoolId) {
        return res.status(403).json({ message: "Principals can only create grades in their own school" });
      }
    }

    const { schoolId, startLevel, endLevel, nameFormat } = req.body;
    const gradesToCreate = [];

    for (let level = startLevel; level <= endLevel; level++) {
      const name = nameFormat.replace("{level}", level.toString());
      gradesToCreate.push({
        schoolId,
        name,
        level
      });
    }

    const created = await prisma.grade.createMany({
      data: gradesToCreate,
      skipDuplicates: true
    });

    res.status(201).json({
      message: `Created ${created.count} grades`,
      count: created.count,
      range: { startLevel, endLevel }
    });
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

coreRouter.patch(
  "/grades/:id",
  authorizeRoles("ADMIN", "GOVERNMENT", "PRINCIPAL"),
  validateBody(updateGradeSchema),
  asyncHandler(async (req, res) => {
    const gradeId = BigInt(req.params.id);
    
    const existingGrade = await prisma.grade.findUnique({
      where: { id: gradeId },
      select: { schoolId: true }
    });
    
    if (!existingGrade) {
      return res.status(404).json({ message: "Grade not found" });
    }
    
    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId || req.user.schoolId !== existingGrade.schoolId) {
        return res.status(403).json({ message: "Principals can only edit grades in their own school" });
      }
    }
    
    const grade = await prisma.grade.update({
      where: { id: gradeId },
      data: req.body
    });
    
    res.json(grade);
  })
);

coreRouter.post(
  "/sections",
  authorizeRoles("ADMIN", "GOVERNMENT", "PRINCIPAL"),
  validateBody(createSectionSchema),
  asyncHandler(async (req, res) => {
    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId) {
        return res.status(400).json({ message: "Principal account must be linked to a school" });
      }
      const grade = await prisma.grade.findUnique({
        where: { id: req.body.gradeId },
        select: { schoolId: true }
      });
      if (!grade) {
        return res.status(404).json({ message: "Grade not found" });
      }
      if (grade.schoolId !== req.user.schoolId) {
        return res.status(403).json({ message: "Principals can only create sections in grades from their own school" });
      }
    }
    const section = await prisma.section.create({ data: req.body });
    res.status(201).json(section);
  })
);

coreRouter.post(
  "/sections/bulk",
  authorizeRoles("ADMIN", "GOVERNMENT", "PRINCIPAL"),
  validateBody(bulkCreateSectionsSchema),
  asyncHandler(async (req, res) => {
    const { gradeId, labels } = req.body;
    
    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId) {
        return res.status(400).json({ message: "Principal account must be linked to a school" });
      }
      const grade = await prisma.grade.findUnique({
        where: { id: gradeId },
        select: { schoolId: true }
      });
      if (!grade) {
        return res.status(404).json({ message: "Grade not found" });
      }
      if (grade.schoolId !== req.user.schoolId) {
        return res.status(403).json({ message: "Principals can only create sections in grades from their own school" });
      }
    }
    
    const sectionsToCreate = labels.map((label: string) => ({
      gradeId,
      label
    }));
    
    const result = await prisma.section.createMany({
      data: sectionsToCreate,
      skipDuplicates: true
    });
    
    res.status(201).json({
      message: `Created ${result.count} sections`,
      count: result.count,
      labels
    });
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

coreRouter.patch(
  "/sections/:id",
  authorizeRoles("ADMIN", "GOVERNMENT", "PRINCIPAL"),
  validateBody(updateSectionSchema),
  asyncHandler(async (req, res) => {
    const sectionId = BigInt(req.params.id);
    
    const existingSection = await prisma.section.findUnique({
      where: { id: sectionId },
      include: { grade: { select: { schoolId: true } } }
    });
    
    if (!existingSection) {
      return res.status(404).json({ message: "Section not found" });
    }
    
    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId || req.user.schoolId !== existingSection.grade.schoolId) {
        return res.status(403).json({ message: "Principals can only edit sections in their own school" });
      }
    }
    
    const section = await prisma.section.update({
      where: { id: sectionId },
      data: req.body
    });
    
    res.json(section);
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
  authorizeRoles("ADMIN", "GOVERNMENT", "PRINCIPAL"),
  validateBody(createSubjectSchema),
  asyncHandler(async (req, res) => {
    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId) {
        return res.status(400).json({ message: "Principal account must be linked to a school" });
      }
      if (req.body.schoolId !== req.user.schoolId) {
        return res.status(403).json({ message: "Principals can only create subjects in their own school" });
      }
    }
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

coreRouter.patch(
  "/subjects/:id",
  authorizeRoles("ADMIN", "GOVERNMENT", "PRINCIPAL"),
  validateBody(updateSubjectSchema),
  asyncHandler(async (req, res) => {
    const subjectId = BigInt(req.params.id);
    
    const existingSubject = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { schoolId: true }
    });
    
    if (!existingSubject) {
      return res.status(404).json({ message: "Subject not found" });
    }
    
    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId || req.user.schoolId !== existingSubject.schoolId) {
        return res.status(403).json({ message: "Principals can only edit subjects in their own school" });
      }
    }
    
    const subject = await prisma.subject.update({
      where: { id: subjectId },
      data: req.body
    });
    
    res.json(subject);
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
    if (req.user?.role === "STUDENT") {
      const userStudentId = req.user.studentId ? BigInt(req.user.studentId) : null;
      if (userStudentId !== student.id) {
        return res.status(403).json({ message: "Forbidden" });
      }
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

coreRouter.patch(
  "/students/:id",
  authorizeRoles("ADMIN", "GOVERNMENT", "PRINCIPAL"),
  validateBody(updateStudentSchema),
  asyncHandler(async (req, res) => {
    const studentId = BigInt(req.params.id);
    
    const existingStudent = await prisma.student.findUnique({
      where: { id: studentId },
      select: { schoolId: true, classroomId: true }
    });
    
    if (!existingStudent) {
      return res.status(404).json({ message: "Student not found" });
    }
    
    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId || req.user.schoolId !== existingStudent.schoolId) {
        return res.status(403).json({ message: "Principals can only edit students in their own school" });
      }
    }
    
    let updateData: Record<string, unknown> = { ...req.body };
    
    // If classroom is being changed, fetch new gradeLevel and sectionLabel
    if (req.body.classroomId) {
      const classroom = await prisma.classroom.findUnique({
        where: { id: req.body.classroomId },
        include: { grade: true, section: true }
      });
      
      if (!classroom) {
        return res.status(404).json({ message: "Classroom not found" });
      }
      
      if (classroom.schoolId !== existingStudent.schoolId) {
        return res.status(400).json({ message: "Cannot move student to a classroom in a different school" });
      }
      
      updateData.gradeLevel = classroom.grade.level;
      updateData.sectionLabel = classroom.section.label;
    }
    
    const student = await prisma.student.update({
      where: { id: studentId },
      data: updateData
    });
    
    res.json(student);
  })
);

coreRouter.patch(
  "/classrooms/:id",
  authorizeRoles("ADMIN", "GOVERNMENT", "PRINCIPAL"),
  validateBody(updateClassroomSchema),
  asyncHandler(async (req, res) => {
    const classroomId = BigInt(req.params.id);
    
    const existingClassroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      select: { schoolId: true }
    });
    
    if (!existingClassroom) {
      return res.status(404).json({ message: "Classroom not found" });
    }
    
    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId || req.user.schoolId !== existingClassroom.schoolId) {
        return res.status(403).json({ message: "Principals can only edit classrooms in their own school" });
      }
    }
    
    const classroom = await prisma.classroom.update({
      where: { id: classroomId },
      data: req.body
    });
    
    res.json(classroom);
  })
);

coreRouter.patch(
  "/teachers/:id",
  authorizeRoles("ADMIN", "GOVERNMENT", "PRINCIPAL"),
  validateBody(updateTeacherSchema),
  asyncHandler(async (req, res) => {
    const teacherId = BigInt(req.params.id);
    
    const existingTeacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { schoolId: true }
    });
    
    if (!existingTeacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }
    
    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId || req.user.schoolId !== existingTeacher.schoolId) {
        return res.status(403).json({ message: "Principals can only edit teachers in their own school" });
      }
    }
    
    const teacher = await prisma.teacher.update({
      where: { id: teacherId },
      data: req.body
    });
    
    res.json(teacher);
  })
);
