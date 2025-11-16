import dotenv from "dotenv";
import path from "path";

const envFile = process.env.NODE_ENV === "test" ? ".env.test" : ".env";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const required = ["DATABASE_URL", "AUTH_JWT_SECRET"] as const;

required.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required env var ${key}`);
  }
});

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseInt(process.env.PORT ?? "4000", 10),
  databaseUrl: process.env.DATABASE_URL as string,
  attendanceDeviceKey: process.env.ATTENDANCE_DEVICE_KEY,
  jwtSecret: process.env.AUTH_JWT_SECRET as string,
  jwtExpiresIn: process.env.AUTH_JWT_EXPIRES_IN ?? "12h"
};
