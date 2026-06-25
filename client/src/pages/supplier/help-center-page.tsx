import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HelpCircle, MessageCircle, Book, Search } from "lucide-react";
import { useState } from "react";

const faqs = [
  { q: "How do I add a new product?", a: "Go to Business → Products, click 'Add Product' and fill in the details including name, price, stock and category." },
  { q: "When will I receive my payout?", a: "Payouts are processed on the 5th of each month. You'll receive the previous month's net earnings minus the 5% platform commission." },
  { q: "How do I handle a return request?", a: "Navigate to Orders → Returns, review the request details and either approve or reject it. Approved returns will automatically deduct from your next payout." },
  { q: "How do I set up a discount code?", a: "Go to Marketing → Discount Codes, click 'New Code', enter the code, discount percentage, usage limit and expiry date." },
  { q: "What is the platform commission rate?", a: "BigBoss Coffee charges a 5% commission on all delivered orders. This is automatically deducted from your monthly payout." },
  { q: "How can I update my product stock?", a: "Go to Business → Inventory and click 'Restock' next to the product you want to update. You can also edit stock directly from the Products page." },
  { q: "Can I offer custom pricing to specific cafés?", a: "Currently custom pricing is not available per café. You can create targeted discount codes for specific customers instead." },
];

export default function HelpCenterPage() {
  const [search, setSearch] = useState("");
  const filtered = faqs.filter((f) =>
    f.q.toLowerCase().includes(search.toLowerCase()) ||
    f.a.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Help Center</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Find answers to common supplier questions.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search help articles..." value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-help-search" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: Book, label: "Documentation", desc: "Guides and articles" },
          { icon: MessageCircle, label: "Live Chat", desc: "Chat with support" },
          { icon: HelpCircle, label: "Submit Ticket", desc: "Email support" },
        ].map(({ icon: Icon, label, desc }) => (
          <Card key={label} className="cursor-pointer">
            <CardContent className="p-5 flex flex-col items-center gap-2 text-center">
              <div className="bg-primary/10 rounded-xl p-3 mb-1"><Icon className="w-5 h-5 text-primary" /></div>
              <p className="font-semibold text-sm text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold">Frequently Asked Questions</CardTitle></CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No results found for "{search}"</p>
          ) : (
            <Accordion type="single" collapsible className="space-y-1">
              {filtered.map((f, i) => (
                <AccordionItem key={i} value={`item-${i}`} className="border border-border/40 rounded-lg px-4">
                  <AccordionTrigger className="text-sm font-medium text-left">{f.q}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
