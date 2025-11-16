import { z } from "zod";

const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24h HH:MM format")
  .optional();

export const timetableEntrySchema = z.object({
  weekDay: z.number().int().min(1).max(7),
  period: z.number().int().min(1).max(16),
  startTime: timeStringSchema,
  endTime: timeStringSchema,
  teacherSubjectId: z.coerce.bigint().optional(),
  label: z.string().min(1).max(80).optional(),
  location: z.string().min(1).max(80).optional(),
  notes: z.string().min(1).max(255).optional()
});

export const upsertTimetableSchema = z.object({
  entries: z.array(timetableEntrySchema).min(1).max(80)
});
