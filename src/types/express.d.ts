import { Student, Teacher, User } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: User & { student?: Student | null; teacher?: Teacher | null };
      deviceAuth?: boolean;
    }
  }
}

export {};
