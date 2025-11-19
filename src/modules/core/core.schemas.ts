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

export const bulkCreateGradesSchema = z.object({
  schoolId: z.coerce.bigint(),
  startLevel: z.number().int().min(1).default(1),
  endLevel: z.number().int().min(1).max(12),
  nameFormat: z.string().optional().default("Grade {level}")
}).refine((data) => data.endLevel >= data.startLevel, {
  message: "endLevel must be greater than or equal to startLevel"
});

export const createSectionSchema = z.object({
  gradeId: z.coerce.bigint(),
  label: z.string().min(1).max(10)
});

export const bulkCreateSectionsSchema = z.object({
  gradeId: z.coerce.bigint(),
  labels: z.array(z.string().min(1).max(10)).min(1).max(26)
}).refine((data) => {
  const uniqueLabels = new Set(data.labels);
  return uniqueLabels.size === data.labels.length;
}, {
  message: "Section labels must be unique"
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

export const updateStudentSchema = z.object({
  classroomId: z.coerce.bigint().optional(),
  phoneNumber: z
    .string()
    .regex(/^\+?[0-9]{7,15}$/)
    .optional()
    .nullable(),
  classTeacherId: z.coerce.bigint().optional().nullable(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  gender: z.enum(["M", "F", "O"]).optional().nullable(),
  dateOfBirth: z.coerce.date().optional().nullable(),
  active: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided"
});

export const updateClassroomSchema = z.object({
  academicYear: z.string().regex(/^[0-9]{4}-[0-9]{4}$/).optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided"
});

export const updateGradeSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided"
});

export const updateSectionSchema = z.object({
  label: z.string().min(1).max(10).optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided"
});

export const updateSubjectSchema = z.object({
  code: z.string().min(2).optional(),
  name: z.string().min(2).optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided"
});

export const updateTeacherSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided"
});
