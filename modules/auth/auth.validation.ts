// auth module — request validation (zod schemas).
import { z } from "zod";

export const loginSchema = z.object({
  employeeCode: z.string().trim().min(1, "Employee code is required").max(50),
  password: z.string().max(200).optional(),
});
