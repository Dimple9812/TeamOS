import { z } from "zod";
import { PRIORITIES } from "../store/types.js";

export type AiSource = "ai" | "template";

export const suggestedTask = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(400).default(""),
  priority: z.enum(PRIORITIES).default("medium"),
  /** Rough size in working days, used to spread due dates. */
  estimateDays: z.number().int().min(1).max(20).default(1),
});
export type SuggestedTask = z.infer<typeof suggestedTask>;

export const breakdownSchema = z.object({ tasks: z.array(suggestedTask).min(3).max(10) });

export const summaryTextSchema = z.object({
  headline: z.string().trim().min(5).max(200),
  highlights: z.array(z.string().trim().min(3).max(200)).max(5),
  risks: z.array(z.string().trim().min(3).max(200)).max(5),
  next: z.array(z.string().trim().min(3).max(200)).max(5),
});
export type SummaryText = z.infer<typeof summaryTextSchema>;

export const standupTextSchema = z.object({ text: z.string().trim().min(10).max(1500) });

export interface ProjectStats {
  total: number;
  todo: number;
  inProgress: number;
  review: number;
  done: number;
  overdue: number;
  dueThisWeek: number;
  completedThisWeek: number;
  percentDone: number;
}

export interface ProjectSummary extends SummaryText {
  stats: ProjectStats;
  source: AiSource;
  generatedAt: string;
}

export interface StandupItem {
  taskId: string;
  title: string;
  projectName: string;
  detail?: string;
}

export interface Standup {
  yesterday: StandupItem[];
  today: StandupItem[];
  blockers: StandupItem[];
  text: string;
  source: AiSource;
  generatedAt: string;
}
