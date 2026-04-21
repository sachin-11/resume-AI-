"use client";
import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Bot, User, Sparkles, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "What's my average interview score?",
  "Show my last 5 interviews",
  "Which role did I score highest in?",
  "How many campaigns do I have?",
  "List candidates who completed interviews",
  "What are my strengths based on feedback?",
  "How many interviews this month?",
  "Show my best performing session",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hi! I'm your AI data assistant 🤖\n\nI can answer questions about your interviews, feedback scores, campaigns, candidates, and more — just ask in plain English!\n\nTry: *\"What's my average score?\"* or *\"Show recent interviews\"*",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: text.trim() };
    setMessages((p) => [...p, userMsg]);
    setInput("");
    setLoading(true);

    const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text.trim(), history }),
    });
    const data = await res.json();
    setMessages((p) => [...p, {
      id: `a-${Date.now()}`,
      role: "assistant",
      content: data.answer ?? "Sorry, something went wrong.",
    }]);
    setLoading(false);
  }

  function renderContent(content: string) {
    // Simple markdown-like rendering
    return content.split("\n").map((line, i) => {
      if (line.startsWith("- ") || line.startsWith("• ")) {
        return <li key={i} className="ml-4 list-disc text-sm">{renderInline(line.slice(2))}</li>;
      }
      if (line.match(/^\d+\./)) {
        return <li key={i} className="ml-4 list-decimal text-sm">{renderInline(line.replace(/^\d+\.\s*/, ""))}</li>;
      }
      if (!line.trim()) return <br key={i} />;
      return <p key={i} className="text-sm leading-relaxed">{renderInline(line)}</p>;
    });
  }

  function renderInline(text: string) {
    const parts = text.split(/(\*[^*]+\*)/g);
    return parts.map((part, i) =>
      part.startsWith("*") && part.endsWith("*")
        ? <strong key={i} className="font-semibold text-foreground">{part.slice(1, -1)}</strong>
        : part
    );
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col" style={{ height: "calc(100vh - 5rem)" }}>
      {/* Header */}
      <div className="shrink-0 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600">
            <Database className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              AI Data Assistant <Sparkles className="h-4 w-4 text-violet-400" />
            </h1>
            <p className="text-xs text-muted-foreground">Ask anything about your interviews, scores, campaigns & more</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              msg.role === "assistant" ? "bg-violet-600" : "bg-secondary"
            }`}>
              {msg.role === "assistant" ? <Bot className="h-4 w-4 text-white" /> : <User className="h-4 w-4" />}
            </div>
            <Card className={`max-w-[85%] px-4 py-3 ${
              msg.role === "user"
                ? "bg-violet-600 border-violet-600 text-white rounded-tr-sm"
                : "bg-card border-border rounded-tl-sm"
            }`}>
              <div className={msg.role === "user" ? "text-white" : "text-foreground"}>
                {renderContent(msg.content)}
              </div>
            </Card>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <Card className="px-4 py-3.5 bg-card border-border rounded-tl-sm">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-violet-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2.5 h-2.5 bg-violet-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2.5 h-2.5 bg-violet-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </Card>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions (show only at start) */}
      {messages.length <= 1 && (
        <div className="shrink-0 py-3">
          <p className="text-xs text-muted-foreground mb-2">Try asking:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => sendMessage(s)}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 pt-3 border-t border-border">
        <div className="flex gap-2 items-end">
          <Textarea
            placeholder="Ask about your interviews, scores, campaigns..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            className="min-h-[52px] max-h-[120px] resize-none"
            disabled={loading}
          />
          <Button onClick={() => sendMessage(input)} disabled={!input.trim() || loading}
            size="icon" className="h-[52px] w-12 shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5">
          <kbd className="px-1 py-0.5 rounded bg-secondary text-xs">Enter</kbd> to send · <kbd className="px-1 py-0.5 rounded bg-secondary text-xs">Shift+Enter</kbd> for newline
        </p>
      </div>
    </div>
  );
}
