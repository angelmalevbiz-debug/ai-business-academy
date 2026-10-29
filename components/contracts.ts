export type WorkspaceMutator = (payload: Record<string, unknown>, message?: string, options?: { silent?: boolean }) => Promise<boolean>;
