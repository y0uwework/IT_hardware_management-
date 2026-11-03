// notifications module — request validation (zod schemas).
import { z } from "zod";

export const markReadSchema = z.object({ id: z.union([z.literal("all"), z.coerce.number().int().positive()]) });
