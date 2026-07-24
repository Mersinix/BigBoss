import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Eye, EyeOff, Megaphone, MessageSquare, Users } from "lucide-react";
import { MessagesPanel } from "@/components/messages/messages-panel";
import type { ConversationSummary, EligibleContact } from "@shared/schema";

const ROLE_COLOR: Record<string, string> = {
  ADMIN:            "bg-red-100 text-red-700",
  SUPER_ADMIN:      "bg-red-100 text-red-700",
  SUPPLIER:         "bg-amber-100 text-amber-700",
  DELIVERY_COMPANY: "bg-green-100 text-green-700",
  DRIVER:           "bg-green-100 text-green-700",
  CAFE_OWNER:       "bg-blue-100 text-blue-700",
};

function roleLabel(role: string) {
  return role.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

function BroadcastDialog({ contacts, onClose }: { contacts: EligibleContact[]; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [contactSearch, setContactSearch] = useState("");

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/messages/broadcast", {
      title: title.trim(),
      targetUserIds: Array.from(selectedIds),
      content: content.trim() || undefined,
    }),
    onSuccess: () => {
      toast({ title: "Broadcast sent" });
      qc.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
      qc.invalidateQueries({ queryKey: ["/api/messages/admin/all"] });
      onClose();
    },
    onError: (err: any) => toast({ title: "Failed to broadcast", description: err?.message, variant: "destructive" }),
  });

  const toggle = (id: number) => setSelectedIds(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const selectAll = () => setSelectedIds(new Set(contacts.map(c => c.id)));
  const clearAll = () => setSelectedIds(new Set());

  const filtered = contacts.filter(c => c.name.toLowerCase().includes(contactSearch.toLowerCase()));

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle><Megaphone className="w-4 h-4 inline mr-2" />Create Broadcast</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Broadcast title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Platform Maintenance Notice" data-testid="input-broadcast-title" />
          </div>
          <div className="space-y-1.5">
            <Label>Initial message <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input value={content} onChange={e => setContent(e.target.value)} placeholder="Type your message here…" data-testid="input-broadcast-content" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Recipients ({selectedIds.size} selected)</Label>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={selectAll}>All</Button>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={clearAll}>None</Button>
              </div>
            </div>
            <Input className="h-8 text-sm" placeholder="Filter contacts…" value={contactSearch} onChange={e => setContactSearch(e.target.value)} />
            <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
              {filtered.map(c => (
                <label key={c.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-secondary/50">
                  <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                  <span className="flex-1 text-sm truncate">{c.name}</span>
                  <Badge className={`text-[10px] border-0 ${ROLE_COLOR[c.role] ?? "bg-gray-100 text-gray-700"}`}>{roleLabel(c.role)}</Badge>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!title.trim() || selectedIds.size === 0 || mutation.isPending} data-testid="button-send-broadcast">
            {mutation.isPending ? "Sending…" : "Send Broadcast"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AllConversationsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: allConvs = [], isLoading } = useQuery<ConversationSummary[]>({
    queryKey: ["/api/messages/admin/all"],
    queryFn: async () => {
      const r = await fetch("/api/messages/admin/all", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    refetchInterval: 30000,
  });

  const visibilityMutation = useMutation({
    mutationFn: ({ convId, targetUserId, hidden }: { convId: number; targetUserId: number | null; hidden: boolean }) =>
      apiRequest("PATCH", `/api/messages/conversations/${convId}/visibility`, { targetUserId, hidden }),
    onSuccess: () => {
      toast({ title: "Visibility updated" });
      qc.invalidateQueries({ queryKey: ["/api/messages/admin/all"] });
    },
    onError: (err: any) => toast({ title: "Failed", description: err?.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (allConvs.length === 0) return (
    <div className="p-12 text-center text-muted-foreground">
      <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p>No conversations yet</p>
    </div>
  );

  return (
    <div className="divide-y">
      {allConvs.map(conv => {
        const displayName = (conv.title ?? conv.otherParticipants.map(p => p.name).join(", ")) || "Unknown";
        return (
          <div key={conv.id} className="flex items-start gap-3 p-4 hover:bg-secondary/20">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{displayName}</span>
                <Badge variant="outline" className="text-[10px]">{conv.type}</Badge>
                {conv.lastMessage ? (
                  <span className="text-xs text-muted-foreground truncate max-w-[200px]">{conv.lastMessage.content}</span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {conv.otherParticipants.map(p => (
                  <Badge key={p.id} className={`text-[10px] border-0 ${ROLE_COLOR[p.role] ?? "bg-gray-100 text-gray-700"}`}>{p.name}</Badge>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => visibilityMutation.mutate({ convId: conv.id, targetUserId: null, hidden: true })} title="Hide for all participants" data-testid={`button-hide-conv-${conv.id}`}>
                <EyeOff className="w-3 h-3 mr-1" />Hide all
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => visibilityMutation.mutate({ convId: conv.id, targetUserId: null, hidden: false })} title="Show for all participants" data-testid={`button-show-conv-${conv.id}`}>
                <Eye className="w-3 h-3 mr-1" />Show all
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminMessagesPage() {
  const { user } = useAuth();
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const { data: contacts = [] } = useQuery<EligibleContact[]>({
    queryKey: ["/api/messages/eligible-contacts"],
    queryFn: async () => {
      const r = await fetch("/api/messages/eligible-contacts", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Messages</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Centralized messaging with all platform users.</p>
        </div>
        <Button onClick={() => setBroadcastOpen(true)} data-testid="button-open-broadcast">
          <Megaphone className="w-4 h-4 mr-2" />Broadcast
        </Button>
      </div>

      <Tabs defaultValue="chat">
        <TabsList>
          <TabsTrigger value="chat"><MessageSquare className="w-3.5 h-3.5 mr-1.5" />My Conversations</TabsTrigger>
          <TabsTrigger value="all"><Users className="w-3.5 h-3.5 mr-1.5" />All Conversations</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="mt-4">
          {user && <MessagesPanel currentUserId={user.id} showRoleIndicator />}
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <Card><AllConversationsTab /></Card>
        </TabsContent>
      </Tabs>

      {broadcastOpen && <BroadcastDialog contacts={contacts} onClose={() => setBroadcastOpen(false)} />}
    </div>
  );
}
