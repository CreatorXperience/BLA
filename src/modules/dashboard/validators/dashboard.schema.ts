import { z } from "zod";

export const DashboardRangeSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export type DashboardRange = z.infer<typeof DashboardRangeSchema>;
