"use client";

import { FaPlus, FaTimes } from "react-icons/fa";
import { inputClass } from "@/components/ui/FormField";
import { cn } from "@/lib/utils";
import { groupItems, groupMatch, isGroup, type Condition, type ConditionGroup, type ConditionItem, type FieldKey, type Match, type RuleVocabulary } from "@/lib/api/whatsapp";
import { BARE_OPS, FIELD_GROUPS, FIELD_WORDS, OP_WORDS, type FieldWords } from "./whatsapp-words";

/*
 * Who a reminder reaches, built from parts: any fact the file knows about a
 * patient, compared any way its kind allows. Each row is one condition
 * (field · comparison · value). The switch at the top says whether every
 * row must hold or one is enough; a box inside combines its rows the other
 * way, which is what "X and Y, or Z" and "X, or Y and Z" both need. The API
 * validates the same shape (custom-rules.ts), so a rule that reads well
 * here is a rule the engine runs.
 */

const UNITS: [string, number][] = [
  ["days", 1],
  ["weeks", 7],
  ["months", 30],
  ["years", 365],
];

/** "7 days" / "2 weeks" / "6 months" / "1 year" from a number of days. */
function splitDays(days: number): { amount: number; unit: string } {
  for (const [unit, size] of [...UNITS].reverse()) {
    if (size > 1 && days % size === 0 && days >= size) return { amount: days / size, unit };
  }
  return { amount: days, unit: "days" };
}

/** A sensible first value for a field, so a new row is valid before it is touched. */
export function defaultCondition(field: FieldKey): Condition {
  const w = FIELD_WORDS[field];
  switch (w.kind) {
    case "number":
      return { field, op: field === "owed" || field === "planned_work" ? "gt" : "gte", value: field === "age" ? 18 : field === "owed" || field === "planned_work" ? 0 : 1, within_days: null };
    case "past":
      return { field, op: field === "last_message" ? "not_within" : "within", value: field === "last_message" ? 7 : 180, within_days: null };
    case "future":
      return { field, op: field === "next_booking" ? "none" : "within", value: field === "next_booking" ? null : 30, within_days: null };
    case "choice":
      return { field, op: "in", value: Array.isArray(w.options) ? [w.options[0][0]] : [], within_days: null };
    case "text":
      return { field, op: "contains", value: "", within_days: null };
    case "history":
      return { field, op: "had", value: [], within_days: null };
  }
}

/** A row of chips the user toggles. */
export function Chips<T extends string | number>({ options, value, onChange, label }: { options: [T, string][]; value: T[]; onChange: (v: T[]) => void; label: (v: T) => string }) {
  return (
    <span className="flex flex-wrap gap-1">
      {options.map(([v]) => {
        const on = value.includes(v);
        return (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== v) : [...value, v])}
            className={cn("press rounded-full border px-2 py-0.5 text-xs", on ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-200 bg-card text-ink-600")}
            aria-pressed={on}
          >
            {label(v)}
          </button>
        );
      })}
    </span>
  );
}

function optionsOf(w: FieldWords, vocabulary: RuleVocabulary | null): [string, string][] {
  if (w.options === "procedures") return (vocabulary?.procedures ?? []).map((p) => [p, p]);
  if (w.options === "doctors") return (vocabulary?.doctors ?? []).map((d) => [d.id, d.name]);
  return w.options ?? [];
}

/** A count of days as "N [days|weeks|months|years]". */
function DaysInput({ days, onChange, min = 1 }: { days: number; onChange: (days: number) => void; min?: number }) {
  const s = splitDays(Math.max(min, days || min));
  const size = UNITS.find(([u]) => u === s.unit)?.[1] ?? 1;
  return (
    <span className="inline-flex items-center gap-2">
      <input type="number" min={1} max={999} value={s.amount} onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1) * size)} className={cn(inputClass, "w-20")} />
      <select
        value={s.unit}
        onChange={(e) => {
          const next = UNITS.find(([u]) => u === e.target.value)?.[1] ?? 1;
          onChange(s.amount * next);
        }}
        className={cn(inputClass, "w-28")}
      >
        {UNITS.map(([u]) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </span>
  );
}

function ConditionRow({ condition, onChange, onRemove, vocabulary }: { condition: Condition; onChange: (c: Condition) => void; onRemove: () => void; vocabulary: RuleVocabulary | null }) {
  const w = FIELD_WORDS[condition.field];
  const ops = OP_WORDS[w.kind];
  const set = (patch: Partial<Condition>) => onChange({ ...condition, ...patch });
  const setField = (field: FieldKey) => onChange(defaultCondition(field));
  const setOp = (op: string) => {
    // The value keeps its shape within a kind, except where the op changes what it means.
    if (w.kind === "number") set({ op, value: op === "between" ? [Number(condition.value) || 0, (Number(condition.value) || 0) + 10] : Array.isArray(condition.value) ? Number(condition.value[0]) : condition.value });
    else if (w.kind === "past" || w.kind === "future") set({ op, value: BARE_OPS.includes(op) ? null : op === "before" || op === "after" ? "" : typeof condition.value === "number" ? condition.value : 30 });
    else if (w.kind === "text") set({ op, value: BARE_OPS.includes(op) ? null : typeof condition.value === "string" ? condition.value : "" });
    else set({ op });
  };
  const n = typeof condition.value === "number" ? condition.value : 0;
  const pair: [number, number] = Array.isArray(condition.value) && typeof condition.value[0] === "number" ? (condition.value as [number, number]) : [0, 0];
  const list = Array.isArray(condition.value) ? (condition.value as string[]) : [];
  const text = typeof condition.value === "string" ? condition.value : "";
  const numInput = (v: number, onNum: (n: number) => void) => <input type="number" min={0} step="any" value={v} onChange={(e) => onNum(Number(e.target.value))} className={cn(inputClass, "w-24")} />;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-ink-50 px-3 py-2 text-sm text-ink-700">
      <select value={condition.field} onChange={(e) => setField(e.target.value as FieldKey)} className={cn(inputClass, "w-56")} aria-label="What about the patient">
        {FIELD_GROUPS.map((g) => (
          <optgroup key={g} label={g}>
            {(Object.keys(FIELD_WORDS) as FieldKey[])
              .filter((k) => FIELD_WORDS[k].group === g)
              .map((k) => (
                <option key={k} value={k}>
                  {FIELD_WORDS[k].label}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <select value={condition.op} onChange={(e) => setOp(e.target.value)} className={cn(inputClass, "w-44")} aria-label="How to compare">
        {ops.map(([op, label]) => (
          <option key={op} value={op}>
            {label}
          </option>
        ))}
      </select>

      {w.kind === "number" &&
        (condition.op === "between" ? (
          <>
            {numInput(pair[0], (a) => set({ value: [a, pair[1]] }))}
            <span>and</span>
            {numInput(pair[1], (b) => set({ value: [pair[0], b] }))}
          </>
        ) : (
          numInput(n, (v) => set({ value: v }))
        ))}
      {w.kind === "number" && w.unit && <span className="text-ink-500">{w.unit}</span>}

      {(w.kind === "past" || w.kind === "future") && (condition.op === "within" || condition.op === "not_within") && <DaysInput days={n} onChange={(days) => set({ value: days })} />}
      {w.kind === "past" && (condition.op === "before" || condition.op === "after") && <input type="date" value={text} onChange={(e) => set({ value: e.target.value })} className={cn(inputClass, "w-44")} />}

      {w.kind === "choice" && <Chips options={optionsOf(w, vocabulary)} value={list} onChange={(v) => set({ value: v })} label={(v) => optionsOf(w, vocabulary).find(([k]) => k === v)?.[1] ?? v} />}

      {w.kind === "text" && !BARE_OPS.includes(condition.op) && <input type="text" value={text} onChange={(e) => set({ value: e.target.value })} className={cn(inputClass, "w-44")} maxLength={120} />}

      {w.kind === "history" && (
        <>
          <Chips options={optionsOf(w, vocabulary)} value={list} onChange={(v) => set({ value: v })} label={(v) => optionsOf(w, vocabulary).find(([k]) => k === v)?.[1] ?? v} />
          {w.options === "doctors" && !vocabulary?.doctors.length && <span className="text-xs text-ink-500">No active doctor on file.</span>}
          <span>in the last</span>
          <select
            value={condition.within_days === null ? "ever" : "window"}
            onChange={(e) => set({ within_days: e.target.value === "ever" ? null : 180 })}
            className={cn(inputClass, "w-28")}
          >
            <option value="ever">ever</option>
            <option value="window">N days…</option>
          </select>
          {condition.within_days !== null && <DaysInput days={condition.within_days} onChange={(days) => set({ within_days: days })} />}
        </>
      )}

      <button type="button" onClick={onRemove} className="ms-auto press rounded-lg p-1 text-ink-400 hover:bg-brick-50 hover:text-brick-700" aria-label={`Remove ${w.label}`}>
        <FaTimes className="text-xs" />
      </button>
    </div>
  );
}

function AddCondition({ onAdd, label = "+ Add a condition…" }: { onAdd: (c: Condition) => void; label?: string }) {
  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) onAdd(defaultCondition(e.target.value as FieldKey));
      }}
      className={cn(inputClass, "max-w-xs")}
      aria-label={label}
    >
      <option value="">{label}</option>
      {FIELD_GROUPS.map((g) => (
        <optgroup key={g} label={g}>
          {(Object.keys(FIELD_WORDS) as FieldKey[])
            .filter((k) => FIELD_WORDS[k].group === g)
            .map((k) => (
              <option key={k} value={k}>
                {FIELD_WORDS[k].label}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

const group = (how: Match, items: Condition[]): ConditionGroup => (how === "any" ? { any: items } : { all: items });

export function ConditionBuilder({
  value,
  match,
  onChange,
  onMatch,
  vocabulary,
}: {
  value: ConditionItem[];
  match: Match;
  onChange: (items: ConditionItem[]) => void;
  onMatch: (match: Match) => void;
  vocabulary: RuleVocabulary | null;
}) {
  const replace = (i: number, item: ConditionItem | null) => onChange(item ? value.map((x, j) => (j === i ? item : x)) : value.filter((_, j) => j !== i));
  // A box combines its rows the other way round from the list it sits in.
  const inner: Match = match === "all" ? "any" : "all";
  return (
    <div className="space-y-2">
      {value.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-700">
          <span>Patients must match</span>
          <select value={match} onChange={(e) => onMatch(e.target.value as Match)} className={cn(inputClass, "w-40")} aria-label="All or any of the conditions">
            <option value="all">all of these</option>
            <option value="any">any of these</option>
          </select>
        </div>
      )}
      {value.map((item, i) =>
        isGroup(item) ? (
          <div key={i} className="space-y-2 rounded-xl border border-dashed border-brand-300 p-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-700">
              <span>{groupMatch(item) === "any" ? "Any of these" : "All of these together"}</span>
              <button type="button" onClick={() => replace(i, null)} className="ms-auto press rounded-lg p-1 text-ink-400 hover:bg-brick-50 hover:text-brick-700" aria-label="Remove the group">
                <FaTimes className="text-xs" />
              </button>
            </div>
            {groupItems(item).map((c, k) => (
              <ConditionRow
                key={k}
                condition={c}
                vocabulary={vocabulary}
                onChange={(next) => replace(i, group(groupMatch(item), groupItems(item).map((x, m) => (m === k ? next : x))))}
                onRemove={() => replace(i, groupItems(item).length > 1 ? group(groupMatch(item), groupItems(item).filter((_, m) => m !== k)) : null)}
              />
            ))}
            <AddCondition label="+ Add to the group…" onAdd={(c) => replace(i, group(groupMatch(item), [...groupItems(item), c]))} />
          </div>
        ) : (
          <ConditionRow key={i} condition={item} vocabulary={vocabulary} onChange={(next) => replace(i, next)} onRemove={() => replace(i, null)} />
        ),
      )}
      <div className="flex flex-wrap items-center gap-2">
        <AddCondition onAdd={(c) => onChange([...value, c])} />
        <button type="button" onClick={() => onChange([...value, group(inner, [defaultCondition("owed"), defaultCondition("last_missed")])])} className="press inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2 py-1 text-xs text-ink-700 hover:bg-ink-50">
          <FaPlus className="text-[10px]" /> {inner === "any" ? "Any-of group" : "All-of group"}
        </button>
      </div>
      {value.length === 0 ? (
        <p className="text-xs text-ink-500">Every patient the trigger concerns. Patients who asked for no WhatsApp are always skipped.</p>
      ) : (
        <p className="text-xs text-ink-500">
          {match === "all" ? "Every row must hold; inside an \"any of\" box, one is enough." : "One row is enough; inside an \"all of\" box, every row must hold."}
        </p>
      )}
    </div>
  );
}
