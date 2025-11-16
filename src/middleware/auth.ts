import { NextFunction, Request, Response } from "express";
import { UserRole } from "@prisma/client";
import jwt, { JwtPayload, TokenExpiredError } from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";

interface AccessTokenClaims extends JwtPayload {
  sub: string;
  role: UserRole;
}

const extractBearerToken = (header?: string | null) => {
  if (!header) {
    return null;
  }
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !value) {
    return null;
  }
  return value;
};

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const deviceKeyHeader = req.header("x-device-key");
  const isAttendanceDeviceRequest = Boolean(
    env.attendanceDeviceKey &&
      deviceKeyHeader &&
      deviceKeyHeader === env.attendanceDeviceKey &&
      req.method === "POST" &&
      req.path.startsWith("/attendance/sessions")
  );

  if (isAttendanceDeviceRequest) {
    req.deviceAuth = true;
    return next();
  }

  try {
    const token = extractBearerToken(req.header("authorization"));

    if (!token) {
      return res.status(401).json({ message: "Missing or invalid Authorization header" });
    }

    let claims: AccessTokenClaims;
    try {
      claims = jwt.verify(token, env.jwtSecret) as AccessTokenClaims;
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        return res.status(401).json({ message: "Token expired" });
      }
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    if (!claims.sub) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    const user = await prisma.user.findUnique({
      where: { id: BigInt(claims.sub) },
      include: { student: true, teacher: true }
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid user" });
    }

    if (user.status !== "active") {
      return res.status(403).json({ message: "User is blocked" });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export const authorizeRoles = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    next();
  };
};
