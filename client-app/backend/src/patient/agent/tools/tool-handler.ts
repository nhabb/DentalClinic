import type { RequestUser } from '../../../shared/common/guards/jwt-auth.guard';
import type { ToolArgs } from '../tool-args';

/** What a tool knows about the request it runs in. */
export interface ToolContext {
  user: RequestUser;
}

/** One tool: typed arguments in, plain data out (the runner serializes it). */
export type ToolHandler = (
  args: ToolArgs,
  ctx: ToolContext,
) => Promise<unknown>;

/** The handlers of one area, keyed by tool name (see agent.tools.ts). */
export type ToolHandlers = Readonly<Record<string, ToolHandler>>;

/** A tool declining to act for a reason the model should hear. */
export class ToolRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolRefusedError';
  }
}

/** Today as YYYY-MM-DD, the format the services and the model use. */
export const todayIso = (): string => new Date().toISOString().split('T')[0];
