import { z } from "zod";

export const createAttendanceSessionSchema = z.object({
  schoolId: z.coerce.bigint(),
  classroomId: z.coerce.bigint(),
  sessionDate: z.coerce.date(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional()
});

export const recordAttendanceSchema = z.object({
  entries: z
    .array(
      z.object({
        studentId: z.coerce.bigint(),
        status: z.enum(["present", "absent", "late", "excused"]).default("present")
      })
    )
    .min(1)
});
