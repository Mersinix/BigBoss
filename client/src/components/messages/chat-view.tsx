import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Send, Loader2 } from "lucide-react";
import type { ConversationSummary, ConversationMessageRow } from "@shared/schema";
import { useEffect, useRef } from "react";

const ROLE_BADGE: Record<string, string> = {
  ADMIN:            "bg-red-100 text-red-700",
  SUPER_ADMIN:      "bg-red-100 text-red-700",
  SUPPLIER:         "bg-amber-100 text-amber-700",
  DELIVERY_COMPANY: "bg-green-100 text-green-700",
  DRIVER:           "bg-green-100 text-green-700",
  CAFE_OWNER:       "bg-blue-100 text-blue-700",
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatView({
  conversation,
  messages,
  currentUserId,
  isLoadingMessages,
  onBack,
  input,
  onInputChange,
  onSend,
  isSending,
}: {
  conversation: ConversationSummary;
  messages: ConversationMessageRow[];
  currentUserId: number;
  isLoadingMessages?: boolean;
  onBack?: () => void;
  input: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  isSending?: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const otherRole = conversation.otherParticipants[0]?.role ?? "CAFE_OWNER";
  const badgeClass = ROLE_BADGE[otherRole] ?? "bg-gray-100 text-gray-600";
  const displayName = conversation.type === "BROADCAST" && conversation.title
    ? conversation.title
    : conversation.otherParticipants.map(p => p.name).join(", ") || "Unknown";

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border/50 shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            data-testid="button-chat-back"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="text-xs">Back</span>
          </button>
        )}
        <Avatar className="w-8 h-8">
          <AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">
            {displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="font-semibold text-sm text-foreground truncate">{displayName}</span>
          <Badge className={`text-[10px] border-0 px-1.5 py-0.5 shrink-0 ${badgeClass}`}>
            {conversation.type === "BROADCAST" ? "Broadcast" : (otherRole.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase()))}
          </Badge>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="chat-messages">
        {isLoadingMessages ? (
          <div className="flex justify-center pt-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">No messages yet. Say hello!</p>
          </div>
        ) : (
          messages.map((m) => {
            const isOwn = m.senderId === currentUserId;
            return (
              <div key={m.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-xs lg:max-w-sm px-4 py-2.5 rounded-2xl text-sm ${
                    isOwn
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-secondary text-foreground rounded-bl-sm"
                  }`}
                >
                  {!isOwn && conversation.type === "BROADCAST" && (
                    <p className="text-[10px] font-semibold mb-1 opacity-70">{m.senderName}</p>
                  )}
                  <p>{m.content}</p>
                  <p className={`text-[10px] mt-1 ${isOwn ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {formatTime(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border/50 flex gap-2 shrink-0">
        <Input
          data-testid="input-message"
          className="flex-1"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          disabled={isSending}
        />
        <Button
          size="icon"
          data-testid="button-send-message"
          onClick={onSend}
          disabled={!input.trim() || isSending}
        >
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </>
  );
}
