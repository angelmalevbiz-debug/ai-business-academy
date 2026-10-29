import type { UniverseUnit } from './universe-content';
export type AgeBand = '14-17' | '18+';
export interface Profile {
  level: 'beginner' | 'practitioner';
  goal: 'learn' | 'service' | 'business';
  hours: 2 | 5 | 10;
  ageBand: AgeBand;
}
export interface Member {
  id: string;
  name: string;
  email: string;
  role: 'member' | 'admin';
  ageBand: AgeBand;
  profile: Profile | null;
}
export interface Submission {
  id: string;
  userId: string;
  authorName: string;
  lessonId: string;
  text: string;
  status: 'pending' | 'reviewed' | 'needs_changes';
  feedback: string;
  createdAt: string;
  revision: number;
  history?: { revision: number; text: string; status: string; feedback: string; createdAt: string; reviews: { status: string; feedback: string; reviewer: string; createdAt: string }[] }[];
}
export interface Reply { id: string; authorName: string; body: string; createdAt: string }
export interface Post {
  id: string;
  authorName: string;
  authorRole: 'member' | 'admin' | 'team';
  title: string;
  body: string;
  category: 'question' | 'progress' | 'resource';
  createdAt: string;
  replies: Reply[];
  replyCount: number;
  hasMoreReplies: boolean;
}
export interface ToolRequest { id: string; problem: string; createdAt: string }
export interface AdminMetrics {
  members: number;
  submissions: number;
  pendingReviews: number;
  completedLessons: number;
  toolRequests: number;
}
export interface Workspace {
  user: Member | null;
  completedLessonIds: string[];
  submissions: Submission[];
  posts: Post[];
  bookmarkedPathIds: string[];
  tools: ToolRequest[];
  metrics?: AdminMetrics;
  catalog: PublicCatalog;
  development: Development;
  contentRevisions?: ContentRevision[];
  editorCatalog?: Catalog;
}
export type PublicUniverseUnit = Omit<UniverseUnit, 'question'> & { question: Omit<UniverseUnit['question'], 'answerIndex'> };
export interface Catalog { paths: LearningPath[]; lessons: Lesson[]; universeUnits: UniverseUnit[] }
export interface PublicCatalog { paths: LearningPath[]; lessons: Lesson[]; universeUnits: PublicUniverseUnit[] }
export interface ContentRevision { id: string; kind: 'path' | 'lesson' | 'universe'; targetId: string; version: number; status: 'draft' | 'published'; title: string; payload: LearningPath | Lesson | UniverseUnit; createdAt: string }
export interface PersonalGoal { title: string; why: string; nextAction: string; obstacle: string; ifThen: string; minutes: 5 | 15 | 30; daysPerWeek: number; reminderEnabled: boolean; reminderHour: number }
export interface Development {
  goal: PersonalGoal | null;
  introSeen: boolean;
  unitProgress: { unitId: string; completedAt: string; reviewDueAt: string; reviewCount: number }[];
  reflections: { id: string; unitId: string; text: string; createdAt: string }[];
  dailyActions: { id: string; kind: 'lesson' | 'practice' | 'reflection' | 'review'; referenceId: string; day: string; note: string; createdAt: string }[];
  drafts: { lessonId: string; text: string; updatedAt: string }[];
  weekly: { actions: number; activeDays: number; submittedTasks: number; reviewedTasks: number };
  mentorHints: string[];
  quizFeedback?: { unitId: string; correct: boolean; explanation: string };
}
export interface LearningPath {
  id: string;
  title: string;
  description: string;
  category: string;
  level: string;
  minutes: number;
  lessonIds: string[];
  icon: 'automation' | 'code' | 'business';
  tagline: string;
  color: 'green' | 'purple' | 'orange';
}
export interface Lesson {
  id: string;
  pathId: string;
  title: string;
  minutes: number;
  summary: string;
  sections: { title: string; body: string; bullets?: string[] }[];
  task: string;
  checklist: string[];
  adultOnly?: boolean;
  resourceLinks?: { title: string; url: string }[];
}
export type WorkspaceData = Workspace;
export type User = Member;
export type Path = LearningPath;
