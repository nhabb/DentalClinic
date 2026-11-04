"use client";

import { useEffect, useRef, useState } from "react";
import { FaCheck, FaChevronDown, FaMagic, FaPaperPlane, FaUsers } from "react-icons/fa";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/FormField";
import { errorText } from "@/lib/api/request";
import { chatCustomReminder, previewAudience, type AudiencePreview, type AudienceQuery, type ChatProposal, type ChatTurn } from "@/lib/api/whatsapp";
import { cn } from "@/lib/utils";

/*
 * The conversation that builds a reminder, and the card that lets a
 * non-coder verify what the assistant understood.
 *
 * The clinic says what it wants in its own words. The assistant asks back
 * when the wish could mean two things ("the same tooth, or any crown?"),
 * then proposes the parts: when, who, the wording. When "who" is more than
 * the condition menu can say, it comes as a query the assistant wrote,
 * shown here as one sentence and a few plain steps with the count and the
 * first names it reaches today, never as SQL (that sits folded under
 * "technical details"). Nothing is saved by talking; the admin reads,
 * changes what they like, and presses Add.
 */

export function ReminderChat({ onProposal }: { onProposal: (draft: ChatProposal, note: string) => void }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [turns, busy]);

  const send = async () => {
    const text = input.trim();
    if (text.length < 3 || busy) return;
    const next: ChatTurn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setInput("");
    setError("");
    setBusy(true);
    try {
      const reply = await chatCustomReminder(next);
      setTurns([...next, { role: "assistant", content: reply.text }]);
      if (reply.kind === "proposal" && reply.draft) onProposal(reply.draft, reply.text);
    } catch (err) {
      setError(errorText(err, "The assistant did not answer; try again or fill the parts by hand."));
      setTurns(turns);
      setInput(text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <FaMagic className="text-brand-700" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wide text-brand-800">Tell the assistant what you want</span>
      </div>
      {turns.length > 0 && (
        <div className="mb-2 max-h-64 space-y-2 overflow-y-auto pe-1">
          {turns.map((t, i) => (
            <div key={i} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
              <p className={cn("max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm", t.role === "user" ? "rounded-br-sm bg-brand-600 text-white" : "rounded-bl-sm bg-card text-ink-800 ring-1 ring-ink-200")}>{t.content}</p>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <p className="rounded-2xl rounded-bl-sm bg-card px-3 py-2 text-sm text-ink-500 ring-1 ring-ink-200">Thinking…</p>
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={turns.length ? 1 : 2}
          className={cn(inputClass, "resize-y")}
          placeholder={turns.length ? "Answer, or change your mind…" : "Patients who had a root canal but no crown on that tooth, remind them on 1 December · A gift a week before their birthday, men only · Every Monday, remind the doctors to check the stock"}
          disabled={busy}
          autoFocus
        />
        <Button size="sm" onClick={() => void send()} disabled={busy || input.trim().length < 3}>
          <FaPaperPlane className="me-2" />
          Send
        </Button>
      </div>
      <p className="mt-2 text-xs text-ink-500">The assistant may ask you a question first. Talking saves nothing: check the parts below, change anything, then add it.</p>
      {error && <p className="mt-2 rounded-lg border border-brick-200 bg-brick-50 px-3 py-2 text-xs text-brick-800">{error}</p>}
    </div>
  );
}

/** Who a query reaches, for someone who will never read SQL: the sentence, the steps, the count and the names, and the query folded away. */
export function AudienceCard({ audience, preview, onClear }: { audience: AudienceQuery; preview: AudiencePreview | null; onClear?: () => void }) {
  const [loaded, setLoaded] = useState<AudiencePreview | null>(preview);
  const [failed, setFailed] = useState("");
  const [showSql, setShowSql] = useState(false);
  useEffect(() => {
    setLoaded(preview);
    setFailed("");
    if (preview) return;
    let gone = false;
    previewAudience(audience.sql)
      .then((p) => {
        if (!gone) setLoaded(p);
      })
      .catch((err) => {
        if (!gone) setFailed(errorText(err, "Could not run the query."));
      });
    return () => {
      gone = true;
    };
  }, [audience.sql, preview]);

  return (
    <div className="space-y-3 rounded-2xl border border-leaf-200 bg-leaf-50/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <FaUsers className="text-leaf-700" aria-hidden />
        <span className="text-sm font-semibold text-ink-900">Who gets it</span>
        <Badge tone="leaf">Chosen by the assistant</Badge>
        {onClear && (
          <button type="button" onClick={onClear} className="ms-auto text-xs text-ink-500 underline-offset-2 hover:underline">
            Use conditions instead
          </button>
        )}
      </div>
      <p className="text-sm text-ink-900">{audience.summary.charAt(0).toUpperCase() + audience.summary.slice(1)}</p>
      {audience.steps.length > 0 && (
        <ol className="space-y-1">
          {audience.steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-ink-700">
              <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-leaf-100 text-[11px] font-semibold text-leaf-800">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="rounded-xl bg-card px-3 py-2 text-sm ring-1 ring-ink-200">
        {failed ? (
          <span className="text-brick-700">{failed}</span>
        ) : loaded ? (
          loaded.count === 0 ? (
            <span className="text-ink-700">Matches nobody today. Patients will be reached as they start to match.</span>
          ) : (
            <span className="text-ink-800">
              <FaCheck className="me-1 inline text-leaf-600" aria-hidden />
              <strong>{loaded.count}</strong> patient{loaded.count === 1 ? "" : "s"} match today
              {loaded.sample.length > 0 && (
                <>
                  : {loaded.sample.join(", ")}
                  {loaded.count > loaded.sample.length ? "…" : ""}
                </>
              )}
            </span>
          )
        ) : (
          <span className="text-ink-500">Counting who matches today…</span>
        )}
      </div>
      <button type="button" onClick={() => setShowSql((v) => !v)} className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-700" aria-expanded={showSql}>
        <FaChevronDown className={cn("size-3 transition-transform", showSql && "rotate-180")} aria-hidden />
        Technical details
      </button>
      {showSql && <pre className="max-h-48 overflow-auto rounded-lg bg-ink-900 p-3 text-xs text-ink-100" dir="ltr">{audience.sql}</pre>}
    </div>
  );
}
