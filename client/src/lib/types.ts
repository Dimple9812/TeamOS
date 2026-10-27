export type Role = "owner" | "admin" | "member" | "viewer";
export type TaskStatus = "todo" | "in_progress" | "review" | "done";
export type Priority = "low" | "medium" | "high" | "urgent";

export const STATUSES: TaskStatus[] = ["todo", "in_progress", "review", "done"];
export const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  review: "In review",
  done: "Done",
};
export const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: "var(--color-st-todo)",
  in_progress: "var(--color-st-progress)",
  review: "var(--color-st-review)",
  done: "var(--color-st-done)",
};
export const PRIORITY_LABEL: Record<Priority, string> = { urgent: "Urgent", high: "High", medium: "Medium", low: "Low" };

export interface User {
  id: string;
  name: string;
  email: string;
  isDemo: boolean;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: Role;
  memberCount: number;
  projectCount: number;
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
}

export interface WorkspaceDetails {
  id: string;
  name: string;
  role: Role;
  inviteCode: string | null;
  members: Member[];
}

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

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  color: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  stats?: ProjectStats;
}

export interface Task {
  id: string;
  workspaceId: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string | null;
  dueDate: string | null;
  labels: string[];
  order: number;
  createdBy: string;
  completedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  taskId: string;
  projectId: string;
  workspaceId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface Activity {
  id: string;
  workspaceId: string;
  projectId: string | null;
  taskId: string | null;
  actorId: string;
  actorName: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface PresenceUser {
  userId: string;
  name: string;
  projectId: string | null;
}

export type AiSource = "ai" | "template";

export interface SuggestedTask {
  title: string;
  description: string;
  priority: Priority;
  estimateDays: number;
}

export interface ProjectSummary {
  headline: string;
  highlights: string[];
  risks: string[];
  next: string[];
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
  note?: string | null;
  generatedAt: string;
}

export const canEdit = (role: Role | undefined) => role === "owner" || role === "admin" || role === "member";
export const canManage = (role: Role | undefined) => role === "owner" || role === "admin";
