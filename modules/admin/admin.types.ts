// admin module — types.
import type { z } from "zod";
import type { workflowSchema } from "./admin.validation";

export type WorkflowInput = z.infer<typeof workflowSchema>;
