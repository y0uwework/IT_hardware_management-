// approvals module — request validation (zod schemas).
import { z } from "zod";
import { paginationSchema } from "../../shared/validation";

export const approvalListSchema = paginationSchema.extend({ status: z.string().max(30).optional() });

export const approvalActionSchema = z.object({
  comments: z.string().trim().max(4000).optional(),
});
