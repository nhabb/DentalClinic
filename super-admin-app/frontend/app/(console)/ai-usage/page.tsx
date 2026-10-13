"use client";

import { useState } from "react";
import { FaRobot, FaCoins, FaHospital, FaUsers, FaTimes } from "react-icons/fa";
import { PageHeader } from "@/components/console/PageHeader";
import { DataTable, type Column } from "@/components/console/DataTable";
import { ErrorNote } from "@/components/console/ErrorNote";
import { ActiveBadge, RoleBadge } from "@/components/console/StatusBadge";
import { StatsCard } from "@/components/ui/StatsCard";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useApi } from "@/lib/useApi";
import { formatNumber, timeAgo } from "@/lib/format";
import type { AccountUsage, AccountUsageDetail, ClinicUsage, ClinicUsageDetail, QuestionUsage, UsageOverview } from "@/lib/types";
import { formatDate } from "@/lib/format";

const WINDOWS = [7, 30, 90] as const;

/** Dollars with enough decimals to show sub-cent usage without rounding it to zero. */
const money = (usd: number) => (usd < 1 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`);

const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 10_000 ? `${(n / 1_000).toFixed(1)}k` : formatNumber(n));

/**
 * OpenAI spend of the clinic AI assistant: per clinic, then per account of
 * the clinic you pick. Costs are estimates from list prices per model.
 */
export default function AiUsagePage() {
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const [selected, setSelected] = useState<ClinicUsage | null>(null);
  const [account, setAccount] = useState<AccountUsage | null>(null);

  const overview = useApi<UsageOverview>(`/ai-usage?days=${days}`);
  const detail = useApi<ClinicUsageDetail>(selected ? `/ai-usage/organizations/${selected.organization.id}?days=${days}` : null);
  const questions = useApi<AccountUsageDetail>(account ? `/ai-usage/accounts/${account.user.id}?days=${days}` : null);

  const pickClinic = (c: ClinicUsage) => {
    setSelected(c);
    setAccount(null);
  };

  const clinicColumns: Column<ClinicUsage>[] = [
    {
      key: "clinic",
      header: "Clinic",
      render: (c) => (
        <span className="block min-w-0">
          <span className="block truncate font-semibold text-ink-900">{c.organization.name}</span>
          <span className="block truncate text-xs text-ink-400">{c.organization.slug}</span>
        </span>
      ),
    },
    { key: "status", header: "Status", render: (c) => <ActiveBadge active={c.organization.is_active} /> },
    {
      key: "accounts",
      header: "Accounts",
      align: "end",
      render: (c) => (
        <span title={`${c.accounts.staff} staff of ${c.accounts.total} accounts`}>
          {formatNumber(c.accounts.total)} <span className="text-ink-400">({c.accounts.staff} staff)</span>
        </span>
      ),
    },
    { key: "ai_users", header: "Using AI", align: "end", render: (c) => formatNumber(c.accounts.ai_users) },
    { key: "questions", header: "Questions", align: "end", render: (c) => formatNumber(c.questions) },
    { key: "in", header: "Tokens in", align: "end", render: (c) => tokens(c.prompt_tokens) },
    { key: "out", header: "Tokens out", align: "end", render: (c) => tokens(c.completion_tokens) },
    { key: "cost", header: "Est. cost", align: "end", render: (c) => <span className="font-semibold">{money(c.estimated_cost_usd)}</span> },
    { key: "last", header: "Last used", align: "end", render: (c) => <span className="text-ink-500">{c.last_used_at ? timeAgo(c.last_used_at) : "never"}</span> },
  ];

  const accountColumns: Column<AccountUsage>[] = [
    {
      key: "name",
      header: "Account",
      render: (a) => (
        <span className="block min-w-0">
          <span className="block truncate font-semibold text-ink-900">
            {a.user.first_name} {a.user.last_name}
          </span>
          <span className="block truncate text-xs text-ink-400">{a.user.email ?? "no email"}</span>
        </span>
      ),
    },
    { key: "role", header: "Role", render: (a) => <RoleBadge role={a.user.role} /> },
    { key: "questions", header: "Questions", align: "end", render: (a) => formatNumber(a.questions) },
    { key: "rounds", header: "Model calls", align: "end", render: (a) => formatNumber(a.rounds) },
    { key: "tools", header: "Tool calls", align: "end", render: (a) => formatNumber(a.tool_calls) },
    { key: "in", header: "Tokens in", align: "end", render: (a) => tokens(a.prompt_tokens) },
    { key: "out", header: "Tokens out", align: "end", render: (a) => tokens(a.completion_tokens) },
    { key: "cost", header: "Est. cost", align: "end", render: (a) => <span className="font-semibold">{money(a.estimated_cost_usd)}</span> },
    { key: "last", header: "Last used", align: "end", render: (a) => <span className="text-ink-500">{a.last_used_at ? timeAgo(a.last_used_at) : "never"}</span> },
  ];

  const questionColumns: Column<QuestionUsage>[] = [
    { key: "when", header: "Asked", render: (q) => <span title={new Date(q.asked_at).toLocaleString()}>{formatDate(q.asked_at)} · {new Date(q.asked_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> },
    { key: "model", header: "Model", render: (q) => <span className="font-mono text-xs text-ink-600">{q.model}</span> },
    { key: "rounds", header: "Model calls", align: "end", render: (q) => formatNumber(q.rounds) },
    { key: "tools", header: "Tool calls", align: "end", render: (q) => formatNumber(q.tool_calls) },
    { key: "in", header: "Tokens in", align: "end", render: (q) => tokens(q.prompt_tokens) },
    { key: "out", header: "Tokens out", align: "end", render: (q) => tokens(q.completion_tokens) },
    { key: "time", header: "Took", align: "end", render: (q) => `${(q.duration_ms / 1000).toFixed(1)}s` },
    { key: "cost", header: "Est. cost", align: "end", render: (q) => <span className="font-semibold">{money(q.estimated_cost_usd)}</span> },
  ];

  const totals = overview.data?.totals;

  return (
    <>
      <PageHeader
        title="AI usage"
        subtitle="What the clinic assistant costs, per clinic and per account. Costs are estimates from OpenAI list prices."
        actions={
          <div className="flex gap-1 rounded-xl bg-ink-100 p-1">
            {WINDOWS.map((w) => (
              <Button key={w} size="sm" variant={days === w ? "default" : "ghost"} onClick={() => setDays(w)}>
                {w} days
              </Button>
            ))}
          </div>
        }
      />

      <main className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
        {overview.error && <ErrorNote message={overview.error} />}
        {overview.loading && !overview.data && <LoadingSpinner label="Loading usage" />}

        {totals && (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatsCard icon={FaRobot} tone="brand" value={formatNumber(totals.questions)} label="Questions answered" hint={`last ${days} days`} />
            <StatsCard
              icon={FaCoins}
              tone="honey"
              value={money(totals.estimated_cost_usd)}
              label="Estimated spend"
              hint={`${tokens(totals.prompt_tokens)} in · ${tokens(totals.completion_tokens)} out`}
            />
            <StatsCard icon={FaHospital} tone="leaf" value={formatNumber(totals.clinics_using)} label="Clinics using the assistant" hint={`of ${overview.data?.clinics.length ?? 0}`} />
            <StatsCard icon={FaUsers} tone="clay" value={formatNumber(totals.accounts_using)} label="Accounts using it" />
          </section>
        )}

        {overview.data && (
          <Card>
            <CardHeader title="Per clinic" subtitle="Click a clinic to see each account" icon={<FaHospital />} />
            <DataTable
              columns={clinicColumns}
              rows={overview.data.clinics}
              rowKey={(c) => c.organization.id}
              onRowClick={pickClinic}
              empty={<EmptyState icon={FaHospital} title="No clinics yet" />}
            />
          </Card>
        )}

        {selected && (
          <Card>
            <CardHeader
              title={`${selected.organization.name}: per account`}
              subtitle={detail.data ? `${detail.data.totals.accounts_using} account(s) used the assistant in the last ${days} days · ${money(detail.data.totals.estimated_cost_usd)} estimated` : undefined}
              icon={<FaUsers />}
              action={
                <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setAccount(null); }} aria-label="Close">
                  <FaTimes />
                </Button>
              }
            />
            {detail.error && (
              <CardBody>
                <ErrorNote message={detail.error} />
              </CardBody>
            )}
            {detail.loading && !detail.data && (
              <CardBody>
                <LoadingSpinner label="Loading accounts" />
              </CardBody>
            )}
            {detail.data && (
              <DataTable
                columns={accountColumns}
                rows={detail.data.accounts}
                rowKey={(a) => a.user.id}
                onRowClick={(a) => setAccount(a)}
                empty={<EmptyState icon={FaRobot} title="Nobody at this clinic used the assistant in this window" />}
              />
            )}
          </Card>
        )}

        {account && (
          <Card>
            <CardHeader
              title={`${account.user.first_name} ${account.user.last_name}: per question`}
              subtitle={
                questions.data
                  ? `${questions.data.questions.length} question(s) in the last ${days} days · ${money(questions.data.totals.estimated_cost_usd)} estimated. The question text is not stored.`
                  : "The question text is not stored."
              }
              icon={<FaRobot />}
              action={
                <Button variant="ghost" size="sm" onClick={() => setAccount(null)} aria-label="Close">
                  <FaTimes />
                </Button>
              }
            />
            {questions.error && (
              <CardBody>
                <ErrorNote message={questions.error} />
              </CardBody>
            )}
            {questions.loading && !questions.data && (
              <CardBody>
                <LoadingSpinner label="Loading questions" />
              </CardBody>
            )}
            {questions.data && (
              <DataTable
                columns={questionColumns}
                rows={questions.data.questions}
                rowKey={(q) => q.id}
                empty={<EmptyState icon={FaRobot} title="No questions in this window" />}
              />
            )}
          </Card>
        )}
      </main>
    </>
  );
}
