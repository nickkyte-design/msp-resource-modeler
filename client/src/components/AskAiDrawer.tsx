import { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Send, Sparkles, Loader2, Trash2 } from "lucide-react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
};

const SUGGESTED_PROMPTS = [
  "Where are the biggest coverage gaps and which pod do they affect?",
  "Who's the most overloaded engineer this year, and by how many hours?",
  "How should I distribute IST-timezone engineers to close late-night gaps?",
  "If I want zero gaps, how many engineers should each pod have?",
];

export default function AskAiDrawer({ open, onOpenChange, year }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextIdRef = useRef(1);

  const ask = trpc.ai.ask.useMutation({
    onSuccess: (res) => {
      setMessages((prev) => [
        ...prev,
        { id: nextIdRef.current++, role: "assistant", content: res.answer || "(empty response)" },
      ]);
    },
    onError: (e) => toast.error(e.message),
  });

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, ask.isPending]);

  function send(question: string) {
    const trimmed = question.trim();
    if (!trimmed || ask.isPending) return;
    setMessages((prev) => [
      ...prev,
      { id: nextIdRef.current++, role: "user", content: trimmed },
    ]);
    setInput("");
    ask.mutate({
      year,
      question: trimmed,
      // Send up to the last 10 user/assistant turns for context
      history: messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  function clearChat() {
    setMessages([]);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[560px] flex flex-col p-0">
        <SheetHeader className="border-b px-6 py-4 shrink-0">
          <SheetTitle className="font-display text-2xl flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Ask AI
          </SheetTitle>
          <SheetDescription>
            Ask anything about your {year} schedule — gaps, workload, pod balance, suggestions.
          </SheetDescription>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Try one of these
              </div>
              <div className="flex flex-col gap-2">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    className="text-left text-sm rounded-md border border-border bg-card px-3 py-2 hover:border-primary/50 hover:bg-accent/40 transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {m.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_table]:my-2">
                    <Streamdown>{m.content}</Streamdown>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{m.content}</div>
                )}
              </div>
            </div>
          ))}

          {ask.isPending && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-muted px-3 py-2 text-sm inline-flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Thinking…
              </div>
            </div>
          )}
        </div>

        <div className="border-t px-4 py-3 shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="font-mono text-[10px]">
              year {year}
            </Badge>
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearChat} className="h-7 text-xs">
                <Trash2 className="h-3 w-3 mr-1" /> Clear
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about gaps, workload, balance… (Enter to send, Shift+Enter for newline)"
              rows={2}
              className="resize-none"
              disabled={ask.isPending}
            />
            <Button
              onClick={() => send(input)}
              disabled={!input.trim() || ask.isPending}
              size="icon"
              className="h-auto"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
