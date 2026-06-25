import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, Search, ChevronLeft, MessageCircle } from "lucide-react";

type ServiceId = "SHOP" | "PRINT" | "BARISTA" | "MARKETING";
type ThreadMessage = { from: "me" | "them"; text: string; time: string };
type Thread = { id: number; name: string; service: ServiceId; lastMessage: string; time: string; unread: number; messages: ThreadMessage[] };

const SERVICE_BADGE: Record<ServiceId, string> = {
  SHOP:      "bg-blue-100 text-blue-700",
  PRINT:     "bg-orange-100 text-orange-700",
  BARISTA:   "bg-green-100 text-green-700",
  MARKETING: "bg-purple-100 text-purple-700",
};

const SERVICES_LIST: ServiceId[] = ["SHOP", "PRINT", "BARISTA", "MARKETING"];

const fakeThreads: Thread[] = [
  { id: 1, name: "Premium Beans Co",      service: "SHOP",      lastMessage: "Your order has been confirmed and is being prepared.", time: "2m ago",   unread: 2, messages: [{ from: "them", text: "Hello! Thank you for your order #001.", time: "10:03 AM" }, { from: "me", text: "Great! When will it be dispatched?", time: "10:05 AM" }, { from: "them", text: "We will dispatch by tomorrow morning.", time: "10:07 AM" }, { from: "them", text: "Your order has been confirmed and is being prepared.", time: "10:08 AM" }] },
  { id: 2, name: "Oat & Grain Supply",    service: "SHOP",      lastMessage: "We have a new batch of barista oat milk available.", time: "1h ago",   unread: 1, messages: [{ from: "them", text: "Hi there! We have a new batch of barista oat milk available.", time: "09:15 AM" }, { from: "me", text: "How much for 12 units?", time: "09:20 AM" }, { from: "them", text: "TND 36 for 12 units, with free delivery for orders above TND 100.", time: "09:22 AM" }] },
  { id: 3, name: "TunRoast",              service: "SHOP",      lastMessage: "Our new seasonal blend just dropped!", time: "Yesterday", unread: 0, messages: [{ from: "them", text: "Our new seasonal blend just dropped! Would you like a sample?", time: "Yesterday" }, { from: "me", text: "Yes please, I'd love to try it.", time: "Yesterday" }] },
  { id: 4, name: "Arabica Direct",        service: "SHOP",      lastMessage: "Invoice for order #ORD-0003 attached.", time: "Mon",      unread: 0, messages: [{ from: "them", text: "Invoice for order #ORD-0003 attached. Thank you for your business!", time: "Mon" }] },
  { id: 5, name: "ImprimTunis",           service: "PRINT",     lastMessage: "Your flyer proof is ready for review.", time: "30m ago",  unread: 1, messages: [{ from: "them", text: "Hello! Your flyer proof is ready for review.", time: "09:40 AM" }, { from: "me", text: "Can you increase the font size on the header?", time: "09:45 AM" }, { from: "them", text: "Of course! Updated version sent now.", time: "09:50 AM" }] },
  { id: 6, name: "PrintExpress Sfax",     service: "PRINT",     lastMessage: "Menu cards delivered, thank you!", time: "Mon",      unread: 0, messages: [{ from: "them", text: "Your menu cards have been delivered!", time: "Mon" }, { from: "me", text: "Perfect, thank you so much!", time: "Mon" }] },
  { id: 7, name: "Tunis Barista Academy", service: "BARISTA",   lastMessage: "Enrollment confirmed for next week.", time: "2h ago",  unread: 0, messages: [{ from: "them", text: "Enrollment confirmed for the Espresso Fundamentals course next week.", time: "10:00 AM" }, { from: "me", text: "Great! What should I bring?", time: "10:02 AM" }, { from: "them", text: "Just yourself — all equipment provided.", time: "10:04 AM" }] },
  { id: 8, name: "Youssef Ben Ali",       service: "BARISTA",   lastMessage: "Available this weekend, confirmed.", time: "Yesterday", unread: 1, messages: [{ from: "me", text: "Are you available this Saturday for a shift?", time: "Yesterday" }, { from: "them", text: "Yes, available this weekend. Confirmed!", time: "Yesterday" }] },
  { id: 9, name: "TunMedia Agency",       service: "MARKETING", lastMessage: "Q1 campaign report attached.", time: "Yesterday", unread: 2, messages: [{ from: "them", text: "Q1 campaign report is attached. Reach is up 34% vs last quarter.", time: "Yesterday" }, { from: "me", text: "Impressive results! Let's schedule a review call.", time: "Yesterday" }] },
  { id: 10, name: "Pixel & Grain Studio", service: "MARKETING", lastMessage: "Photo shoot scheduled for Tuesday.", time: "Mon",      unread: 0, messages: [{ from: "them", text: "Photo shoot confirmed for Tuesday at 10am.", time: "Mon" }, { from: "me", text: "Perfect, see you then.", time: "Mon" }] },
];

export default function MessagesPage() {
  const [service, setService] = useState<ServiceId>("SHOP");
  const [threads, setThreads] = useState<Thread[]>(fakeThreads);
  const [active, setActive] = useState<Thread | null>(null);
  const [view, setView] = useState<"list" | "chat">("list");
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");

  const filtered = threads
    .filter((t) => t.service === service)
    .filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  const openConversation = (t: Thread) => {
    setActive(t);
    setView("chat");
    setSearch("");
    setThreads((prev) => prev.map((th) => th.id === t.id ? { ...th, unread: 0 } : th));
  };

  const goBack = () => { setView("list"); };

  const send = () => {
    if (!input.trim() || !active) return;
    const msg: ThreadMessage = { from: "me", text: input.trim(), time: "Now" };
    setThreads((prev) => prev.map((t) => t.id === active.id ? { ...t, messages: [...t.messages, msg], lastMessage: input.trim() } : t));
    setActive((a) => a ? { ...a, messages: [...a.messages, msg] } : a);
    setInput("");
  };

  return (
    <div className="flex flex-col p-6 gap-5 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Messages</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Chat with your suppliers, providers, and trainers.</p>
      </div>

      {/* Service switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 shrink-0">
        {SERVICES_LIST.map((s) => (
          <button
            key={s}
            data-testid={`tab-messages-${s.toLowerCase()}`}
            onClick={() => { setService(s); setView("list"); setActive(null); setSearch(""); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${service === s ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
          >
            {s}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden flex flex-col" style={{ height: 520 }}>
        {/* List view */}
        {view === "list" && (
          <>
            <div className="p-3 border-b border-border/50 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 h-8 text-sm"
                  placeholder={`Search ${service} conversations…`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-search-messages"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                  <MessageCircle className="w-12 h-12 text-gray-200 mb-3" />
                  <p className="font-medium text-gray-500">No conversations yet</p>
                  <p className="text-sm text-gray-400 mt-1">for {service}</p>
                </div>
              ) : (
                filtered.map((t) => (
                  <button
                    key={t.id}
                    data-testid={`button-thread-${t.id}`}
                    onClick={() => openConversation(t)}
                    className="w-full flex items-start gap-3 p-3 text-left hover:bg-secondary/60 transition-colors border-b border-border/30 last:border-0"
                  >
                    <Avatar className="w-9 h-9 shrink-0">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">
                        {t.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-sm font-semibold truncate text-foreground">{t.name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{t.time}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{t.lastMessage}</p>
                    </div>
                    {t.unread > 0 && (
                      <span className="shrink-0 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center mt-0.5">
                        {t.unread}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </>
        )}

        {/* Chat view */}
        {view === "chat" && active && (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-border/50 shrink-0">
              <button
                onClick={goBack}
                data-testid="button-chat-back"
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="text-xs">Back</span>
              </button>
              <Avatar className="w-8 h-8">
                <AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">
                  {active.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">{active.name}</span>
                <Badge className={`text-[10px] border-0 px-1.5 py-0.5 ${SERVICE_BADGE[active.service]}`}>
                  {active.service}
                </Badge>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {active.messages.map((m, i) => (
                <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-xs px-4 py-2.5 rounded-2xl text-sm ${
                      m.from === "me"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-secondary text-foreground rounded-bl-sm"
                    }`}
                  >
                    <p>{m.text}</p>
                    <p className={`text-[10px] mt-1 ${m.from === "me" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {m.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-border/50 flex gap-2 shrink-0">
              <Input
                data-testid="input-message"
                className="flex-1"
                placeholder="Type a message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
              />
              <Button size="icon" data-testid="button-send-message" onClick={send}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
