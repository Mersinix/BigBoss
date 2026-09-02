import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ConversationSummary, ConversationMessageRow } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAvatarUrl } from "@/lib/avatar";
import { MessageCircle, Send, ChevronLeft } from "lucide-react";

// ── Messages tab ───────────────────────────────────────────────────────────────

export default function Messages() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [input, setInput] = useState("");

  const { data: conversations = [], isLoading } = useQuery<ConversationSummary[]>({
    queryKey: ["/api/messages/conversations"],
    enabled: !!user,
    refetchInterval: 30000,
  });
  const maintenanceConversations = conversations.filter((conversation) => conversation.service === "MAINTENANCE");
  const activeConversation = maintenanceConversations.find((conversation) => conversation.id === activeId) ?? null;

  const { data: messagesData, isLoading: messagesLoading } = useQuery<{ messages: ConversationMessageRow[] }>({
    queryKey: ["/api/messages/conversations", activeId, "messages"],
    queryFn: async () => {
      const response = await fetch(`/api/messages/conversations/${activeId}/messages?pageSize=100`, { credentials: "include" });
      if (!response.ok) throw new Error("Impossible de charger les messages");
      return response.json();
    },
    enabled: !!activeId,
  });

  const sendMessage = useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", `/api/messages/conversations/${activeId}/messages`, { content }),
    onSuccess: () => {
      setInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations", activeId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
    },
    onError: (error: Error) => toast({ title: "Message non envoyé", description: error.message, variant: "destructive" }),
  });

  const selectConversation = (id: number) => {
    setActiveId(id);
    apiRequest("PATCH", `/api/messages/conversations/${id}/read`).then(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
    }).catch(() => {});
  };

  return (
    <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-orange-500" />Messages Coffee Owners
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {!activeConversation ? (
          <div className="max-h-[360px] overflow-y-auto">
            {isLoading ? (
              <div className="p-5 text-sm text-gray-400">Chargement des conversations…</div>
            ) : maintenanceConversations.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <MessageCircle className="w-9 h-9 text-gray-200 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-600">Aucun message pour le moment</p>
                <p className="text-xs text-gray-400 mt-1">Les demandes des Coffee Owners apparaîtront ici.</p>
              </div>
            ) : (
              maintenanceConversations.map((conversation) => {
                const name = conversation.title ?? (conversation.otherParticipants.map((participant) => participant.name).join(", ") || "Coffee Owner");
                return (
                  <button
                    key={conversation.id}
                    onClick={() => selectConversation(conversation.id)}
                    className="w-full flex items-center gap-3 px-5 py-3 text-left border-b border-gray-100 last:border-0 hover:bg-orange-50/50 transition-colors"
                  >
                    <Avatar className="w-9 h-9 shrink-0">
                      <AvatarImage src={getAvatarUrl(conversation.otherParticipants[0] as any)} alt={name} />
                      <AvatarFallback className="bg-orange-100 text-orange-700 font-bold text-xs">{name.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{name}</p>
                      <p className="text-xs text-gray-500 truncate">{conversation.lastMessage?.content ?? "Nouvelle conversation"}</p>
                    </div>
                    {conversation.unreadCount > 0 && (
                      <span className="w-5 h-5 rounded-full bg-orange-600 text-white text-[10px] font-bold flex items-center justify-center">{conversation.unreadCount}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <div className="h-[360px] flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
              <button onClick={() => setActiveId(null)} className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center" aria-label="Retour">
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <p className="text-sm font-semibold truncate">
                {activeConversation.title ?? (activeConversation.otherParticipants.map((participant) => participant.name).join(", ") || "Coffee Owner")}
              </p>
              <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">MAINTENANCE</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {messagesLoading ? <p className="text-xs text-gray-400 text-center pt-6">Chargement…</p> : (messagesData?.messages ?? []).map((message) => {
                const own = message.senderId === user?.id;
                return (
                  <div key={message.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${own ? "bg-orange-600 text-white rounded-br-sm" : "bg-gray-100 text-gray-800 rounded-bl-sm"}`}>
                      {message.content}
                      <span className={`block text-[10px] mt-1 opacity-60 ${own ? "text-right" : ""}`}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-3 border-t border-gray-100 flex gap-2">
              <Input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (input.trim()) sendMessage.mutate(input.trim()); } }}
                placeholder="Écrire un message…"
                className="h-9 rounded-xl"
                disabled={sendMessage.isPending}
              />
              <Button
                size="icon"
                onClick={() => { if (input.trim()) sendMessage.mutate(input.trim()); }}
                disabled={!input.trim() || sendMessage.isPending}
                className="h-9 w-9 shrink-0 bg-orange-600 hover:bg-orange-700 rounded-xl"
                aria-label="Envoyer"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
