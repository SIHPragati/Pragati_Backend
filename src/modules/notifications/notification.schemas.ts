import { z } from "zod";

const targetArray = z.array(z.coerce.bigint()).optional();

export const createNotificationSchema = z
  .object({
    schoolId: z.coerce.bigint(),
    title: z.string().min(3),
    body: z.string().min(3),
    category: z.enum(["general", "exam", "attendance", "emergency"]).default("general"),
    activeFrom: z.coerce.date().optional(),
    activeTill: z.coerce.date(),
    priority: z.number().int().min(1).max(5).default(3),
    createdBy: z.coerce.bigint(),
    isPublic: z.boolean().optional().default(false),
    targets: z.object({
      studentIds: targetArray,
      studentGroupIds: targetArray,
      teacherIds: targetArray,
      classroomIds: targetArray
    })
  })
  .refine((data) => {
    const { studentIds, studentGroupIds, teacherIds, classroomIds } = data.targets;
    const hasTargets = Boolean(
      (studentIds && studentIds.length) ||
        (studentGroupIds && studentGroupIds.length) ||
        (teacherIds && teacherIds.length) ||
        (classroomIds && classroomIds.length)
    );
    return data.isPublic || hasTargets;
  }, "Provide at least one target unless the notice is public");
