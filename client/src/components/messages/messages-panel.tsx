/**
 * MessagesPanel — composites ConversationList + ChatView into a self-contained
 * panel. Used by Supplier, Admin, and Delivery pages (not by Cafe Owner, which
 * preserves its own service-tab structure).
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ConversationList } from "./conversation-list";
import { ChatView } from "./chat-view";
import type { ConversationSummary, ConversationMessageRow, EligibleContact } from "@shared/schema";

export function MessagesPanel({ currentUserId, showRoleIndicator = true }: {
  currentUserId: number;
  showRoleIndicator?: boolean;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [view, setView] = useState<"list" | "chat">("list");

  const { data: conversations = [], isLoading: convsLoading } = useQuery<ConversationSummary[]>({
    queryKey: ["/api/messages/conversations"],
    queryFn: async () => {
      const r = await fetch("/api/messages/conversations", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    refetchInterval: 30000,
  });

  const { data: contacts = [] } = useQuery<EligibleContact[]>({
    queryKey: ["/api/messages/eligible-contacts"],
    queryFn: async () => {
      const r = await fetch("/api/messages/eligible-contacts", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const activeConversation = conversations.find(c => c.id === activeConvId) ?? null;

  const { data: messagesData, isLoading: msgsLoading } = useQuery<{ messages: ConversationMessageRow[]; total: number }>({
    queryKey: ["/api/messages/conversations", activeConvId, "messages"],
    queryFn: async () => {
      const r = await fetch(`/api/messages/conversations/${activeConvId}/messages?pageSize=100`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!activeConvId,
    refetchInterval: activeConvId ? 10000 : false,
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", `/api/messages/conversations/${activeConvId}/messages`, { content }),
    onSuccess: () => {
      setInput("");
      qc.invalidateQueries({ queryKey: ["/api/messages/conversations", activeConvId, "messages"] });
      qc.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
    },
    onError: (err: any) => toast({ title: "Failed to send", description: err?.message, variant: "destructive" }),
  });

  const markReadMutation = useMutation({
    mutationFn: (convId: number) => apiRequest("PATCH", `/api/messages/conversations/${convId}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/messages/conversations"] }),
  });

  const newConvMutation = useMutation({
    mutationFn: async (targetUserId: number) => {
      const res = await apiRequest("POST", "/api/messages/conversations", { targetUserId });
      return res.json() as Promise<{ conversation: { id: number }; isNew: boolean }>;
    },
    onSuccess: (data) => {
      const convId = data.conversation.id;
      setActiveConvId(convId);
      setView("chat");
      // Refetch immediately so the new conversation appears in the list
      qc.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
    },
    onError: (err: any) => toast({ title: "Cannot start conversation", description: err?.message, variant: "destructive" }),
  });

  const handleSelectConversation = (id: number) => {
    setActiveConvId(id);
    setView("chat");
    markReadMutation.mutate(id);
  };

  return (
    <Card className="overflow-hidden flex flex-col" style={{ height: 560 }}>
      {/* Mobile: show list or chat; Desktop: side-by-side */}
      <div className="flex flex-1 overflow-hidden">
        {/* Conversation list — always visible on desktop, hidden on mobile when chat open */}
        <div className={`${view === "chat" ? "hidden md:flex" : "flex"} flex-col w-full md:w-80 border-r border-border/40 shrink-0`}>
          <ConversationList
            conversations={conversations}
            activeId={activeConvId}
            onSelect={handleSelectConversation}
            isLoading={convsLoading}
            showRoleIndicator={showRoleIndicator}
            eligibleContacts={contacts}
            onNewConversation={(uid) => newConvMutation.mutate(uid)}
          />
        </div>

        {/* Chat pane */}
        <div className={`${view === "list" ? "hidden md:flex" : "flex"} flex-1 flex-col overflow-hidden`}>
          {activeConversation ? (
            <ChatView
              conversation={activeConversation}
              messages={messagesData?.messages ?? []}
              currentUserId={currentUserId}
              isLoadingMessages={msgsLoading}
              onBack={() => setView("list")}
              input={input}
              onInputChange={setInput}
              onSend={() => { if (input.trim()) sendMutation.mutate(input.trim()); }}
              isSending={sendMutation.isPending}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <p className="text-muted-foreground text-sm">Select a conversation to start chatting</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
