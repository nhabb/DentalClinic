"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FaCog, FaPaperPlane, FaWhatsapp } from "react-icons/fa";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { AdminPageHeader, type HeaderAction } from "@/components/ui/AdminPageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { Badge } from "@/components/ui/Badge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { usePermissions } from "@/lib/permissions";
import { useSignOut } from "@/lib/auth/useSignOut";
import { runNow, type RunResult } from "@/lib/api/whatsapp";
import { errorText } from "@/lib/api/request";
import { useWhatsApp } from "@/components/whatsapp/useWhatsApp";
import { ConnectionCard } from "@/components/whatsapp/ConnectionCard";
import { EmailCard } from "@/components/whatsapp/EmailCard";
import { RemindersTab } from "@/components/whatsapp/RemindersTab";
import { MessagesTable } from "@/components/whatsapp/MessagesTable";

/*
 * WhatsApp reminders, on one page: the clinic's number (Connection), what
 * goes out and in which words (Reminders), and every message with its fate
 * (Messages). The address bar can land on a tab: ?tab=connection|reminders|messages,
 * plus ?status=failed for the log. Read in an effect, never in a lazy initial
 * state: the page is server-rendered first.
 */

type Tab = "connection" | "reminders" | "messages";
const TABS: Tab[] = ["connection", "reminders", "messages"];

export default function WhatsAppPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { can } = usePermissions();
  const canEdit = can("whatsapp:edit");
  const canSend = can("whatsapp:send");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const signOut = useSignOut();

  const { file, loading, failed, reload, setConnection, setEmail, setTemplates, setTemplate, setRule, setCustomReminders, reloadTemplates } = useWhatsApp();
  const [tab, setTab] = useState<Tab | null>(null);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<{ at: Date; result: RunResult } | null>(null);
  const [messagesStatus, setMessagesStatus] = useState<string>("");

  // The tab from the address bar, else Connection until connected, then Reminders.
  useEffect(() => {
    if (!file || tab !== null) return;
    const search = new URLSearchParams(window.location.search);
    const wanted = search.get("tab") as Tab | null;
    setTab(wanted && TABS.includes(wanted) ? wanted : file.connection.status === "connected" ? "reminders" : "connection");
    const status = search.get("status");
    if (status) setMessagesStatus(status);
  }, [file, tab]);

  const goTo = (next: Tab, extra?: Record<string, string>) => {
    setTab(next);
    const q = new URLSearchParams({ tab: next, ...(extra ?? {}) });
    router.replace(`/admin/whatsapp?${q.toString()}`);
  };

  const connection = file?.connection ?? null;
  const connected = connection?.status === "connected";

  const sendDueNow = async () => {
    if (!connected) {
      toast.error("Connect the clinic's number first.");
      return;
    }
    setRunning(true);
    try {
      const result = await runNow();
      setLastRun({ at: new Date(), result });
      if (result.sent === 0 && result.failed === 0) toast.success("Nothing new to send right now.");
      else if (result.failed > 0) toast.error(`Sent ${result.sent}, ${result.failed} failed. Open Messages to see why.`);
      else toast.success(`Sent ${result.sent} message${result.sent === 1 ? "" : "s"}.`);
    } catch (err) {
      toast.error(errorText(err, "Could not send right now."));
    } finally {
      setRunning(false);
    }
  };

  const eyebrow = useMemo(() => {
    if (!connection) return null;
    if (connection.dry_run)
      return (
        <Badge tone="honey" dot>
          Test mode — nothing is sent to WhatsApp
        </Badge>
      );
    if (connection.status === "connected")
      return (
        <Badge tone="leaf" dot>
          Connected · {connection.display_phone ?? connection.phone_number_id}
        </Badge>
      );
    if (connection.status === "error")
      return (
        <Badge tone="brick" dot>
          Needs attention
        </Badge>
      );
    if (connection.status === "unverified")
      return (
        <Badge tone="honey" dot>
          Saved, not tested yet
        </Badge>
      );
    return <Badge tone="neutral">Not connected</Badge>;
  }, [connection]);

  const actions: HeaderAction[] = [
    ...(canSend
      ? [
          {
            key: "run",
            label: running ? "Sending…" : "Send what is due now",
            icon: <FaPaperPlane />,
            onClick: () => void sendDueNow(),
          } as HeaderAction,
        ]
      : []),
    { key: "settings", label: t("nav.settings"), icon: <FaCog />, href: "/admin/settings" },
  ];

  const pendingCount = file?.templates.filter((x) => x.meta_status === "pending").length ?? 0;
  const draftCount = file?.templates.filter((x) => x.meta_status === "draft" || x.meta_status === "rejected").length ?? 0;

  return (
    <div className="min-h-screen bg-background lg:flex">
      <AdminSidebar activePage="whatsapp" sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} onLogout={signOut} />
      <div className="min-w-0 flex-1">
        <AdminPageHeader
          title={t("nav.whatsapp")}
          subtitle={t("whatsapp.subtitle")}
          eyebrow={eyebrow}
          actions={actions}
        />
        <main className="mx-auto max-w-5xl px-4 pb-16 pt-4 sm:px-6">
          {loading || tab === null ? (
            <LoadingSpinner label={t("common.loading")} />
          ) : failed || !file ? (
            <EmptyState
              icon={FaWhatsapp}
              title={t("whatsapp.loadFailed")}
              action={
                <Button variant="outline" onClick={() => void reload()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : (
            <div className="space-y-5">
              <Tabs
                label="WhatsApp sections"
                variant="underline"
                value={tab}
                onChange={(v) => goTo(v)}
                items={[
                  { id: "connection", label: t("whatsapp.tabConnection"), dot: file.connection.status === "error" },
                  { id: "reminders", label: t("whatsapp.tabReminders"), count: pendingCount || undefined, dot: draftCount > 0 && connected },
                  { id: "messages", label: t("whatsapp.tabMessages"), dot: (lastRun?.result.failed ?? 0) > 0 },
                ]}
              />
              {tab === "connection" && (
                <div role="tabpanel" id="panel-connection" aria-labelledby="tab-connection">
                  <div className="space-y-6">
                    <ConnectionCard
                      connection={file.connection}
                      onChange={(c) => {
                        setConnection(c);
                        void reload(true);
                      }}
                      canEdit={canEdit}
                      canSend={canSend}
                    />
                    <EmailCard email={file.email} onChange={setEmail} canEdit={canEdit} canSend={canSend} />
                  </div>
                </div>
              )}
              {tab === "reminders" && (
                <div role="tabpanel" id="panel-reminders" aria-labelledby="tab-reminders">
                  <RemindersTab
                    file={file}
                    canEdit={canEdit}
                    canSend={canSend}
                    running={running}
                    lastRun={lastRun}
                    onRun={() => void sendDueNow()}
                    onTemplates={setTemplates}
                    onTemplate={setTemplate}
                    onRule={setRule}
                    onConnect={() => goTo("connection")}
                    onSeeFailed={() => {
                      setMessagesStatus("failed");
                      goTo("messages", { status: "failed" });
                    }}
                    customReminders={file.customReminders}
                    onCustomReminders={setCustomReminders}
                    onReloadTemplates={() => void reloadTemplates()}
                  />
                </div>
              )}
              {tab === "messages" && (
                <div role="tabpanel" id="panel-messages" aria-labelledby="tab-messages">
                  <MessagesTable
                    enabled
                    connected={connected}
                    anyRuleOn={file.rules.some((r) => r.enabled)}
                    canSend={canSend}
                    status={messagesStatus}
                    onStatus={setMessagesStatus}
                    runKey={lastRun?.at.getTime() ?? 0}
                    onConnect={() => goTo("connection")}
                    onReminders={() => goTo("reminders")}
                    onRun={() => void sendDueNow()}
                  />
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
