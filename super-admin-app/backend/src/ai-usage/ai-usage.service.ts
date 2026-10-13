import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * OpenAI list prices in USD per million tokens, by model. Estimates only:
 * prices change and the clinic app may switch model; unknown models fall back
 * to the current default so the page never shows a blank.
 */
const PRICE_PER_MILLION: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
};
const DEFAULT_PRICE = PRICE_PER_MILLION['gpt-4o-mini'];

export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const price = PRICE_PER_MILLION[model] ?? DEFAULT_PRICE;
  return (promptTokens / 1_000_000) * price.input + (completionTokens / 1_000_000) * price.output;
}

const STAFF_ROLES = ['doctor', 'secretary', 'admin'];

export interface UsageTotals {
  questions: number;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost_usd: number;
}

export interface ClinicUsage extends UsageTotals {
  organization: { id: string; name: string; slug: string; is_active: boolean };
  /** Accounts of the clinic: everyone, staff only, and those who used the assistant in the window. */
  accounts: { total: number; staff: number; ai_users: number };
  last_used_at: Date | null;
}

export interface AccountUsage extends UsageTotals {
  user: { id: string; first_name: string; last_name: string; email: string | null; role: string; is_active: boolean };
  rounds: number;
  tool_calls: number;
  last_used_at: Date | null;
}

export interface UsageOverview {
  days: number;
  since: Date;
  totals: UsageTotals & { clinics_using: number; accounts_using: number };
  clinics: ClinicUsage[];
}

/** One answered question. The text is never stored: it can carry patient identifiers. */
export interface QuestionUsage {
  id: string;
  asked_at: Date;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  rounds: number;
  tool_calls: number;
  duration_ms: number;
  estimated_cost_usd: number;
}

export interface AccountUsageDetail {
  days: number;
  since: Date;
  user: AccountUsage['user'] & { organization: ClinicUsage['organization'] };
  totals: UsageTotals;
  /** Most recent first, at most QUESTIONS_LIMIT. */
  questions: QuestionUsage[];
}

/** Enough rows to audit a heavy user without paging; the window bounds it anyway. */
export const QUESTIONS_LIMIT = 500;

export interface ClinicUsageDetail {
  days: number;
  since: Date;
  organization: ClinicUsage['organization'];
  totals: UsageTotals & { accounts_using: number };
  accounts: AccountUsage[];
}

const zero = (): UsageTotals => ({ questions: 0, prompt_tokens: 0, completion_tokens: 0, estimated_cost_usd: 0 });

function add(into: UsageTotals, model: string, questions: number, promptTokens: number, completionTokens: number): void {
  into.questions += questions;
  into.prompt_tokens += promptTokens;
  into.completion_tokens += completionTokens;
  into.estimated_cost_usd += estimateCostUsd(model, promptTokens, completionTokens);
}

const since = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/** Token usage of the AI assistant, per clinic and per account, from the agent_usage log. */
@Injectable()
export class AiUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(days: number): Promise<UsageOverview> {
    const from = since(days);
    const [orgs, usage, aiUsers, allAccounts, staffAccounts] = await Promise.all([
      this.prisma.organizations.findMany({
        select: { id: true, name: true, slug: true, is_active: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.agent_usage.groupBy({
        by: ['organization_id', 'model'],
        where: { created_at: { gte: from } },
        _count: { _all: true },
        _sum: { prompt_tokens: true, completion_tokens: true },
        _max: { created_at: true },
      }),
      this.prisma.agent_usage.groupBy({
        by: ['organization_id', 'user_id'],
        where: { created_at: { gte: from } },
      }),
      this.prisma.users.groupBy({ by: ['organization_id'], _count: { _all: true } }),
      this.prisma.users.groupBy({
        by: ['organization_id'],
        where: { role: { in: STAFF_ROLES } },
        _count: { _all: true },
      }),
    ]);

    const countByOrg = (rows: { organization_id: bigint | null; _count: { _all: number } }[]) =>
      new Map(rows.filter((r) => r.organization_id !== null).map((r) => [String(r.organization_id), r._count._all]));
    const totalAccounts = countByOrg(allAccounts);
    const staff = countByOrg(staffAccounts);
    const aiUsersByOrg = new Map<string, number>();
    for (const row of aiUsers) {
      const key = String(row.organization_id);
      aiUsersByOrg.set(key, (aiUsersByOrg.get(key) ?? 0) + 1);
    }

    const clinics: ClinicUsage[] = orgs.map((o) => ({
      organization: { id: String(o.id), name: o.name, slug: o.slug, is_active: o.is_active },
      accounts: {
        total: totalAccounts.get(String(o.id)) ?? 0,
        staff: staff.get(String(o.id)) ?? 0,
        ai_users: aiUsersByOrg.get(String(o.id)) ?? 0,
      },
      ...zero(),
      last_used_at: null,
    }));
    const byOrg = new Map(clinics.map((c) => [c.organization.id, c]));
    for (const row of usage) {
      const clinic = byOrg.get(String(row.organization_id));
      if (!clinic) continue;
      add(clinic, row.model, row._count._all, row._sum.prompt_tokens ?? 0, row._sum.completion_tokens ?? 0);
      const last = row._max.created_at;
      if (last && (!clinic.last_used_at || last > clinic.last_used_at)) clinic.last_used_at = last;
    }

    const totals = { ...zero(), clinics_using: 0, accounts_using: aiUsers.length };
    for (const c of clinics) {
      totals.questions += c.questions;
      totals.prompt_tokens += c.prompt_tokens;
      totals.completion_tokens += c.completion_tokens;
      totals.estimated_cost_usd += c.estimated_cost_usd;
      if (c.questions > 0) totals.clinics_using += 1;
    }
    clinics.sort((a, b) => b.questions - a.questions || a.organization.name.localeCompare(b.organization.name));
    return { days, since: from, totals, clinics };
  }

  async account(userId: bigint, days: number): Promise<AccountUsageDetail> {
    const from = since(days);
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        role: true,
        is_active: true,
        organization: { select: { id: true, name: true, slug: true, is_active: true } },
      },
    });
    if (!user?.organization) throw new NotFoundException(`Account ${userId} not found`);

    const rows = await this.prisma.agent_usage.findMany({
      where: { user_id: userId, created_at: { gte: from } },
      orderBy: { created_at: 'desc' },
      take: QUESTIONS_LIMIT,
    });
    const questions: QuestionUsage[] = rows.map((r) => ({
      id: String(r.id),
      asked_at: r.created_at,
      model: r.model,
      prompt_tokens: r.prompt_tokens,
      completion_tokens: r.completion_tokens,
      rounds: r.rounds,
      tool_calls: r.tool_calls,
      duration_ms: r.duration_ms,
      estimated_cost_usd: estimateCostUsd(r.model, r.prompt_tokens, r.completion_tokens),
    }));
    const totals = zero();
    for (const q of questions) add(totals, q.model, 1, q.prompt_tokens, q.completion_tokens);
    return {
      days,
      since: from,
      user: {
        id: String(user.id),
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        organization: { ...user.organization, id: String(user.organization.id) },
      },
      totals,
      questions,
    };
  }

  async clinic(organizationId: bigint, days: number): Promise<ClinicUsageDetail> {
    const from = since(days);
    const org = await this.prisma.organizations.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, slug: true, is_active: true },
    });
    if (!org) throw new NotFoundException(`Organization ${organizationId} not found`);

    const usage = await this.prisma.agent_usage.groupBy({
      by: ['user_id', 'model'],
      where: { organization_id: organizationId, created_at: { gte: from } },
      _count: { _all: true },
      _sum: { prompt_tokens: true, completion_tokens: true, rounds: true, tool_calls: true },
      _max: { created_at: true },
    });
    const userIds = [...new Set(usage.map((u) => u.user_id))];
    const users = await this.prisma.users.findMany({
      where: { id: { in: userIds } },
      select: { id: true, first_name: true, last_name: true, email: true, role: true, is_active: true },
    });
    const byUser = new Map<string, AccountUsage>(
      users.map((u) => [
        String(u.id),
        {
          user: { ...u, id: String(u.id) },
          ...zero(),
          rounds: 0,
          tool_calls: 0,
          last_used_at: null,
        },
      ]),
    );
    for (const row of usage) {
      const account = byUser.get(String(row.user_id));
      if (!account) continue;
      add(account, row.model, row._count._all, row._sum.prompt_tokens ?? 0, row._sum.completion_tokens ?? 0);
      account.rounds += row._sum.rounds ?? 0;
      account.tool_calls += row._sum.tool_calls ?? 0;
      const last = row._max.created_at;
      if (last && (!account.last_used_at || last > account.last_used_at)) account.last_used_at = last;
    }
    const accounts = [...byUser.values()].sort((a, b) => b.questions - a.questions);
    const totals = { ...zero(), accounts_using: accounts.length };
    for (const a of accounts) {
      totals.questions += a.questions;
      totals.prompt_tokens += a.prompt_tokens;
      totals.completion_tokens += a.completion_tokens;
      totals.estimated_cost_usd += a.estimated_cost_usd;
    }
    return {
      days,
      since: from,
      organization: { id: String(org.id), name: org.name, slug: org.slug, is_active: org.is_active },
      totals,
      accounts,
    };
  }
}
