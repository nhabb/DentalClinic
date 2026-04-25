"use client";
import { useState, useRef, useEffect } from "react";
import { apiFetch } from "@/lib/api/client";
import { FaRobot, FaTimes, FaPaperPlane, FaTrash } from "react-icons/fa";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  doctorName?: string; // kept for display only
  doctorId?: number;   // no longer sent to backend
}

function MarkdownText({ text }: { text: string }) {
  // Minimal markdown: bold, bullet lists, line breaks
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith("- ") || line.startsWith("• ")) {
          return (
            <div key={i} className="flex gap-1.5">
              <span className="mt-1 text-[8px]">●</span>
              <span>{renderInline(line.slice(2))}</span>
            </div>
          );
        }
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  );
}

export default function AgentChat({ doctorName = "Doctor", doctorId }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await apiFetch("/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply ?? "No response." }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-dental-blue hover:bg-dental-blue/90 text-white rounded-full shadow-lg flex items-center justify-center transition-all"
        title="Clinic AI Assistant"
      >
        {open ? <FaTimes size={18} /> : <FaRobot size={20} />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[380px] max-h-[600px] flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-dental-blue text-white">
            <div className="flex items-center gap-2">
              <FaRobot size={16} />
              <div>
                <p className="text-sm font-semibold leading-none">Clinic AI Assistant</p>
                <p className="text-[11px] text-blue-100 mt-0.5">Powered by ChatGPT</p>
              </div>
            </div>
            <button
              onClick={() => { setMessages([]); }}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              title="Clear conversation"
            >
              <FaTrash size={12} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px] max-h-[450px] bg-gray-50">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <FaRobot size={32} className="text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500 font-medium">How can I help you today?</p>
                <div className="mt-4 space-y-2">
                  {[
                    "Show today's appointments",
                    "Which inventory items are low on stock?",
                    "List all patients",
                    "Show upcoming appointments",
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => { setInput(s); }}
                      className="block w-full text-left text-xs text-dental-blue bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-dental-blue flex items-center justify-center mr-2 flex-shrink-0 mt-0.5">
                    <FaRobot size={10} className="text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed
                    ${m.role === "user"
                      ? "bg-dental-blue text-white rounded-br-sm"
                      : "bg-white text-gray-800 border border-gray-100 shadow-sm rounded-bl-sm"
                    }`}
                >
                  {m.role === "assistant" ? <MarkdownText text={m.content} /> : m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-full bg-dental-blue flex items-center justify-center mr-2 flex-shrink-0">
                  <FaRobot size={10} className="text-white" />
                </div>
                <div className="bg-white border border-gray-100 shadow-sm px-4 py-3 rounded-2xl rounded-bl-sm">
                  <div className="flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-100 bg-white">
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
              placeholder="Ask anything..."
                rows={1}
                className="flex-1 resize-none text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue max-h-28 overflow-y-auto"
                style={{ lineHeight: "1.5" }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="p-2.5 bg-dental-blue hover:bg-dental-blue/90 disabled:bg-gray-200 text-white rounded-xl transition-colors flex-shrink-0"
              >
                <FaPaperPlane size={14} />
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5 text-center">Press Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      )}
    </>
  );
}
