import { Router } from "express";
import { healthRouter } from "./health.route";
import { coreRouter } from "../modules/core/core.router";
import { enrollmentRouter } from "../modules/enrollment/enrollment.router";
import { attendanceRouter } from "../modules/attendance/attendance.router";
import { assessmentRouter } from "../modules/assessments/assessment.router";
import { notificationRouter, publicNotificationRouter } from "../modules/notifications/notification.router";
import { authRouter } from "../modules/auth/auth.router";
import { timetableRouter } from "../modules/timetables/timetable.router";
import { teacherRouter } from "../modules/teachers/teacher.router";
import { reportsRouter } from "../modules/reports/reports.router";
import { complaintsRouter } from "../modules/complaints/complaints.router";
import { authenticate } from "../middleware/auth";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/communications", publicNotificationRouter);
apiRouter.use(authenticate);
apiRouter.use("/core", coreRouter);
apiRouter.use("/enrollment", enrollmentRouter);
apiRouter.use("/attendance", attendanceRouter);
apiRouter.use("/assessments", assessmentRouter);
apiRouter.use("/communications", notificationRouter);
apiRouter.use("/timetables", timetableRouter);
apiRouter.use("/teachers", teacherRouter);
apiRouter.use("/reports", reportsRouter);
apiRouter.use("/complaints", complaintsRouter);
