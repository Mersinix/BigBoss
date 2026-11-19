import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  HelpCircle, MessageCircle, Book, Search, ChevronLeft, ChevronRight, ChevronDown, Sparkles,
} from "lucide-react";
import { DashboardHero } from "@/components/dashboard/dashboard-kit";
import {
  DOC_CATEGORIES, GUIDES, FAQS, POPULAR_QUESTION_IDS, type Article,
} from "./help-center-content";

// Supplier Help Center — rebuilt as a real, self-service "Centre d'aide Fournisseurs"
// (previously a bare search box + 3 decorative, non-functional cards + 7 hardcoded
// English FAQs with two fabricated policy claims — see help-center-content.tsx's own
// header comment for what's grounded where). No new chat/ticket system: both support
// actions below navigate to the existing real-time messaging page (/supplier/messages,
// which already lets a Supplier reach "le support" through its own "Nouvelle
// conversation" flow) — there is nothing else in the app to wire them to.

function ArticleDetail({ article, onBack, onOpenRelated }: {
  article: Article;
  onBack: () => void;
  onOpenRelated: (id: string) => void;
}) {
  const allById = useMemo(() => {
    const map = new Map<string, Article>();
    for (const cat of DOC_CATEGORIES) for (const a of cat.articles) map.set(a.id, a);
    for (const g of GUIDES) map.set(g.id, g);
    return map;
  }, []);

  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" className="gap-1 -ml-1" onClick={onBack} data-testid="button-article-back">
        <ChevronLeft className="w-4 h-4" /> Retour
      </Button>
      <div>
        <h3 className="font-bold text-lg text-foreground">{article.title}</h3>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{article.intro}</p>
      </div>
      <ol className="space-y-2.5">
        {article.steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary font-semibold text-xs flex items-center justify-center">{i + 1}</span>
            <span className="text-foreground leading-relaxed pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      {article.related && article.related.length > 0 && (
        <div className="pt-3 border-t border-border/50">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Articles liés</p>
          <div className="flex flex-col gap-1.5">
            {article.related.map((id) => {
              const rel = allById.get(id);
              if (!rel) return null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onOpenRelated(id)}
                  className="flex items-center justify-between text-sm text-left px-3 py-2 rounded-lg hover:bg-secondary/60 transition-colors text-foreground"
                  data-testid={`button-related-article-${id}`}
                >
                  {rel.title}
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function HelpCenterPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);
  const [openFaqId, setOpenFaqId] = useState<string | undefined>(undefined);
  const docsRef = useRef<HTMLDivElement>(null);
  const faqRef = useRef<HTMLDivElement>(null);

  const allArticlesById = useMemo(() => {
    const map = new Map<string, Article>();
    for (const cat of DOC_CATEGORIES) for (const a of cat.articles) map.set(a.id, a);
    for (const g of GUIDES) map.set(g.id, g);
    return map;
  }, []);
  const activeArticle = activeArticleId ? allArticlesById.get(activeArticleId) ?? null : null;

  const q = search.trim().toLowerCase();
  const filteredFaqs = useMemo(
    () => (q ? FAQS.filter((f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)) : FAQS),
    [q],
  );
  const filteredCategories = useMemo(() => {
    if (!q) return DOC_CATEGORIES;
    return DOC_CATEGORIES
      .map((cat) => ({
        ...cat,
        articles: cat.label.toLowerCase().includes(q) ? cat.articles : cat.articles.filter((a) => a.title.toLowerCase().includes(q)),
      }))
      .filter((cat) => cat.articles.length > 0);
  }, [q]);

  const goToSupport = () => navigate("/supplier/messages");

  const openArticle = (id: string) => setActiveArticleId(id);
  const openFaq = (id: string) => {
    setSearch("");
    setOpenFaqId(id);
    faqRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex flex-col gap-6 py-6 px-3 -mx-6 sm:px-6 sm:mx-0">
      <DashboardHero
        title="Centre d'aide Fournisseurs"
        subtitle="Retrouvez toutes les informations nécessaires pour gérer votre activité, développer vos ventes et utiliser efficacement BigBossCoffee."
      />

      {/* Search */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9 h-11 text-sm"
            placeholder="Rechercher un guide, une question ou un problème..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-help-search"
          />
        </div>
        {!search && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0"><Sparkles className="w-3.5 h-3.5" /> Questions populaires :</span>
            {POPULAR_QUESTION_IDS.map((id) => {
              const f = FAQS.find((x) => x.id === id);
              if (!f) return null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => openFaq(id)}
                  className="text-xs px-3 py-1.5 rounded-full border border-border/60 text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  data-testid={`button-popular-question-${id}`}
                >
                  {f.q}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick support access */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="bg-primary/10 rounded-xl p-3 w-fit"><Book className="w-5 h-5 text-primary" /></div>
            <div>
              <p className="font-semibold text-sm text-foreground">Documentation</p>
              <ul className="text-xs text-muted-foreground mt-1.5 space-y-0.5">
                <li>Consulter les guides.</li>
                <li>Découvrir les fonctionnalités.</li>
                <li>Apprendre à utiliser la plateforme.</li>
              </ul>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-1 gap-1.5"
              onClick={() => docsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              data-testid="button-open-documentation"
            >
              Consulter la documentation <ChevronDown className="w-3.5 h-3.5" />
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="bg-primary/10 rounded-xl p-3 w-fit"><MessageCircle className="w-5 h-5 text-primary" /></div>
            <div>
              <p className="font-semibold text-sm text-foreground">Assistance en direct</p>
              <ul className="text-xs text-muted-foreground mt-1.5 space-y-0.5">
                <li>Contacter l'équipe support.</li>
                <li>Obtenir de l'aide concernant son compte ou son activité.</li>
              </ul>
            </div>
            <Button variant="outline" size="sm" className="mt-1" onClick={goToSupport} data-testid="button-live-chat">
              Contacter le support
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="bg-primary/10 rounded-xl p-3 w-fit"><HelpCircle className="w-5 h-5 text-primary" /></div>
            <div>
              <p className="font-semibold text-sm text-foreground">Envoyer une demande</p>
              <ul className="text-xs text-muted-foreground mt-1.5 space-y-0.5">
                <li>Signaler un problème.</li>
                <li>Poser une question.</li>
                <li>Demander une assistance technique ou commerciale.</li>
              </ul>
            </div>
            <Button variant="outline" size="sm" className="mt-1" onClick={goToSupport} data-testid="button-submit-ticket">
              Créer une demande
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Documentation categories */}
      <div ref={docsRef} className="space-y-3 scroll-mt-4">
        <h2 className="font-bold text-lg text-foreground">Documentation</h2>
        {activeArticle ? (
          <Card><CardContent className="p-5">
            <ArticleDetail article={activeArticle} onBack={() => setActiveArticleId(null)} onOpenRelated={openArticle} />
          </CardContent></Card>
        ) : filteredCategories.length === 0 ? (
          <Card><CardContent className="p-10 text-center text-muted-foreground text-sm">Aucun résultat pour « {search} ».</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredCategories.map((cat) => {
              const Icon = cat.icon;
              const isOpen = expandedCategory === cat.id || !!q;
              return (
                <Card key={cat.id}>
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setExpandedCategory(expandedCategory === cat.id ? null : cat.id)}
                    data-testid={`button-doc-category-${cat.id}`}
                  >
                    <CardHeader className="flex-row items-center justify-between gap-2 py-4">
                      <div className="flex items-center gap-3">
                        <div className="bg-primary/10 rounded-xl p-2.5 shrink-0"><Icon className="w-4 h-4 text-primary" /></div>
                        <CardTitle className="text-sm font-semibold">{cat.label}</CardTitle>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </CardHeader>
                  </button>
                  {isOpen && (
                    <CardContent className="pt-0 pb-3 space-y-0.5">
                      {cat.articles.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => openArticle(a.id)}
                          className="w-full flex items-center justify-between text-left text-sm px-2.5 py-2 rounded-lg hover:bg-secondary/60 transition-colors text-foreground"
                          data-testid={`button-article-${a.id}`}
                        >
                          <span className="truncate">{a.title}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-2" />
                        </button>
                      ))}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* FAQ */}
      <div ref={faqRef} className="scroll-mt-4">
        <Card>
          <CardHeader><CardTitle className="text-base font-semibold">Questions fréquentes</CardTitle></CardHeader>
          <CardContent>
            {filteredFaqs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Aucun résultat pour « {search} ».</p>
            ) : (
              <Accordion type="single" collapsible className="space-y-1" value={openFaqId} onValueChange={setOpenFaqId}>
                {filteredFaqs.map((f) => (
                  <AccordionItem key={f.id} value={f.id} className="border border-border/40 rounded-lg px-4">
                    <AccordionTrigger className="text-sm font-medium text-left">{f.q}</AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground leading-relaxed">{f.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Popular guides */}
      {!activeArticle && (
        <div className="space-y-3">
          <h2 className="font-bold text-lg text-foreground">Guides populaires</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {GUIDES.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => openArticle(g.id)}
                className="text-left"
                data-testid={`button-guide-${g.id}`}
              >
                <Card className="h-full hover:shadow-md hover:border-primary/40 transition-all">
                  <CardContent className="p-4 flex flex-col gap-2">
                    <p className="font-semibold text-sm text-foreground">{g.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{g.intro}</p>
                    <span className="text-xs text-primary font-medium flex items-center gap-1 mt-1">Lire le guide <ChevronRight className="w-3 h-3" /></span>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Contact support */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div>
            <p className="font-bold text-foreground">Vous n'avez pas trouvé votre réponse ?</p>
            <p className="text-sm text-muted-foreground mt-1">Notre équipe est là pour vous accompagner dans l'utilisation de BigBossCoffee.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" className="gap-1.5" onClick={goToSupport} data-testid="button-contact-live">
              <MessageCircle className="w-4 h-4" /> Assistance en direct
            </Button>
            <Button className="gap-1.5" onClick={goToSupport} data-testid="button-contact-ticket">
              <HelpCircle className="w-4 h-4" /> Envoyer une demande
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
