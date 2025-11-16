import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { validateBody } from "../../middleware/validateResource";
import { asyncHandler } from "../../utils/asyncHandler";
import { createNotificationSchema } from "./notification.schemas";
import { authorizeRoles } from "../../middleware/auth";

type TargetType = "student" | "student_group" | "teacher" | "classroom";

export const notificationRouter = Router();

notificationRouter.post(
  "/notifications",
  authorizeRoles("ADMIN", "GOVERNMENT", "TEACHER", "PRINCIPAL"),
  validateBody(createNotificationSchema),
  asyncHandler(async (req, res) => {
    const {
      targets: { studentIds, studentGroupIds, teacherIds, classroomIds },
      ...notificationPayload
    } = req.body;

    if (
      req.user?.role === "TEACHER" &&
      req.user.teacher &&
      req.user.teacher.schoolId !== notificationPayload.schoolId
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (req.user?.role === "PRINCIPAL" && req.user.schoolId !== notificationPayload.schoolId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const targetRows: { notificationId: bigint; targetType: TargetType; targetId: bigint }[] = [];

    const notification = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.notification.create({
        data: {
          ...notificationPayload,
          activeFrom: notificationPayload.activeFrom ?? new Date()
        }
      });

      const buildRows = (ids: bigint[] | undefined, targetType: TargetType) => {
        if (!ids) return;
        ids.forEach((id) =>
          targetRows.push({
            notificationId: created.id,
            targetType,
            targetId: id
          })
        );
      };

      buildRows(studentIds, "student");
      buildRows(studentGroupIds, "student_group");
      buildRows(teacherIds, "teacher");
      buildRows(classroomIds, "classroom");

      if (targetRows.length) {
        await tx.notificationTarget.createMany({ data: targetRows });
      }

      return created;
    });

    res.status(201).json({ notification, targets: targetRows.length });
  })
);

notificationRouter.get(
  "/notifications/active",
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const notifications = await prisma.notification.findMany({
      where: {
        activeFrom: { lte: now },
        activeTill: { gte: now }
      },
      include: {
        targets: true
      },
      orderBy: { activeTill: "asc" }
    });
    res.json(notifications);
  })
);
