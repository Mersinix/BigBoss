import type { ComponentType } from "react";
import {
  Rocket, Package, Warehouse, ClipboardList, Truck, Wallet, Tag, MessageCircle, Settings,
} from "lucide-react";

// Content data for the Supplier Help Center (client/src/pages/supplier/help-center-page.tsx).
// Split out for maintainability — every article/FAQ answer below is grounded in a real,
// verified Supplier workflow already implemented in the app (manage-products.tsx,
// inventory-page.tsx, shared/orders-page.tsx, returns-page.tsx, delivery-status-page.tsx,
// payouts-page.tsx/invoices-page.tsx/lib/financial-rows.ts, promotions-page.tsx,
// discount-codes-page.tsx, messages-page.tsx, store-page.tsx, settings-page.tsx,
// categories-page.tsx's category-request workflow). Nothing here invents a commission
// rate, payout schedule, or policy beyond what is actually implemented — where the app
// does not model something (e.g. the exact bank transfer date), the content says so and
// points to Support instead of presenting a guess as fact.

export type Article = {
  id: string;
  title: string;
  intro: string;
  steps: string[];
  related?: string[]; // ids of other articles/guides
};

export type DocCategory = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  articles: Article[];
};

export type FaqItem = {
  id: string;
  q: string;
  a: string;
};

export type Guide = Article;

// ── Documentation categories ──────────────────────────────────────────────────

export const DOC_CATEGORIES: DocCategory[] = [
  {
    id: "demarrage",
    label: "Bien démarrer",
    icon: Rocket,
    articles: [
      {
        id: "demarrage-1",
        title: "Présentation de l'espace fournisseur",
        intro: "Votre espace fournisseur regroupe tous les outils nécessaires pour gérer votre activité sur BigBossCoffee : produits, stock, commandes, livraison, paiements, promotions et communication.",
        steps: [
          "Le menu latéral gauche donne accès à chaque section : Produits, Stock, Commandes, Livraison des commandes, Paiements, Factures, et plus.",
          "La section « Marketing » regroupe la Communication, les Promotions et les Codes promotionnels.",
          "La section « Compte » regroupe vos Paramètres et ce Centre d'aide.",
        ],
        related: ["demarrage-2", "demarrage-3"],
      },
      {
        id: "demarrage-2",
        title: "Comprendre le tableau de bord",
        intro: "Votre tableau de bord (Performance) affiche une vue d'ensemble de votre activité : commandes, ventes et indicateurs clés.",
        steps: [
          "Accédez à « Performance » dans le menu principal.",
          "Les indicateurs affichés dépendent des sections activées pour votre compte par l'administrateur.",
          "Pour toute question sur un indicateur précis, contactez le support via Communication.",
        ],
      },
      {
        id: "demarrage-3",
        title: "Configurer son profil fournisseur",
        intro: "Vos informations de profil et de sécurité se gèrent depuis Compte → Paramètres.",
        steps: [
          "Ouvrez Paramètres depuis le menu Compte.",
          "La section « Profil » permet de modifier vos informations personnelles.",
          "La section « Sécurité » permet de gérer vos informations de connexion (mot de passe, etc.).",
        ],
        related: ["parametres-1", "parametres-3"],
      },
      {
        id: "demarrage-4",
        title: "Configurer sa boutique",
        intro: "La page Boutique (Store) permet de personnaliser l'apparence de votre boutique telle qu'elle est présentée aux Coffee Owners sur la marketplace.",
        steps: [
          "Accédez à « Boutique » dans le menu principal (si cette section est activée pour votre compte).",
          "La section « Détails de la boutique » regroupe le nom, la description et les informations générales.",
          "La section « Médias d'arrière-plan » permet de gérer les visuels de votre boutique.",
          "La section « Horaires d'ouverture » permet d'indiquer vos jours et heures d'activité.",
          "Pensez à enregistrer chaque section après modification.",
        ],
        related: ["boutique-produits-6", "parametres-2"],
      },
      {
        id: "demarrage-5",
        title: "Gérer les informations de son entreprise",
        intro: "Vos informations commerciales (entreprise) sont disponibles dans Paramètres, sous la section « Informations commerciales ».",
        steps: [
          "Ouvrez Paramètres depuis le menu Compte.",
          "Consultez ou modifiez la section « Informations commerciales ».",
          "Si une information ne peut pas être modifiée directement, contactez le support via Communication.",
        ],
      },
    ],
  },
  {
    id: "boutique-produits",
    label: "Boutique et produits",
    icon: Package,
    articles: [
      {
        id: "boutique-produits-1",
        title: "Comment créer un produit ?",
        intro: "La création de produit se fait depuis Produits → onglet Nouveau produit.",
        steps: [
          "Allez dans « Produits » puis sélectionnez l'onglet « Nouveau produit ».",
          "Renseignez le nom, la description, la catégorie, la sous-catégorie et la marque.",
          "Ajoutez une image et, si nécessaire, des images supplémentaires.",
          "Définissez les variantes (saveurs, tailles) si votre produit en propose plusieurs.",
          "Soumettez le produit : il passe en attente de validation avant d'être visible sur la marketplace.",
        ],
        related: ["boutique-produits-5", "boutique-produits-4"],
      },
      {
        id: "boutique-produits-2",
        title: "Comment modifier les informations d'un produit ?",
        intro: "Vos produits existants se modifient depuis l'onglet « Mes produits ».",
        steps: [
          "Allez dans « Produits » puis sélectionnez l'onglet « Mes produits ».",
          "Cliquez sur le produit à modifier.",
          "Mettez à jour les informations nécessaires puis enregistrez les modifications.",
        ],
      },
      {
        id: "boutique-produits-3",
        title: "Comment gérer les catégories et sous-catégories ?",
        intro: "Les catégories et sous-catégories disponibles sont gérées depuis la page « Catégories ».",
        steps: [
          "Allez dans « Catégories » depuis le menu principal.",
          "Vous pouvez sélectionner les catégories et sous-catégories déjà approuvées pour votre activité.",
          "Si la catégorie dont vous avez besoin n'existe pas encore, utilisez l'onglet « Demandes » pour en proposer une nouvelle (voir l'article dédié).",
        ],
        related: ["boutique-produits-6"],
      },
      {
        id: "boutique-produits-4",
        title: "Comment ajouter des images aux produits ?",
        intro: "Chaque produit peut avoir une image principale et des images supplémentaires, ajoutées lors de sa création ou modification.",
        steps: [
          "Ouvrez la fiche du produit (création ou modification).",
          "Renseignez l'URL de l'image principale dans le champ prévu.",
          "Ajoutez, si besoin, des images supplémentaires dans les champs correspondants.",
          "Enregistrez pour appliquer les changements.",
        ],
      },
      {
        id: "boutique-produits-5",
        title: "Comment gérer les variantes, tailles et saveurs ?",
        intro: "Un produit peut proposer plusieurs variantes (combinaisons de saveur et de taille), chacune avec son propre prix et son propre stock.",
        steps: [
          "Lors de la création ou de l'édition d'une offre produit, ouvrez le générateur de variantes.",
          "Sélectionnez les saveurs et tailles disponibles pour ce produit.",
          "Renseignez le prix et la quantité en stock pour chaque variante générée.",
          "Enregistrez pour que les variantes soient prises en compte dans votre catalogue.",
        ],
      },
      {
        id: "boutique-produits-6",
        title: "Comment soumettre une demande de nouvelle catégorie ?",
        intro: "Si la catégorie, sous-catégorie, marque, saveur ou taille dont vous avez besoin n'existe pas dans le catalogue, vous pouvez en proposer une nouvelle à l'administration.",
        steps: [
          "Allez dans « Catégories » puis sélectionnez l'onglet « Demandes ».",
          "Choisissez le type d'élément à proposer (catégorie, sous-catégorie, marque, saveur ou taille).",
          "Remplissez le formulaire (nom, description, icône si applicable) puis envoyez votre proposition.",
          "Votre demande passe en statut « En attente » jusqu'à son examen par l'administration — vous pouvez suivre son statut depuis cette même page.",
        ],
        related: ["boutique-produits-3"],
      },
      {
        id: "boutique-produits-7",
        title: "Comment consulter les produits du catalogue administrateur ?",
        intro: "L'onglet « Produits du catalogue » liste les produits de référence créés par l'administration, que vous pouvez ajouter à votre propre catalogue.",
        steps: [
          "Allez dans « Produits » puis sélectionnez l'onglet « Produits du catalogue ».",
          "Parcourez ou filtrez les produits disponibles par catégorie, marque, saveur ou taille.",
          "Cliquez sur « Ajouter à mes produits » pour créer votre propre offre à partir d'un produit du catalogue, puis renseignez votre prix et votre stock.",
        ],
      },
    ],
  },
  {
    id: "stock",
    label: "Gestion du stock",
    icon: Warehouse,
    articles: [
      {
        id: "stock-1",
        title: "Comment mettre à jour son stock ?",
        intro: "La gestion du stock se fait depuis la page « Stock » (Inventaire).",
        steps: [
          "Allez dans « Stock » depuis le menu principal.",
          "Repérez le produit ou la variante à mettre à jour.",
          "Ajustez la quantité disponible directement depuis la page, ou depuis la fiche produit dans « Mes produits ».",
        ],
        related: ["stock-2"],
      },
      {
        id: "stock-2",
        title: "Comment gérer les quantités disponibles ?",
        intro: "Chaque variante (saveur/taille) d'un produit a sa propre quantité en stock, affichée et modifiable depuis la page Stock.",
        steps: [
          "Ouvrez « Stock » et utilisez les filtres pour retrouver un produit précis.",
          "Modifiez la quantité disponible pour chaque variante concernée.",
          "Une quantité à zéro rend la variante indisponible à l'achat pour les Coffee Owners.",
        ],
      },
      {
        id: "stock-3",
        title: "Comment suivre les mouvements de stock ?",
        intro: "La page Stock propose un historique des mouvements pour chaque produit, accessible directement depuis sa ligne.",
        steps: [
          "Allez dans « Stock ».",
          "Ouvrez l'historique du produit concerné pour consulter ses mouvements de stock.",
        ],
      },
      {
        id: "stock-4",
        title: "Comment éviter les problèmes de disponibilité des produits ?",
        intro: "Un produit avec un stock à zéro n'apparaît plus comme disponible à l'achat.",
        steps: [
          "Vérifiez régulièrement vos niveaux de stock depuis la page « Stock ».",
          "Mettez à jour vos quantités dès qu'elles évoluent, pour éviter qu'un produit ne devienne indisponible sans que vous en ayez conscience.",
          "Vous pouvez aussi gérer la visibilité d'un produit directement depuis la page Stock ou vos fiches produit.",
        ],
      },
    ],
  },
  {
    id: "commandes",
    label: "Commandes",
    icon: ClipboardList,
    articles: [
      {
        id: "commandes-1",
        title: "Comment consulter les nouvelles commandes ?",
        intro: "Toutes vos commandes sont visibles depuis la page « Commandes », accessible depuis le menu principal.",
        steps: [
          "Allez dans « Commandes » depuis le menu principal.",
          "Les nouvelles commandes apparaissent avec leur statut correspondant.",
        ],
        related: ["commandes-2", "commandes-3"],
      },
      {
        id: "commandes-2",
        title: "Comment accepter ou gérer une commande ?",
        intro: "Chaque commande passe par plusieurs statuts (confirmation, préparation, etc.) que vous faites évoluer depuis sa fiche détaillée.",
        steps: [
          "Ouvrez la commande concernée depuis la page « Commandes ».",
          "Faites évoluer son statut selon l'avancement réel de la préparation.",
          "Les informations du café client et les produits commandés sont visibles directement sur la fiche.",
        ],
      },
      {
        id: "commandes-3",
        title: "Comment suivre le statut d'une commande ?",
        intro: "Le statut d'une commande (en attente, confirmée, en préparation, prête, en livraison, livrée ou annulée) est visible directement dans la liste des commandes.",
        steps: [
          "Ouvrez « Commandes ».",
          "Utilisez les filtres de statut pour retrouver les commandes à un stade donné.",
          "Cliquez sur une commande pour voir son détail complet, incluant, le cas échéant, le suivi de sa livraison.",
        ],
        related: ["livraison-2"],
      },
      {
        id: "commandes-4",
        title: "Comment consulter l'historique des commandes ?",
        intro: "L'historique complet de vos commandes reste disponible sur la page « Commandes », sans limite de durée affichée.",
        steps: [
          "Ouvrez « Commandes ».",
          "Utilisez la recherche et les filtres (statut, date) pour retrouver une commande passée.",
        ],
      },
      {
        id: "commandes-5",
        title: "Comment gérer les problèmes liés aux commandes ?",
        intro: "Si une commande présente un problème (retour, erreur de préparation, litige avec le café), plusieurs outils sont à votre disposition.",
        steps: [
          "Pour une demande de retour, consultez la page « Retours » (si cette fonctionnalité est activée pour votre compte) et traitez la demande (approuver, rejeter, suivre).",
          "Pour contacter directement le café concerné, utilisez la Communication.",
          "Pour un problème que vous ne pouvez pas résoudre vous-même, contactez le support via Communication.",
        ],
        related: ["retours", "communication-1"],
      },
    ],
  },
  {
    id: "livraison",
    label: "Livraison",
    icon: Truck,
    articles: [
      {
        id: "livraison-1",
        title: "Comment fonctionne la livraison ?",
        intro: "Une fois une commande prête, sa livraison peut être assignée à un chauffeur de votre équipe ou dispatchée à une entreprise de livraison partenaire.",
        steps: [
          "Allez dans « Livraison des commandes » depuis le menu principal.",
          "Depuis une livraison, assignez l'un de vos chauffeurs, ou envoyez la demande à une entreprise de livraison disponible.",
        ],
      },
      {
        id: "livraison-2",
        title: "Comment suivre les livraisons ?",
        intro: "La page « Livraison des commandes » liste toutes vos livraisons avec leur statut (en attente, acceptée, assignée, collectée, en transit, livrée ou annulée).",
        steps: [
          "Ouvrez « Livraison des commandes ».",
          "Utilisez les filtres de statut et de date pour retrouver une livraison précise.",
          "Cliquez sur une livraison pour voir son détail complet.",
        ],
      },
      {
        id: "livraison-3",
        title: "Comment consulter les informations du chauffeur ?",
        intro: "Une fois un chauffeur assigné à une livraison, ses informations (nom, note, type de véhicule) sont visibles depuis le détail de la livraison.",
        steps: [
          "Ouvrez la livraison concernée depuis « Livraison des commandes ».",
          "Les informations du chauffeur ou de l'entreprise de livraison assignée apparaissent dans le détail.",
        ],
      },
      {
        id: "livraison-4",
        title: "Comment gérer un problème de livraison ?",
        intro: "Si une livraison pose un problème, vous pouvez la réassigner ou contacter le support.",
        steps: [
          "Ouvrez la livraison concernée depuis « Livraison des commandes ».",
          "Si possible, réassignez-la à un autre chauffeur ou à une autre entreprise de livraison.",
          "Pour un problème que vous ne pouvez pas résoudre vous-même, contactez le support via Communication.",
        ],
      },
    ],
  },
  {
    id: "paiements",
    label: "Paiements et factures",
    icon: Wallet,
    articles: [
      {
        id: "paiements-1",
        title: "Comprendre les paiements fournisseurs",
        intro: "Vos paiements sont calculés automatiquement à partir de vos commandes livrées : la page « Paiements » affiche, pour chaque commande, le montant brut, la commission de la plateforme et le montant net qui vous revient.",
        steps: [
          "Allez dans « Paiements » depuis le menu principal.",
          "Chaque ligne correspond à une commande livrée à un café, avec son statut de paiement : « À verser », « À venir » ou « Annulé ».",
          "Une commande passe au statut « À verser » dès qu'elle est marquée comme livrée.",
        ],
        related: ["paiements-3", "paiements-6"],
      },
      {
        id: "paiements-2",
        title: "Consulter son historique de paiements",
        intro: "L'historique complet de vos paiements est disponible sur la page « Paiements », avec recherche et filtres.",
        steps: [
          "Ouvrez « Paiements ».",
          "Utilisez la recherche (par café) et les filtres (statut, date, montant) pour retrouver un paiement précis.",
          "Cliquez sur une carte de paiement pour voir le détail complet (montant brut, commission, montant net, mode de paiement).",
        ],
      },
      {
        id: "paiements-3",
        title: "Comprendre les statuts de paiement",
        intro: "Trois statuts existent : « À verser » (commande livrée, montant dû), « À venir » (commande pas encore livrée) et « Annulé » (commande annulée, aucun montant dû).",
        steps: [
          "Consultez le filtre de statut sur la page « Paiements » pour isoler un type de paiement.",
          "Pour toute question sur le calendrier exact de versement des montants « À verser », qui n'est pas affiché dans l'application, contactez le support via Communication.",
        ],
      },
      {
        id: "paiements-4",
        title: "Consulter ses factures",
        intro: "Chaque commande livrée génère automatiquement une facture numérique, disponible depuis la page « Factures ».",
        steps: [
          "Allez dans « Factures » depuis le menu principal.",
          "Cliquez sur une facture pour l'ouvrir en détail.",
          "Utilisez le bouton d'impression dans la fenêtre de détail pour imprimer ou enregistrer la facture en PDF depuis votre navigateur.",
        ],
        related: ["paiements-5"],
      },
      {
        id: "paiements-5",
        title: "Télécharger les informations disponibles",
        intro: "La facture numérique peut être imprimée ou enregistrée en PDF directement depuis votre navigateur.",
        steps: [
          "Ouvrez la facture concernée depuis « Factures ».",
          "Utilisez le bouton d'impression (icône imprimante) dans l'en-tête de la fenêtre.",
          "Choisissez « Enregistrer au format PDF » dans la fenêtre d'impression de votre navigateur si vous souhaitez conserver un fichier.",
        ],
      },
      {
        id: "paiements-6",
        title: "Comprendre les commissions et les montants versés",
        intro: "La plateforme applique une commission fixe de 5 % sur le montant de chaque commande livrée. Le montant net qui vous revient correspond au montant de la commande moins cette commission.",
        steps: [
          "Le détail du calcul (montant brut, commission, montant net) est visible sur chaque carte et chaque fiche de paiement.",
          "Cette commission de 5 % est la même pour toutes les commandes livrées, sans exception affichée dans l'application.",
          "Pour toute question sur les modalités exactes de versement bancaire, contactez le support via Communication : cette information n'est pas gérée dans l'application.",
        ],
      },
    ],
  },
  {
    id: "promotions",
    label: "Promotions et codes promotionnels",
    icon: Tag,
    articles: [
      {
        id: "promotions-1",
        title: "Comment créer un code promotionnel ?",
        intro: "Les codes promotionnels se créent depuis la page « Codes promotionnels ».",
        steps: [
          "Allez dans « Codes promotionnels » depuis le menu Marketing.",
          "Cliquez sur « Nouveau code ».",
          "Renseignez le code, la réduction (pourcentage ou montant fixe), la limite d'utilisation et, si besoin, une date d'expiration.",
          "Enregistrez pour activer le code.",
        ],
        related: ["promotions-2", "promotions-3"],
      },
      {
        id: "promotions-2",
        title: "Comment configurer une réduction ?",
        intro: "Les promotions (campagnes) proposent plusieurs types de réduction : réduction en pourcentage, montant fixe, ou offre « Achetez X, obtenez Y ».",
        steps: [
          "Allez dans « Promotions » depuis le menu Marketing.",
          "Créez une nouvelle promotion et choisissez le type de réduction souhaité.",
          "Définissez les produits concernés et les conditions de la promotion, puis enregistrez.",
        ],
      },
      {
        id: "promotions-3",
        title: "Comment suivre les utilisations d'un code ?",
        intro: "Le nombre d'utilisations de chaque code promotionnel est visible directement sur la page « Codes promotionnels ».",
        steps: [
          "Ouvrez « Codes promotionnels ».",
          "Consultez la limite d'utilisation et le nombre d'utilisations déjà enregistrées pour chaque code.",
        ],
      },
      {
        id: "promotions-4",
        title: "Comment gérer les promotions actives et expirées ?",
        intro: "Les promotions et codes promotionnels affichent leur statut (actif, expiré, limite atteinte) directement dans leur liste respective.",
        steps: [
          "Ouvrez « Promotions » ou « Codes promotionnels ».",
          "Utilisez les filtres de statut pour distinguer les éléments actifs des éléments expirés ou arrivés à leur limite d'utilisation.",
          "Vous pouvez modifier ou désactiver une promotion ou un code existant depuis sa fiche.",
        ],
      },
    ],
  },
  {
    id: "communication",
    label: "Communication et relation clients",
    icon: MessageCircle,
    articles: [
      {
        id: "communication-1",
        title: "Comment communiquer avec les cafés ?",
        intro: "La Communication regroupe la messagerie, les notifications et les avis reçus de vos clients cafés.",
        steps: [
          "Allez dans « Communication » depuis le menu Marketing.",
          "L'onglet « Messages » permet de démarrer ou poursuivre une conversation avec un café, ou avec le support.",
        ],
      },
      {
        id: "communication-2",
        title: "Comment consulter les messages ?",
        intro: "Toutes vos conversations sont centralisées dans l'onglet « Messages » de la Communication.",
        steps: [
          "Ouvrez « Communication » puis l'onglet « Messages ».",
          "Sélectionnez une conversation existante, ou démarrez-en une nouvelle.",
        ],
      },
      {
        id: "communication-3",
        title: "Comment gérer les notifications ?",
        intro: "L'onglet « Notifications » de la Communication liste vos alertes (nouvelles commandes, avis, etc.).",
        steps: [
          "Ouvrez « Communication » puis l'onglet « Notifications ».",
          "Consultez ou marquez vos notifications comme lues.",
        ],
      },
      {
        id: "communication-4",
        title: "Comment répondre aux demandes des clients ?",
        intro: "Pour répondre à un café, utilisez directement la messagerie.",
        steps: [
          "Ouvrez « Communication » puis l'onglet « Messages ».",
          "Ouvrez la conversation avec le café concerné et répondez directement.",
        ],
      },
    ],
  },
  {
    id: "parametres",
    label: "Paramètres et sécurité",
    icon: Settings,
    articles: [
      {
        id: "parametres-1",
        title: "Comment modifier les informations du compte ?",
        intro: "Vos informations personnelles et commerciales se modifient depuis Paramètres.",
        steps: [
          "Allez dans « Paramètres » depuis le menu Compte.",
          "Modifiez la section « Profil » ou « Informations commerciales » selon le besoin.",
          "Enregistrez vos modifications.",
        ],
      },
      {
        id: "parametres-2",
        title: "Comment gérer les paramètres de la boutique ?",
        intro: "L'apparence et les horaires de votre boutique se configurent depuis la page « Boutique » (si cette section est activée pour votre compte).",
        steps: [
          "Allez dans « Boutique » depuis le menu principal.",
          "Modifiez les sections « Détails de la boutique », « Médias d'arrière-plan » ou « Horaires d'ouverture » selon le besoin.",
        ],
        related: ["demarrage-4"],
      },
      {
        id: "parametres-3",
        title: "Comment gérer les informations de connexion ?",
        intro: "Votre mot de passe et vos informations de connexion se gèrent depuis la section « Sécurité » de Paramètres.",
        steps: [
          "Allez dans « Paramètres » depuis le menu Compte.",
          "Ouvrez la section « Sécurité ».",
          "Mettez à jour votre mot de passe ou vos informations de connexion.",
        ],
      },
      {
        id: "parametres-4",
        title: "Comment contacter le support en cas de problème d'accès ?",
        intro: "Si vous rencontrez un problème de connexion ou d'accès à votre compte, contactez le support via la messagerie.",
        steps: [
          "Si vous êtes connecté, ouvrez « Communication » → « Messages » et décrivez votre problème au support.",
          "Si vous ne pouvez pas vous connecter du tout, rapprochez-vous de votre administrateur par un autre canal pour obtenir de l'aide.",
        ],
      },
    ],
  },
];

// ── Popular guides ─────────────────────────────────────────────────────────────

export const GUIDES: Guide[] = [
  {
    id: "guide-1",
    title: "Créer sa première fiche produit",
    intro: "Ce guide vous accompagne pas à pas pour publier votre premier produit sur BigBossCoffee.",
    steps: [
      "Allez dans « Produits » → onglet « Nouveau produit ».",
      "Renseignez le nom, la description, la catégorie, la sous-catégorie et la marque. Si la catégorie dont vous avez besoin n'existe pas, proposez-la depuis « Catégories » → « Demandes ».",
      "Ajoutez une image principale et, si besoin, des images supplémentaires.",
      "Si votre produit existe en plusieurs saveurs ou tailles, configurez les variantes avec leur prix et leur stock respectifs.",
      "Soumettez le produit : il sera visible sur la marketplace une fois validé.",
    ],
    related: ["boutique-produits-1", "boutique-produits-6"],
  },
  {
    id: "guide-2",
    title: "Configurer sa boutique fournisseur",
    intro: "Une boutique bien configurée aide les Coffee Owners à mieux vous connaître et à trouver vos produits.",
    steps: [
      "Allez dans « Boutique » depuis le menu principal.",
      "Complétez les « Détails de la boutique » (nom, description).",
      "Ajoutez des « Médias d'arrière-plan » représentatifs de votre activité.",
      "Renseignez vos « Horaires d'ouverture ».",
      "Enregistrez chaque section au fur et à mesure.",
    ],
    related: ["demarrage-4", "parametres-2"],
  },
  {
    id: "guide-3",
    title: "Gérer efficacement son catalogue",
    intro: "Un catalogue bien tenu (produits à jour, stock exact, informations complètes) facilite les commandes et évite les erreurs.",
    steps: [
      "Passez régulièrement en revue vos produits depuis « Mes produits ».",
      "Tenez vos niveaux de stock à jour depuis « Stock », notamment après chaque commande importante.",
      "Utilisez les catégories et sous-catégories appropriées pour que vos produits soient facilement trouvés.",
      "Consultez le catalogue administrateur pour ajouter rapidement des produits de référence déjà existants.",
    ],
    related: ["boutique-produits-7", "stock-1"],
  },
  {
    id: "guide-4",
    title: "Traiter les commandes",
    intro: "Un traitement rapide et clair des commandes améliore votre relation avec les cafés clients.",
    steps: [
      "Consultez régulièrement « Commandes » pour repérer les nouvelles commandes.",
      "Faites évoluer le statut de chaque commande selon l'avancement réel de sa préparation.",
      "Une fois la commande prête, gérez sa livraison depuis « Livraison des commandes » (assignation à un chauffeur ou à une entreprise partenaire).",
      "En cas de demande de retour, traitez-la depuis « Retours » si cette fonctionnalité est activée pour votre compte.",
    ],
    related: ["commandes-2", "livraison-1"],
  },
  {
    id: "guide-5",
    title: "Suivre ses paiements",
    intro: "Comprendre où en sont vos paiements vous aide à mieux piloter votre activité.",
    steps: [
      "Ouvrez « Paiements » pour voir, pour chaque commande livrée, le montant brut, la commission de 5 % et le montant net qui vous revient.",
      "Utilisez les filtres de statut pour isoler les paiements « À verser » des paiements « À venir ».",
      "Consultez vos factures correspondantes depuis « Factures ».",
      "Pour toute question sur le calendrier exact de versement, contactez le support : cette information n'est pas affichée dans l'application.",
    ],
    related: ["paiements-1", "paiements-6"],
  },
  {
    id: "guide-6",
    title: "Créer une campagne promotionnelle",
    intro: "Les promotions et les codes promotionnels permettent de dynamiser vos ventes auprès des cafés.",
    steps: [
      "Pour une promotion automatique sur vos produits, allez dans « Promotions » et choisissez un type de réduction (pourcentage, montant fixe, ou offre « Achetez X, obtenez Y »).",
      "Pour un code à usage unique ou limité, allez plutôt dans « Codes promotionnels » et créez un nouveau code avec sa réduction, sa limite d'utilisation et, si besoin, sa date d'expiration.",
      "Suivez les utilisations et le statut (actif/expiré) de vos promotions et codes depuis leurs pages respectives.",
    ],
    related: ["promotions-1", "promotions-2"],
  },
];

// ── FAQ ─────────────────────────────────────────────────────────────────────────

export const FAQS: FaqItem[] = [
  {
    id: "faq-1",
    q: "Comment ajouter un nouveau produit ?",
    a: "Allez dans Produits → onglet « Nouveau produit », renseignez le nom, la description, la catégorie, la sous-catégorie, la marque et les variantes (saveurs/tailles) si nécessaire, puis soumettez le produit. Il sera visible sur la marketplace une fois validé.",
  },
  {
    id: "faq-2",
    q: "Quand vais-je recevoir mon paiement ?",
    a: "Une commande passe au statut « À verser » dès qu'elle est marquée comme livrée — vous pouvez suivre ce statut depuis la page Paiements. L'application ne modélise pas de date précise de virement bancaire ; pour connaître le calendrier exact de versement, contactez le support via Communication.",
  },
  {
    id: "faq-3",
    q: "Comment traiter une demande de retour ?",
    a: "Allez dans Retours (si cette fonctionnalité est activée pour votre compte), ouvrez la demande concernée et approuvez-la ou rejetez-la selon votre analyse. L'approbation ou le rejet mettent à jour le statut de la demande ; aucune déduction automatique sur un paiement n'est appliquée par l'application à cette occasion.",
  },
  {
    id: "faq-4",
    q: "Comment créer un code promotionnel ?",
    a: "Allez dans Codes promotionnels (menu Marketing), cliquez sur « Nouveau code » et renseignez le code, la réduction, la limite d'utilisation et, si besoin, une date d'expiration.",
  },
  {
    id: "faq-5",
    q: "Quel est le taux de commission de la plateforme ?",
    a: "La plateforme applique une commission fixe de 5 % sur le montant de chaque commande livrée. Le détail (montant brut, commission, montant net) est visible sur chaque carte et chaque fiche de paiement, dans Paiements.",
  },
  {
    id: "faq-6",
    q: "Comment mettre à jour mon stock de produits ?",
    a: "Allez dans Stock, repérez le produit ou la variante concernée et ajustez la quantité disponible. Vous pouvez aussi modifier le stock directement depuis la fiche du produit dans Mes produits.",
  },
  {
    id: "faq-7",
    q: "Puis-je proposer des tarifs personnalisés à certains cafés ?",
    a: "Il n'existe pas de fonctionnalité de tarif personnalisé par café dans l'application. Vous pouvez en revanche créer des codes promotionnels et les communiquer aux cafés concernés pour leur offrir une réduction ciblée.",
  },
  {
    id: "faq-8",
    q: "Pourquoi mon produit n'apparaît-il pas dans la boutique ?",
    a: "Vérifiez d'abord que le produit a bien été validé (statut Actif, visible depuis Mes produits) et que son stock n'est pas à zéro — un stock épuisé rend un produit indisponible à l'achat. Si le produit reste invisible malgré un statut actif et un stock disponible, contactez le support via Communication.",
  },
  {
    id: "faq-9",
    q: "Pourquoi ma demande de catégorie est-elle en attente ?",
    a: "Toute proposition de nouvelle catégorie, sous-catégorie, marque, saveur ou taille passe par une validation de l'administration avant d'être intégrée au catalogue. Le statut « En attente » signifie simplement que cet examen n'a pas encore eu lieu ; vous pouvez suivre son évolution depuis Catégories → Demandes.",
  },
  {
    id: "faq-10",
    q: "Comment modifier le prix d'un produit ?",
    a: "Ouvrez le produit concerné depuis Mes produits et modifiez le prix de la ou des variantes concernées, puis enregistrez.",
  },
  {
    id: "faq-11",
    q: "Comment vérifier les quantités disponibles ?",
    a: "La page Stock affiche la quantité disponible pour chaque produit et chaque variante, avec des filtres pour retrouver rapidement un article précis.",
  },
  {
    id: "faq-12",
    q: "Comment suivre une commande ?",
    a: "Ouvrez la commande concernée depuis la page Commandes : son statut (en attente, confirmée, en préparation, prête, en livraison, livrée ou annulée) ainsi que, le cas échéant, le détail de sa livraison y sont affichés.",
  },
  {
    id: "faq-13",
    q: "Comment consulter mes factures ?",
    a: "Allez dans Factures : chaque commande livrée y génère automatiquement une facture numérique, consultable et imprimable depuis sa fiche de détail.",
  },
  {
    id: "faq-14",
    q: "Où consulter l'historique de mes paiements ?",
    a: "La page Paiements affiche l'historique complet de vos commandes livrées avec leur statut de paiement, avec recherche et filtres par date, statut ou montant.",
  },
  {
    id: "faq-15",
    q: "Comment contacter un client ?",
    a: "Utilisez Communication → Messages pour démarrer ou poursuivre une conversation directement avec le café concerné.",
  },
  {
    id: "faq-16",
    q: "Que faire si une commande contient une erreur ?",
    a: "Contactez directement le café concerné depuis Communication pour clarifier la situation. Si l'erreur nécessite une intervention que vous ne pouvez pas effectuer vous-même, contactez le support via Communication également.",
  },
  {
    id: "faq-17",
    q: "Que faire si un paiement semble incorrect ?",
    a: "Ouvrez le détail du paiement concerné depuis Paiements pour vérifier le montant brut, la commission de 5 % appliquée et le montant net. Si un écart reste inexpliqué après cette vérification, contactez le support via Communication en précisant la commande concernée.",
  },
  {
    id: "faq-18",
    q: "Comment modifier les informations de ma boutique ?",
    a: "Allez dans Boutique (si cette section est activée pour votre compte) et modifiez les sections Détails de la boutique, Médias d'arrière-plan ou Horaires d'ouverture, puis enregistrez.",
  },
  {
    id: "faq-19",
    q: "Comment signaler un problème technique ?",
    a: "Décrivez le problème rencontré via Communication → Messages, en précisant la page concernée et les étapes qui ont mené au problème : cela aide le support à le diagnostiquer rapidement.",
  },
];

export const POPULAR_QUESTION_IDS = ["faq-1", "faq-2", "faq-6", "faq-5"];
