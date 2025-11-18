import { z } from "zod";

export const createSchoolSchema = z.object({
  name: z.string().min(2),
  district: z.string().min(2).optional()
});

export const createGradeSchema = z.object({
  schoolId: z.coerce.bigint(),
  name: z.string().min(1),
  level: z.number().int().min(1)
});

export const createSectionSchema = z.object({
  gradeId: z.coerce.bigint(),
  label: z.string().min(1).max(10)
});

export const createClassroomSchema = z.object({
  schoolId: z.coerce.bigint(),
  gradeId: z.coerce.bigint(),
  sectionId: z.coerce.bigint(),
  academicYear: z.string().regex(/^[0-9]{4}-[0-9]{4}$/)
});

export const createTeacherSchema = z.object({
  schoolId: z.coerce.bigint(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email()
});

export const createSubjectSchema = z.object({
  schoolId: z.coerce.bigint(),
  code: z.string().min(2),
  name: z.string().min(2)
});

export const createStudentSchema = z.object({
  schoolId: z.coerce.bigint(),
  classroomId: z.coerce.bigint(),
  code: z.string().min(3),
  phoneNumber: z
    .string()
    .regex(/^\+?[0-9]{7,15}$/)
    .optional(),
  classTeacherId: z.coerce.bigint().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  gender: z.enum(["M", "F", "O"]).optional(),
  dateOfBirth: z.coerce.date().optional()
});
