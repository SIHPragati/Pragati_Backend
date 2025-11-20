import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt, { Secret, SignOptions } from "jsonwebtoken";
import { UserStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { validateBody } from "../../middleware/validateResource";
import { asyncHandler } from "../../utils/asyncHandler";
import { authenticate, authorizeRoles } from "../../middleware/auth";
import { createUserSchema, loginSchema, updateUserStatusSchema } from "./auth.schemas";
import { env } from "../../config/env";

export const authRouter = Router();

authRouter.post(
  "/login",
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { student: true, teacher: true }
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.passwordHash);

    if (!match) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (user.status !== "active") {
      return res.status(403).json({ message: "User is blocked" });
    }

    const { passwordHash: _passwordHash, ...safeUser } = user;
    const toStringId = (value?: bigint | null) => (value === undefined || value === null ? null : value.toString());
    const userId = safeUser.id.toString();
    const studentId = toStringId(safeUser.studentId);
    const teacherId = toStringId(safeUser.teacherId);
    const schoolId = toStringId(safeUser.schoolId);

    const tokenPayload = {
      sub: userId,
      role: safeUser.role,
      studentId,
      teacherId,
      schoolId
    };
    const token = jwt.sign(tokenPayload, env.jwtSecret as Secret, { expiresIn: env.jwtExpiresIn } as SignOptions);

    res.json({
      token,
      expiresIn: env.jwtExpiresIn,
      userId,
      role: safeUser.role,
      studentId,
      teacherId,
      schoolId
    });
  })
);

authRouter.post(
  "/users",
  authenticate,
  authorizeRoles("ADMIN", "PRINCIPAL"),
  validateBody(createUserSchema),
  asyncHandler(async (req, res) => {
    const { password, ...rest } = req.body;
    
    // Principals can only create STUDENT and TEACHER accounts in their own school
    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId) {
        return res.status(400).json({ message: "Principal account must be linked to a school" });
      }
      
      // Can only create student or teacher accounts
      if (rest.role !== "STUDENT" && rest.role !== "TEACHER") {
        return res.status(403).json({ message: "Principals can only create STUDENT and TEACHER user accounts" });
      }
      
      // Must be for their school
      if (rest.schoolId && rest.schoolId !== req.user.schoolId) {
        return res.status(403).json({ message: "Principals can only create users for their own school" });
      }
      
      // If studentId provided, verify it belongs to their school
      if (rest.studentId) {
        const student = await prisma.student.findUnique({
          where: { id: rest.studentId },
          select: { schoolId: true }
        });
        
        if (!student) {
          return res.status(404).json({ message: "Student not found" });
        }
        
        if (student.schoolId !== req.user.schoolId) {
          return res.status(403).json({ message: "Cannot create user for student from another school" });
        }
      }
      
      // If teacherId provided, verify it belongs to their school
      if (rest.teacherId) {
        const teacher = await prisma.teacher.findUnique({
          where: { id: rest.teacherId },
          select: { schoolId: true }
        });
        
        if (!teacher) {
          return res.status(404).json({ message: "Teacher not found" });
        }
        
        if (teacher.schoolId !== req.user.schoolId) {
          return res.status(403).json({ message: "Cannot create user for teacher from another school" });
        }
      }
      
      // Ensure schoolId is set
      rest.schoolId = req.user.schoolId;
    }
    
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        ...rest,
        passwordHash,
        status: "active"
      }
    });

    const { passwordHash: _passwordHash, ...safeUser } = user;
    res.status(201).json(safeUser);
  })
);

authRouter.get(
  "/users",
  authenticate,
  authorizeRoles("ADMIN", "GOVERNMENT", "PRINCIPAL"),
  asyncHandler(async (req, res) => {
    let whereClause: { schoolId?: bigint } = {};
    
    // Principals can only see users from their own school
    if (req.user?.role === "PRINCIPAL") {
      if (!req.user.schoolId) {
        return res.status(400).json({ message: "Principal account must be linked to a school" });
      }
      whereClause.schoolId = req.user.schoolId;
    }
    
    const users = await prisma.user.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        phoneNumber: true,
        role: true,
        status: true,
        studentId: true,
        teacherId: true,
        schoolId: true,
        createdAt: true
      }
    });

    res.json(users);
  })
);

authRouter.patch(
  "/users/:id/status",
  authenticate,
  authorizeRoles("ADMIN"),
  validateBody(updateUserStatusSchema),
  asyncHandler(async (req, res) => {
    const userId = BigInt(req.params.id);
    const { status } = req.body as { status: UserStatus };

    const user = await prisma.user.update({
      where: { id: userId },
      data: { status }
    });

    const { passwordHash: _passwordHash, ...safeUser } = user;
    res.json(safeUser);
  })
);
