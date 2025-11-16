import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { ZodError } from "zod";
import { apiRouter } from "./routes";

// Ensure BigInt IDs serialize cleanly in JSON responses
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function toJSON() {
  return this.toString();
};

export const createApp = () => {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(morgan("dev"));
  app.use("/api", apiRouter);
  app.use((_req, res) => {
    res.status(404).json({ message: "Route not found" });
  });
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ message: "Validation failed", errors: err.flatten() });
    }
    res.status(500).json({ message: err.message });
  });
  return app;
};
