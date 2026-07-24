import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Plus, Search } from "lucide-react";
import type { ConversationSummary, EligibleContact } from "@shared/schema";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ROLE_INDICATOR: Record<string, { border: string; dot: string; label: string }> = {
  ADMIN:             { border: "border-l-red-500",   dot: "bg-red-500",   label: "Admin" },
  SUPER_ADMIN:       { border: "border-l-red-500",   dot: "bg-red-500",   label: "Admin" },
  SUPPLIER:          { border: "border-l-amber-500", dot: "bg-amber-500", label: "Supplier" },
  DELIVERY_COMPANY:  { border: "border-l-green-500", dot: "bg-green-500", label: "Delivery" },
  DRIVER:            { border: "border-l-green-500", dot: "bg-green-500", label: "Delivery" },
  CAFE_OWNER:        { border: "border-l-blue-400",  dot: "bg-blue-400",  label: "Café" },
};

function getRoleStyle(role: string) {
  return ROLE_INDICATOR[role] ?? { border: "border-l-muted", dot: "bg-muted-foreground", label: role };
}

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return days === 1 ? "Yesterday" : `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  isLoading,
  showRoleIndicator = false,
  eligibleContacts,
  onNewConversation,
  emptyText = "No conversations yet",
}: {
  conversations: ConversationSummary[];
  activeId?: number | null;
  onSelect: (id: number) => void;
  isLoading?: boolean;
  showRoleIndicator?: boolean;
  eligibleContacts?: EligibleContact[];
  onNewConversation?: (targetUserId: number) => void;
  emptyText?: string;
}) {
  const [search, setSearch] = useState("");
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");

  const filtered = conversations.filter(c => {
    const displayName = c.title ?? c.otherParticipants.map(p => p.name).join(", ");
    return displayName.toLowerCase().includes(search.toLowerCase());
  });

  const filteredContacts = (eligibleContacts ?? []).filter(c =>
    c.name.toLowerCase().includes(contactSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border/50 shrink-0 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search conversations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-conversations"
          />
        </div>
        {onNewConversation && (
          <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => setNewConvOpen(true)} data-testid="button-new-conversation">
            <Plus className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-14 rounded-lg bg-secondary/50 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-16 text-center">
            <MessageCircle className="w-12 h-12 text-gray-200 mb-3" />
            <p className="font-medium text-gray-500">{emptyText}</p>
          </div>
        ) : (
          filtered.map(conv => {
            const otherRole = conv.otherParticipants[0]?.role ?? "CAFE_OWNER";
            const style = getRoleStyle(otherRole);
            const displayName = conv.type === "BROADCAST" && conv.title
              ? conv.title
              : conv.otherParticipants.map(p => p.name).join(", ") || "Unknown";
            const isActive = conv.id === activeId;
            return (
              <button
                key={conv.id}
                data-testid={`button-thread-${conv.id}`}
                onClick={() => onSelect(conv.id)}
                className={`w-full flex items-start gap-3 p-3 text-left transition-colors border-b border-border/30 last:border-0 border-l-2 ${
                  showRoleIndicator ? style.border : "border-l-transparent"
                } ${isActive ? "bg-primary/5" : "hover:bg-secondary/60"}`}
              >
                <Avatar className="w-9 h-9 shrink-0">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">
                    {displayName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-semibold truncate text-foreground">{displayName}</span>
                      {showRoleIndicator && (
                        <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${style.dot}`} title={style.label} />
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {conv.lastMessageAt ? formatRelativeTime(conv.lastMessageAt) : ""}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {conv.lastMessage?.content ?? "No messages yet"}
                  </p>
                </div>
                {conv.unreadCount > 0 && (
                  <span className="shrink-0 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center mt-0.5">
                    {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* New conversation dialog */}
      {onNewConversation && (
        <Dialog open={newConvOpen} onOpenChange={setNewConvOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Conversation</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="Search contacts…"
                value={contactSearch}
                onChange={e => setContactSearch(e.target.value)}
                data-testid="input-search-contacts"
              />
              <div className="max-h-64 overflow-y-auto space-y-1">
                {filteredContacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No contacts available</p>
                ) : (
                  filteredContacts.map(c => {
                    const s = getRoleStyle(c.role);
                    return (
                      <button
                        key={c.id}
                        className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/70 text-left transition-colors"
                        onClick={() => { onNewConversation(c.id); setNewConvOpen(false); setContactSearch(""); }}
                        data-testid={`button-contact-${c.id}`}
                      >
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">{c.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                        </div>
                        <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                        <Badge variant="outline" className="text-[10px] shrink-0">{s.label}</Badge>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
