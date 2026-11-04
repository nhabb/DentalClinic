"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchConnection,
  fetchRules,
  fetchTemplates,
  refreshTemplates,
  type WhatsAppConnection,
  type WhatsAppRule,
  type WhatsAppTemplate,
} from "@/lib/api/whatsapp";

/**
 * The page's one read: connection, wording and rules together, so no two
 * cards can disagree. While any wording waits for WhatsApp and the tab is
 * visible, Meta's verdict is read every minute (the NotificationsBell
 * pattern); on focus too, since the admin may come back from Meta's site.
 */
const POLL_MS = 60_000;

export interface WhatsAppFile {
  connection: WhatsAppConnection;
  templates: WhatsAppTemplate[];
  rules: WhatsAppRule[];
}

export function useWhatsApp() {
  const [file, setFile] = useState<WhatsAppFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const loads = useRef(0);

  const reload = useCallback(async (silent = false) => {
    const n = ++loads.current;
    if (!silent) setLoading(true);
    try {
      const [connection, templates, rules] = await Promise.all([fetchConnection(), fetchTemplates(), fetchRules()]);
      if (n !== loads.current) return;
      setFile({ connection, templates, rules });
      setFailed(false);
    } catch {
      if (n === loads.current) setFailed(true);
    } finally {
      if (n === loads.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setConnection = useCallback((connection: WhatsAppConnection) => {
    setFile((f) => (f ? { ...f, connection } : f));
  }, []);
  const setTemplates = useCallback((templates: WhatsAppTemplate[]) => {
    setFile((f) => (f ? { ...f, templates } : f));
  }, []);
  const setTemplate = useCallback((template: WhatsAppTemplate) => {
    setFile((f) =>
      f ? { ...f, templates: f.templates.map((t) => (String(t.id) === String(template.id) ? { ...t, ...template } : t)) } : f,
    );
  }, []);
  const setRule = useCallback((rule: WhatsAppRule) => {
    setFile((f) => (f ? { ...f, rules: f.rules.map((r) => (r.kind === rule.kind ? { ...r, ...rule } : r)) } : f));
  }, []);

  // Poll Meta while anything is waiting for approval.
  const pending = !!file?.templates.some((t) => t.meta_status === "pending");
  const connected = file?.connection.status === "connected";
  useEffect(() => {
    if (!pending || !connected) return;
    let stopped = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const templates = await refreshTemplates();
        if (!stopped) setTemplates(templates);
      } catch {
        /* the next tick tries again */
      }
    };
    const timer = window.setInterval(() => void check(), POLL_MS);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [pending, connected, setTemplates]);

  return { file, loading, failed, reload, setConnection, setTemplates, setTemplate, setRule };
}
