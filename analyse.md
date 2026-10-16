# Analyse — Ajout de l'onglet Véhicules pour Supplier → Order Delivery

## 1. Implémentation existante (Espace Livraison → Business → Véhicules)

- **Route** : `/delivery/vehicles` redirige actuellement, sans branchement de rôle, vers
  `/delivery/business?tab=vehicles` (`client/src/App.tsx:841`).
- **Page** : `client/src/pages/delivery/business.tsx` (`SubTabSwitcher`) rend l'onglet
  `vehicles` → `<DeliveryVehiclesPage />` (`client/src/pages/delivery/vehicles-page.tsx`).
- **UI** : `vehicles-page.tsx` contient, dans un seul fichier :
  - `VehicleFormDialog` (Ajouter/Modifier un véhicule — Dialog shadcn, déjà standardisé avec
    le bouton de fermeture de référence `hideClose` + bouton `p-1.5 rounded-full ...`).
  - La page elle-même : `DashboardHero` (icône Truck, dégradé teal), grille de cartes
    véhicule (type/marque/modèle/matricule/climatisation/statut actif/chauffeur assigné),
    pagination (`usePagination`/`DataPagination`), état vide, squelettes de chargement.
- **Hooks** (`client/src/hooks/use-delivery-ecosystem.ts`) : `useVehicles`,
  `useCreateVehicle`, `useUpdateVehicle`, `useDeleteVehicle`, `useAssignVehicle` — **déjà
  génériques**, paramétrés par `ownerType: "DELIVERY_COMPANY" | "SUPPLIER"`
  (`vehicleOwnerPath` bascule entre `/api/delivery-company/vehicles` et
  `/api/supplier/vehicles`).
- **API serveur** (`server/routes.ts:6118-6189`) : `vehicleOwnerRoutes(ownerType, requireOwner)`
  est une fonction générique déjà appelée deux fois :
  `vehicleOwnerRoutes('DELIVERY_COMPANY', requireApprovedDeliveryCompany)` **et**
  `vehicleOwnerRoutes('SUPPLIER', requireApprovedSupplier)`. Les routes
  `GET/POST/PATCH/DELETE /api/supplier/vehicles[...]` et
  `PATCH /api/supplier/vehicles/:id/assign` **existent déjà et sont pleinement
  fonctionnelles** — aucun endpoint à créer.
- **Modèle de données** (`shared/schema.ts:583-609`) : la table `vehicles` a toujours eu
  `ownerType: deliveryModeEnum` (`DELIVERY_COMPANY | SUPPLIER`) + `ownerId`, exactement le
  même modèle XOR-owner que `users.deliveryCompanyId`/`users.supplierId`. **Aucune migration
  n'est nécessaire** — le schéma supporte déjà un véhicule détenu par un Supplier.
- **Permissions côté serveur** (`server/storage.ts:4686-4747`) : chaque méthode
  (`getVehiclesForOwner`, `createVehicle`, `updateVehicle`, `deleteVehicle`,
  `assignVehicleToDriver`) filtre/contraint systématiquement par
  `(ownerType, ownerId)` dans la clause `WHERE`, et `ownerId` est **toujours dérivé de
  `req.session.userId` côté route**, jamais pris du corps de la requête. `createVehicle`
  retire explicitement tout `ownerType`/`ownerId`/`id` envoyé par le client avant insertion.
  `assignVehicleToDriver` vérifie en plus que le chauffeur cible appartient réellement à cet
  `ownerId` (`driver.supplierId === ownerId` ou `driver.deliveryCompanyId === ownerId`) avant
  d'autoriser l'assignation. **L'isolation multi-tenant est donc déjà garantie côté serveur.**

## 2. Structure actuelle des onglets Supplier → Order Delivery

- **Switcher** : `client/src/components/delivery/supplier-delivery-tabs.tsx` — 3 onglets
  (Delivery Status → `/supplier/delivery-status`, My Deliveries → `/delivery/my-deliveries`,
  Drivers → `/delivery/drivers`), rendu par `wouter` `<Link>`, style pill déjà existant.
- **Routing** (`App.tsx`) : `/delivery/my-deliveries` et `/delivery/drivers` sont des routes
  "à branchement de rôle" (`MyDeliveriesRoute`/`DriversRoute`, lignes 255-264) : si
  `user.role === "SUPPLIER"` → page Supplier dédiée ; sinon → redirection vers
  `/delivery/business?tab=...` (expérience Delivery Company inchangée). C'est exactement le
  même précédent architectural que je dois reproduire pour `/delivery/vehicles`.
- **Page Drivers de référence** : `client/src/pages/supplier/delivery-drivers-page.tsx` —
  `DashboardHero("Delivery")` + `<SupplierDeliveryTabs />` + `<DriverRosterView
  useDrivers={useSupplierDrivers} useCreateDriver={useCreateSupplierDriver} .../>`.
  `DriverRosterView` (`client/src/components/delivery/driver-roster-view.tsx`) est **déjà**
  un composant partagé Delivery Company / Supplier, paramétré par `ownerType` optionnel et un
  bouton d'en-tête conditionnel (`DashboardHero` si `heroGradientClass` fourni — cas Delivery
  Company — sinon bloc titre/sous-titre simple — cas Supplier). C'est le patron exact à
  reproduire pour les véhicules.

## 3. Modèle de propriété — différences Delivery Company / Supplier

Aucune différence structurelle : les deux sont des "opérateurs" au sens du schéma
(`deliveryModeEnum`), chacun avec son propre jeu de chauffeurs (`users.deliveryCompanyId` /
`users.supplierId`) et désormais son propre jeu de véhicules (`vehicles.ownerType`/`ownerId`).
Le Supplier qui gère sa propre flotte est un cas déjà prévu par le schéma et par l'API — seule
la page Supplier côté client manquait.

## 4. Fichiers à modifier/créer

1. **Créer** `client/src/components/delivery/vehicle-fleet-view.tsx` — extraction de la liste
   de véhicules + `VehicleFormDialog` depuis `delivery/vehicles-page.tsx`, paramétrée par
   `ownerType`, `useDrivers`, `title`/`subtitle`, et les props d'en-tête optionnelles
   (`heroGradientClass`/`heroIconBgClass`/`heroIconTextClass`) — même patron que
   `DriverRosterView`. Aucune logique métier nouvelle, uniquement un découpage du JSX/état
   déjà existant dans `vehicles-page.tsx`, pour éviter toute duplication.
2. **Modifier** `client/src/pages/delivery/vehicles-page.tsx` — devient un wrapper fin qui
   appelle `VehicleFleetView` avec `ownerType="DELIVERY_COMPANY"`, `useDrivers=
   {useDeliveryCompanyDrivers}` et les mêmes title/subtitle/icône/dégradé qu'aujourd'hui.
   Comportement visuel et fonctionnel strictement identique pour Delivery Company.
3. **Créer** `client/src/pages/supplier/vehicles-page.tsx` — même structure que
   `supplier/delivery-drivers-page.tsx` : `DashboardHero("Delivery")` +
   `<SupplierDeliveryTabs />` + `<VehicleFleetView ownerType="SUPPLIER"
   useDrivers={useSupplierDrivers} .../>`.
4. **Modifier** `client/src/components/delivery/supplier-delivery-tabs.tsx` — ajouter le 4e
   onglet `{ label: "Véhicules", href: "/delivery/vehicles" }`.
5. **Modifier** `client/src/App.tsx` — remplacer la redirection inconditionnelle de
   `/delivery/vehicles` par une route à branchement de rôle (`VehiclesRoute`, même patron que
   `MyDeliveriesRoute`/`DriversRoute`) : Supplier → nouvelle page ; sinon → redirection
   inchangée vers `/delivery/business?tab=vehicles`.

Aucun changement serveur, aucun changement de schéma, aucun hook à créer (tout existe déjà).

## 5. Stratégie d'implémentation minimale

Extraction de composant pure côté client (aucune logique dupliquée), + une route à
branchement de rôle suivant un patron déjà présent deux fois dans la base de code
(`MyDeliveriesRoute`, `DriversRoute`). Zéro changement côté API/DB/permissions — tout est déjà
générique et sécurisé.

## 6. Rétrocompatibilité et sécurité

- Delivery Company : comportement, route, et apparence de `/delivery/business?tab=vehicles`
  strictement inchangés (même composant visuel, juste importé depuis le nouveau composant
  partagé avec les mêmes props qu'avant).
- Supplier : nouvelle route/page, isolée par `ownerType="SUPPLIER"` déjà appliqué côté
  serveur — un Supplier ne peut ni lister, ni modifier, ni supprimer, ni assigner un véhicule
  d'un autre Supplier ou d'une Delivery Company (vérifié dans `storage.ts`, voir §1).
- Aucun identifiant de propriétaire n'est jamais envoyé par le client ; il est toujours
  dérivé de `req.session.userId` côté serveur.

## 7. Tests prévus

- `npx tsc --noEmit`, `npm run build`.
- Vérification manuelle du code (pas de navigateur disponible dans cet environnement) :
  relecture des fichiers modifiés pour confirmer qu'aucun comportement Delivery Company n'a
  changé, que l'onglet Supplier apparaît et route correctement, et que la Dialog d'ajout de
  véhicule utilise le bouton de fermeture déjà standardisé.

---

# Analyse — Synchronisation des images (Profil / Cover / Flash) avec l'interface Coffee Owner

Tâche distincte, scope séparé du Véhicules ci-dessus. Trois sous-audits en parallèle
(Academy+Barista, Marketing+Print, Delivery+Chauffeur+Maintenance) ont établi les faits
ci-dessous avant toute modification.

## 1. Où vivent les trois champs

Les trois champs sont génériques sur `users` (`shared/schema.ts`) pour tous les rôles
professionnels : `profileImageUrl`, `coverImageUrl`, `flashImageUrl`. Édités via
Paramètres → Compte, même convention partout — confirmé, aucun changement nécessaire ici.

## 2. Quels contextes Coffee Owner existent réellement, par type de compte

| Type | (A) Carte mappée | (B) Cover du détail | (C) Hero Fast Search |
|---|---|---|---|
| Barista Academy | `AcademyStoreCardTile` (`pages/cafe/barista/barista-academy-page.tsx`) | `AcademyProfileModal` (`components/academy/academy-profile-modal.tsx`) | **N'existe pas au niveau compte** — `AcademyFastSearch` est au niveau cours (`courseId`), pas académie. Non inventé, conformément à la consigne. |
| Barista Marketplace | `BaristaCard` (`pages/cafe/barista/barista-page.tsx`) | `BaristaDetailModal` (`components/barista/barista-detail-modal.tsx`) | `BaristaFastSearch` (`components/barista/barista-fast-search.tsx`) — seul type avec un vrai Fast Search au niveau compte |
| Espace Livraison | — | existe en code (`delivery-company-detail-modal.tsx`) mais **jamais ouvert par un Coffee Owner** (aucun import sous `pages/cafe/**`) | n'existe pas |
| Espace Chauffeur | — | n'existe pas pour Coffee Owner (aucun fichier sous `pages/cafe/**` ne référence un chauffeur) | n'existe pas |
| Maintenance | `AgentCard` (`pages/cafe/maintenance/maintenance-page.tsx`) | `AgentDetailModal` (même fichier) | `MaintenanceFastSearch` (`components/maintenance/maintenance-fast-search.tsx`) |
| Marketing | `MarketingStoreCardTile` (`pages/cafe/marketing/marketing-page.tsx`) | `MarketingDetailModal` (`components/marketing/marketing-detail-modal.tsx`) | Pas de Fast Search compte-niveau (`marketing-fast-search.tsx` est service-niveau) — l'équivalent réel est `FlashPreviewModal`, ouvert via le bouton éclair du détail modal |
| Imprimerie | `PrintStoreCardTile` (`pages/cafe/print/print-page.tsx`) | `PrintCompanyDetailModal` (`components/print/print-company-detail-modal.tsx`) | Idem Marketing — `FlashPreviewModal` via le bouton éclair |

**Espace Livraison et Espace Chauffeur sont hors scope** : aucune des trois surfaces n'est
jamais atteinte par un Coffee Owner. Confirmé par grep des importeurs, pas supposé. Aucun
écran n'a été inventé pour eux, conformément à la consigne.

## 3. Écart serveur trouvé (avant modification)

Deux endpoints "liste" (alimentant le contexte A) omettaient `coverImageUrl` dans l'objet
carte construit côté serveur, alors que leur TYPE TypeScript le déclarait déjà et que leur
endpoint "détail" (singulier) l'incluait déjà — exactement le même type de régression déjà
corrigé une fois pour `flashImageUrl` (voir `docs/flash_image_sync_audit.md`) :
- `storage.getMaintenanceProfiles()` (`server/storage.ts`) — `coverImageUrl` jamais assigné.
- `storage.getBaristaMarketplaceProfiles()` (`server/storage.ts`) — même lacune.

Académie, Marketing et Print avaient déjà les trois champs correctement assignés dans leurs
builders de liste — vérifié directement, pas supposé.

## 4. Stratégie d'implémentation

- **`client/src/lib/avatar.ts`** — ajout de 3 fonctions pures nommées par contexte
  (`getCardImageUrl`, `getDetailCoverImageUrl`, `getFastSearchImageUrl`), chacune encapsulant
  l'ordre de priorité exact de la consigne. `getPreferredImageUrl` (2 arguments, Flash→Profil)
  n'est pas modifiée — toujours utilisée ailleurs sans changement de comportement.
- **`client/src/hooks/use-fallback-image.ts`** (nouveau) — hook générique `useFallbackImage`
  qui essaie chaque URL candidate dans l'ordre, avance au suivant sur échec de chargement
  (`onError`), déduplique les URL répétées (pas de boucle), et retombe sur `null` une fois les
  trois épuisées — l'appelant garde alors son propre placeholder existant. Réutilisé partout
  plutôt que ré-implémenté par composant.
- **Cartes mappées (Academy/Barista/Marketing/Maintenance/Print)** — l'image principale
  utilise désormais `useFallbackImage([profil, cover, flash])`. Le petit badge logo secondaire
  (Academy/Marketing/Print — design à deux images préexistant) reste câblé sur le champ brut
  `coverImageUrl` (pas la valeur résolue), pour ne jamais dupliquer la même photo de profil
  deux fois quand Cover est vide et que Profil comble la bannière.
- **Covers des détails** — `useFallbackImage([cover, profil, flash])`, même traitement.
- **Fast Search / Flash hero** — `BaristaFastSearch` et `MaintenanceFastSearch` migrés de leur
  ancien système `flashFailed` (booléen, 2 valeurs) vers le hook partagé avec `[flash, cover,
  profil]`. `FlashPreviewModal` (partagé par ~10 surfaces, dont le Zap du détail Marketing/
  Print) reçoit un nouveau prop optionnel `coverImageUrl` — omis par tous les appelants sauf
  Marketing/Print, donc comportement inchangé pour toutes les autres (préviews "Aperçu Flash"
  propres de chaque compte, hors scope Coffee Owner).

## 5. Fichiers modifiés/créés

| Fichier | Changement |
|---|---|
| `server/storage.ts` | Ajout de `coverImageUrl` dans `getMaintenanceProfiles` et `getBaristaMarketplaceProfiles` |
| `client/src/lib/avatar.ts` | +3 fonctions (`getCardImageUrl`, `getDetailCoverImageUrl`, `getFastSearchImageUrl`) et leur base commune `pickImageUrl` |
| `client/src/hooks/use-fallback-image.ts` | Nouveau hook partagé |
| `client/src/pages/cafe/barista/barista-academy-page.tsx` | `AcademyStoreCardTile` → Profil primaire |
| `client/src/components/academy/academy-profile-modal.tsx` | Cover → Profil → Flash |
| `client/src/pages/cafe/barista/barista-page.tsx` | `BaristaCard` → Profil primaire |
| `client/src/components/barista/barista-detail-modal.tsx` | Cover → Profil → Flash |
| `client/src/components/barista/barista-fast-search.tsx` | Flash → Cover → Profil |
| `client/src/pages/cafe/marketing/marketing-page.tsx` | `MarketingStoreCardTile` → Profil primaire |
| `client/src/components/marketing/marketing-detail-modal.tsx` | Cover → Profil → Flash |
| `client/src/pages/cafe/print/print-page.tsx` | `PrintStoreCardTile` → Profil primaire |
| `client/src/components/print/print-company-detail-modal.tsx` | Cover → Profil → Flash |
| `client/src/pages/cafe/maintenance/maintenance-page.tsx` | `AgentCard` → Profil primaire ; `AgentDetailModal` Cover → Profil → Flash |
| `client/src/components/maintenance/maintenance-fast-search.tsx` | Flash → Cover → Profil |
| `client/src/components/account/flash-preview-modal.tsx` | +prop optionnel `coverImageUrl`, inséré dans la chaîne Flash → Cover → Profil |

## 6. Rétrocompatibilité

- Aucun changement de schéma, aucune nouvelle route, aucun comportement de sauvegarde modifié.
- `getPreferredImageUrl` (signature à 2 arguments) n'a pas été touchée.
- `FlashPreviewModal` : tous les appelants hors Marketing/Print n'ont pas changé de
  comportement (prop optionnel omis → `undefined` → ignoré par le hook).
- Espace Livraison, Espace Chauffeur, Admin, Supplier : aucun fichier modifié.

## 7. Tests exécutés

- `npx tsc --noEmit` — exit 0.
- `npm run build` — succès (2812 modules, contre 2809 avant — les deux nouveaux fichiers).
- Aucun navigateur disponible dans cet environnement — pas de vérification visuelle réelle du
  rendu clair/sombre ni du comportement de repli sur une image cassée en conditions réelles.

---

# Analyse — Aligner Espace Barista Marketplace → Académie sur Coffee Owner `/academy`

Tâche distincte, scope séparé des deux ci-dessus.

## 1. Implémentation Coffee Owner `/academy` (référence)

Fichier : `client/src/pages/cafe/barista/barista-academy-page.tsx` (page unique, pas d'onglets) :

- **Académies** — `AcademyStoresSection`/`AcademyStoreCardTile` (jusqu'à présent définis
  localement, non exportés), alimentées par `useAcademyCompanies()` →
  `GET /api/academy/companies` (déjà sans restriction de rôle). Clic → navigation vers
  `/academy/stores/:academyUserId` (page dédiée) côté Coffee Owner — mais le composant
  réellement utilisé pour afficher le détail d'une académie (y compris la liste de ses
  formations, via `onOpenCourse`) est `AcademyProfileModal`
  (`components/academy/academy-profile-modal.tsx`), déjà conçu comme une **modale**
  autonome, réutilisée ailleurs (Admin, aperçu de l'Académie elle-même) — pas besoin de
  nouvelle route pour en bénéficier.
- **Formations** — grille de `TrainingCard` → `AcademyMappedCourseCard` (déjà un composant
  partagé exporté, `components/academy/academy-mapped-course-card.tsx`), alimentée par
  `useAcademyCourses({ search, level, certification })` — **exactement le même hook que
  Barista Marketplace utilise déjà aujourd'hui**. Clic → `AcademyDetailModal`
  (`components/academy/academy-detail-modal.tsx`, niveau COURS, distinct de
  `AcademyProfileModal` qui est niveau COMPTE).
- **Inscription** — `AcademyDetailModal`'s bouton "S'inscrire" → `EnrollDialog` (défini
  localement dans `barista-academy-page.tsx`, non exporté) → `useCreateAcademyRegistration()`
  → `POST /api/academy/registrations`.
- **Fast Search** — `AcademyFastSearch` (`components/academy/academy-fast-search.tsx`),
  niveau cours, alimentée par la même liste `courses`.
- **Détection "déjà inscrit"** — calculée dans `AcademyDetailModal` via
  `useAcademyRegistrations()` (pas sur la carte elle-même ; la carte mappée Coffee Owner n'a
  pas cet indicateur non plus — fidèle à la référence, je ne l'invente pas pour Barista).

## 2. Implémentation Barista Marketplace → Académie (état actuel)

Fichier : `client/src/pages/barista-marketplace/academy.tsx` — page à onglets (`Formations` /
`Mes Formations`), déjà alimentée par les **mêmes hooks exacts** que Coffee Owner
(`useAcademyCourses`, `useCreateAcademyRegistration`, `useAcademyRegistrations`,
`useUpdateAcademyRegistrationStatus`, `useCreateAcademyReview`, etc., tous dans
`@/hooks/use-barista-academy`) — mais :
- Aucune découverte au niveau académie (pas de `AcademyStoresSection` équivalent).
- Cartes de formation génériques (`Card`/`CardContent` ad hoc), pas `AcademyMappedCourseCard`.
- Un seul `EnrollDialog` combinant détail + formulaire d'inscription (alors que la référence
  sépare détail (`AcademyDetailModal`) et inscription (`EnrollDialog`) en deux étapes).
- `Mes Formations`/`RegistrationDetail` : déjà corrects, scope-és à l'utilisateur authentifié
  via `useAcademyRegistrations()` (qui route déjà vers `getAcademyRegistrationsForBarista`
  côté serveur, confirmé dans `server/routes.ts`) — **à préserver tel quel**.

## 3. Confirmation : aucun changement backend nécessaire

`server/routes.ts` :
- `GET /api/academy/registrations` bascule déjà explicitement sur
  `storage.getAcademyRegistrationsForBarista(user.id)` quand `user.role === "BARISTA_MARKETPLACE"`.
- `POST /api/academy/registrations` (`requireApprovedAcademyRegistrant`, qui autorise déjà
  `CAFE_OWNER` **et** `BARISTA_MARKETPLACE`) fixe déjà `participantType` correctement selon
  le rôle.
- `GET /api/academy/companies`, `GET /api/academy/courses/:id`, `GET /api/academy/profile/:userId`,
  `/api/academy-favorites*` : aucun n'est restreint à un rôle spécifique au-delà de
  `requireAuth`/visibilité-publique.

Tout l'écosystème Academy a donc déjà été conçu générique multi-rôle — confirmé en lisant le
code serveur, pas supposé.

## 4. Seul écart réel trouvé

`AcademyDetailModal` et `AcademyProfileModal` codent en dur `navigate("/cafe/messages?...")`
dans leur `handleMessage` — correct pour Coffee Owner, faux pour un Barista (qui doit atterrir
sur `/barista-marketplace/messages`). C'est le seul point nécessitant une modification de ces
deux composants partagés.

## 5. Stratégie d'implémentation minimale

1. **Extraire** `AcademyStoreCardTile`/`AcademyStoresSection` de `barista-academy-page.tsx`
   vers un nouveau fichier partagé `components/academy/academy-stores-section.tsx` (export,
   déplacement mécanique — zéro changement de comportement pour Coffee Owner). Autorisé
   explicitement par la consigne ("create a shared component ... without changing the Coffee
   Owner page's current appearance or behavior").
2. **Exporter** `EnrollDialog` de `barista-academy-page.tsx` (ajout du mot-clé `export`) pour
   le réutiliser depuis Barista Marketplace — il est déjà générique (ne dépend d'aucune donnée
   spécifique à Coffee Owner).
3. **Ajouter un prop optionnel** `messagesBasePath` (défaut `"/cafe/messages"`, donc
   zéro changement pour tout appelant existant) à `AcademyDetailModal` et
   `AcademyProfileModal`, utilisé à la place du chemin codé en dur.
4. **Réécrire** `pages/barista-marketplace/academy.tsx`'s `FormationsTab` pour :
   - Afficher `AcademyStoresSection` (académies) au-dessus de la grille de formations.
   - Remplacer les cartes de formation ad hoc par `AcademyMappedCourseCard` (via un petit
     wrapper local, miroir de `TrainingCard`).
   - Clic sur une académie → `AcademyProfileModal` (modale, pas de nouvelle route) avec
     `messagesBasePath="/barista-marketplace/messages"`.
   - Clic sur une formation → `AcademyDetailModal` (même prop), dont le bouton "S'inscrire"
     ouvre le `EnrollDialog` réimporté (désormais exporté) de `barista-academy-page.tsx`.
   - Supprimer l'ancien `EnrollDialog` local, désormais redondant.
   - Conserver la barre de recherche/filtres, la pagination (`usePagination`/`DataPagination`)
     et les onglets Formations/Mes Formations existants tels quels.
5. **Ne pas toucher** à `MesFormationsTab`/`RegistrationDetail` — déjà corrects et scope-és.

## 6. Risques de régression et garde-fous

- `AcademyDetailModal`/`AcademyProfileModal` lisent leur propre état sombre/clair via
  `useThemeStore` directement (pas de prop `isDark` requis) — sûrs à réutiliser tels quels
  dans Barista Marketplace sans aucune adaptation du mécanisme de thème.
- `EnrollDialog` (Coffee Owner) prend `isDark` en prop — Barista Marketplace devra appeler
  `useThemeStore((s) => s.isDark)` une fois dans sa page et le transmettre.
- Le système de favoris (`useFavorites`, `/api/academy-favorites*`) est déjà générique
  (`requireAuth` seulement) — réutilisable sans changement.
- Aucune migration de schéma, aucun nouvel endpoint, aucun changement de permission.

## 7. Tests prévus

- `npx tsc --noEmit`, `npm run build`.
- Relecture manuelle de chaque fichier modifié pour confirmer que le comportement Coffee
  Owner (page/modales/navigation) reste identique.
- Aucun navigateur disponible dans cet environnement — pas de test de clic réel.

---

# Analyse — Consolider Dashboard, Analytics et Earnings sous "Performance" (sidebar Admin)

Tâche distincte, scope séparé des précédentes.

## 1. État actuel

- **Sidebar** : `client/src/components/layout/app-sidebar.tsx`. Le groupe Admin "MANAGEMENT"
  (lignes ~105-115) contient trois entrées distinctes :
  `{ title: "Dashboard", url: "/", icon: LayoutDashboard }`,
  `{ title: "Analytics", url: "/admin/analytics", icon: BarChart2 }`,
  `{ title: "Earnings", url: "/admin/earnings", icon: TrendingUp }`.
  `NavItem` est typé `{ title; url: string; icon }` — une seule URL par item ; `NavLink`
  calcule `isActive` par simple égalité `location === item.url`.
- **Important** : le groupe Supplier (plus bas dans le même fichier) a un trio visuellement
  identique ("Dashboard"/"Analytics"/"Earnings") mais pointant vers des composants
  **différents** (`SupplierDashboard`, `/supplier/analytics`, `/supplier/earnings`) — confirmé
  via `App.tsx`'s `SmartDashboard()` : `user.role === "SUPPLIER"` retourne `<SupplierDashboard/>`
  avant même d'atteindre le `<Dashboard/>` générique. Cette tâche ne touche donc **que** le
  groupe Admin ; le trio Supplier reste intact à l'identique.
- **Routes** (`App.tsx`) :
  - `/` → `HomeRoute` → `SmartDashboard()` → branche par rôle (Supplier/Printer/Marketing/
    Academy/Barista/Maintenance/Delivery/Driver ont chacun leur propre redirection ou
    composant) → seul le cas par défaut (`ADMIN`/`SUPER_ADMIN`) retourne
    `<Dashboard/>` (`pages/dashboard.tsx`) — confirmé par le commentaire du fichier lui-même
    ("Admin-only landing dashboard... reached only by ADMIN/SUPER_ADMIN") et par la lecture
    directe de `SmartDashboard()`.
  - `/admin/analytics` → `AnalyticsPage` (`pages/admin/analytics-page.tsx`), déjà protégée par
    `ProtectedRoute allowedRoles={ADMIN_ROLES}` — fichier distinct de Supplier's.
  - `/admin/earnings` → `EarningsPage` (`pages/admin/earnings-page.tsx`), même protection,
    fichier distinct de Supplier's.
  - Conclusion : les trois destinations sont déjà, structurellement, 100% exclusives à
    Admin/SuperAdmin — aucune garde de rôle supplémentaire n'est nécessaire dans les pages
    elles-mêmes.
- **Switcher existant comme référence visuelle** : System Management
  (`pages/admin/system-management-page.tsx` ~ligne 2024) a déjà un switcher à onglets
  (`bg-secondary/40 rounded-xl p-1`, actif = `bg-background shadow-sm text-foreground`) —
  mais c'est un switcher **à état local** (une seule page, plusieurs sections). Le switcher
  Performance doit être **piloté par l'URL** (trois vraies pages/routes distinctes), donc je
  réutilise le même habillage visuel mais avec `<Link>`/`useLocation()` (wouter) au lieu d'un
  `useState`, pour que rafraîchissement, navigation directe, et Précédent/Suivant du navigateur
  fonctionnent nativement.

## 2. Stratégie d'implémentation minimale

1. **Créer** `client/src/components/admin/admin-performance-switcher.tsx` — petit composant
   de présentation pur, trois `<Link>` (Dashboard `/`, Analytics `/admin/analytics`, Earnings
   `/admin/earnings`), actif déterminé par `useLocation()`, même habillage que le switcher de
   System Management.
2. **Modifier** `client/src/components/layout/app-sidebar.tsx` :
   - Étendre `NavItem` avec un champ optionnel `activeUrls?: string[]` (omis partout ailleurs
     → zéro changement pour les ~40 autres items existants) ; `NavLink` l'utilise pour decider
     `isActive` quand présent (actif si `location` est dans `activeUrls`), sinon garde son
     comportement actuel inchangé.
   - Remplacer les 3 items Admin par un seul : `{ title: "Performance", url: "/", icon: Activity,
     activeUrls: ["/", "/admin/analytics", "/admin/earnings"] }`.
3. **Insérer** `<AdminPerformanceSwitcher />` juste après le premier `<DashboardHero>` de
   chacune des trois pages (`dashboard.tsx`, `admin/analytics-page.tsx`,
   `admin/earnings-page.tsx`) — aucune autre modification de ces fichiers.

## 3. Garde-fous

- Aucune route supprimée/renommée, aucun composant de page dupliqué ou copié.
- Aucun nouvel état global ; le "state" du switcher est la route elle-même (wouter
  `useLocation`), déjà la source de vérité pour toute navigation existante dans l'app.
- Le groupe Supplier et toute autre entrée de sidebar ne sont pas touchés.
- Aucun changement API, calcul financier, permission, ou schéma de base de données.

## 4. Tests prévus

- `npx tsc --noEmit`, `npm run build`.
- Relecture manuelle confirmant que les trois pages gardent leur contenu/données/comportement
  exacts, seul le switcher est ajouté.
- Aucun navigateur disponible dans cet environnement — pas de test de clic/navigation réel.

---

# Analyse — Consolider Dashboard, Analytics et Earnings sous "Performance" (sidebar Supplier)

Tâche distincte, même principe que la consolidation Admin ci-dessus, appliquée au Supplier.
**Important** : vérifié directement dans le code que les routes/composants Supplier sont
réellement distincts de ceux d'Admin (pas une supposition) — voir §1.

## 1. État actuel (vérifié, pas supposé)

- **Sidebar** : `client/src/components/layout/app-sidebar.tsx`, groupe Supplier "MAIN"
  (`user.role === "SUPPLIER"`) : `{ title: "Dashboard", url: "/", icon: LayoutDashboard }`,
  `{ title: "Analytics", url: "/supplier/analytics", icon: BarChart2 }`,
  `{ title: "Earnings", url: "/supplier/earnings", icon: TrendingUp }`.
- **Routes/composants réels** (`App.tsx`) :
  - `/` → `HomeRoute` → `<DashboardLayout><SmartDashboard/></DashboardLayout>` →
    `SmartDashboard()` : `user.role === "SUPPLIER"` retourne `<SupplierDashboard/>`
    (`pages/supplier/dashboard.tsx`) — **un composant différent de l'Admin `<Dashboard/>`**,
    confirmé par lecture directe de `SmartDashboard()`, pas supposé identique à Admin.
  - `/supplier/analytics` → `FinanceAnalyticsPage` (`pages/supplier/finance-analytics-page.tsx`,
    PAS un fichier nommé "analytics-page.tsx" — nom réel différent de l'équivalent Admin),
    déjà protégée par `ProtectedRoute allowedRoles={["SUPPLIER"]} requireApproved` dans
    `<DashboardLayout>`.
  - `/supplier/earnings` → `SupplierEarningsPage` (`pages/supplier/earnings-page.tsx`), même
    protection, même wrapper `<DashboardLayout>`.
  - Les trois sont donc déjà, structurellement, 100% exclusives à `SUPPLIER` — aucune garde de
    rôle supplémentaire nécessaire dans les pages elles-mêmes (même conclusion que pour Admin,
    revérifiée indépendamment ici pour Supplier).
- **Données/calculs** : `SupplierDashboard`/`FinanceAnalyticsPage`/`SupplierEarningsPage`
  utilisent tous `GET /api/orders` (déjà scope-é côté serveur aux propres sous-commandes du
  Supplier, voir `storage.getOrders`) et `lib/financial-rows.ts`/`lib/marketplace-analytics.ts`
  — complètement indépendants des données Admin ; aucune donnée Admin n'est réutilisée.

## 2. Stratégie d'implémentation minimale

1. **Créer** `client/src/components/supplier/supplier-performance-switcher.tsx` — composant
   séparé de celui d'Admin (pas de réutilisation cross-rôle), même chrome visuel, même
   mécanique `<Link>`/`useLocation()`, pointant vers `/`, `/supplier/analytics`,
   `/supplier/earnings`.
2. **Modifier** `client/src/components/layout/app-sidebar.tsx` — remplacer les 3 items
   Supplier par un seul `{ title: "Performance", url: "/", icon: Activity, activeUrls: ["/",
   "/supplier/analytics", "/supplier/earnings"] }`, réutilisant le champ `activeUrls` déjà
   ajouté au type `NavItem` pour la tâche Admin (aucun changement supplémentaire à `NavLink`).
   Groupe Admin non touché.
3. **Insérer** `<SupplierPerformanceSwitcher />` juste après le premier `<DashboardHero>` de
   chacune des trois pages Supplier — aucune autre modification de ces fichiers.

## 3. Garde-fous

- Aucune route supprimée/renommée, aucun composant de page Supplier dupliqué.
- Le groupe Admin et tout autre groupe de sidebar (Barista Academy, etc.) ne sont pas touchés.
- Aucun changement API, calcul financier (commission, gains nets, ledger), permission, ou
  schéma de base de données.
- Aucune donnée/composant Admin réutilisé pour Supplier.

## 4. Tests prévus

- `npx tsc --noEmit`, `npm run build`.
- Relecture manuelle confirmant que les trois pages Supplier gardent leur contenu/données/
  comportement exacts, seul le switcher est ajouté.
- Aucun navigateur disponible dans cet environnement — pas de test de clic/navigation réel.

---

# Analyse — Consolider Notifications, Messages et Reviews sous "Communication" (sidebar Admin + Supplier)

## 1. Routes et composants réels (audit, pas d'hypothèse)

**Admin** (`client/src/App.tsx`) :
- `/admin/notifications` → `NotificationsPage` (`pages/admin/notifications-page.tsx`), `ADMIN_ROLES`.
- `/admin/messages` → `AdminMessagesPage` (`pages/admin/messages-page.tsx`), `ADMIN_ROLES`.
- `/admin/reviews` → `AdminReviewsPage` (`pages/admin/reviews-page.tsx`), `ADMIN_ROLES`.

**Supplier** (`client/src/App.tsx`) :
- `/supplier/messages` → `SupplierMessagesPage` (`pages/supplier/messages-page.tsx`), `allowedRoles=["SUPPLIER"]`.
- `/supplier/notifications` → `SupplierNotificationsPage` (`pages/supplier/notifications-page.tsx`), `allowedRoles=["SUPPLIER"]`.
- `/supplier/reviews` → `ReviewsPage` (`pages/supplier/reviews-page.tsx`), `allowedRoles=["SUPPLIER"]`.

Les trois pages de chaque rôle sont des implémentations **distinctes** (pas de partage Admin/
Supplier) : Admin Notifications lit `useNotifications("ADMIN", …)`, Supplier Notifications lit
`useNotifications("SHOP", …)` — données/scopes différents. Admin Messages a un onglet
"All Conversations" (modération inter-rôles) absent de la page Supplier. Admin Reviews modère
9 domaines (`TABS` avec Product/Pack/Supplier/Maintenance/Barista/Academy/Driver/Print/
Marketing) via `/api/admin/reviews`; Supplier Reviews n'affiche/gère que les avis sur ses
propres produits (`SupplierProductReview`). Toutes les six pages partagent néanmoins le même
point d'insertion structurel : un unique `<DashboardHero title=… />` en première position dans
le JSX retourné.

Toutes les six routes restent déjà correctement cloisonnées par rôle via `ProtectedRoute
allowedRoles=[…]` — aucune nouvelle règle de permission n'est nécessaire.

## 2. Compteur non lu existant (sidebar)

Dans `app-sidebar.tsx`, seul l'item **Messages** porte un badge de compteur non lu
(`unreadCount`, requête `/api/messages/unread-count`, affiché via
`badge={item.title === "Messages" ? unreadCount : undefined}`). Notifications et Reviews n'ont
jamais eu de badge sidebar. Donc : on ne fabrique pas de nouveau total agrégé (ce qui créerait
un chiffre jamais montré auparavant) — on reporte simplement ce même compteur existant sur le
nouvel item "Communication".

Un flag existant, `useMessagingSettings().globalVisible` (toggle Admin dans System Management →
"Messages visibility"), masquait l'item sidebar "Messages" pour les non-admins quand désactivé
(Admin en est toujours exempté). Comme Notifications/Reviews n'ont jamais été soumis à ce flag,
masquer tout l'item "Communication" quand `globalVisible` est false aurait supprimé l'accès à
Notifications/Reviews aussi — une régression. Solution : l'item sidebar "Communication" reste
toujours visible (comme Notifications/Reviews l'étaient) ; c'est l'onglet "Messages" **à
l'intérieur** du switcher Supplier qui est filtré selon ce même flag (Admin n'a pas ce filtre,
comme avant).

## 3. Implémentation minimale

1. **Sidebar** (`app-sidebar.tsx`) : remplacer les 3 items Admin/Supplier (MARKETING group)
   par un seul item "Communication" avec `activeUrls` listant les 3 routes réelles, icône
   `MessageCircle` (déjà importée, réutilisée — `Bell`/`Star` retirés car plus utilisés nulle
   part ailleurs dans ce fichier). Le filtre `.filter(item.title !== "Messages" || …)` devient
   inutile (plus aucun item littéralement nommé "Messages" dans ce fichier) et est supprimé ;
   le badge cible désormais `item.title === "Communication"`.
2. **Deux nouveaux composants switcher** (séparés, comme pour Performance — pas de composant
   partagé cross-rôle) : `components/admin/admin-communication-switcher.tsx` et
   `components/supplier/supplier-communication-switcher.tsx`. Même chrome visuel que les
   switchers Performance (`bg-secondary/40 rounded-xl p-1`, actif =
   `bg-background shadow-sm text-foreground`), navigation via `<Link>`/`useLocation()` (donc
   piloté par l'URL réelle — survit à navigation directe/refresh/Back/Forward). Le switcher
   Supplier filtre l'onglet "Messages" selon `messagingSettings.globalVisible` (§2).
3. **Insérer** le switcher correspondant juste après le premier `<DashboardHero>` de chacune
   des six pages (3 Admin + 3 Supplier) — aucune autre modification de ces fichiers.

## 4. Garde-fous

- Aucune route supprimée/renommée, aucun composant de page dupliqué ou réécrit.
- Aucun changement aux requêtes API, calculs, modèles de données, règles de modération/
  permission, ou schéma de base de données.
- Aucune donnée/composant Admin réutilisé pour Supplier (switchers séparés, pages inchangées).
- Compteur non lu existant reporté tel quel, aucun total fabriqué.
- Ouvrir Communication ne déclenche aucune action (pas de mark-as-read automatique) : la page
  cible (ex. Notifications) ne monte que lorsqu'on navigue réellement sur sa route.

## 5. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès (2818 modules).
- Relecture manuelle du diff `app-sidebar.tsx` + des 6 pages.
- Aucun navigateur disponible dans cet environnement — pas de test de clic/navigation réel.

---

# Analyse — Synchroniser les icônes du navbar Admin/Supplier avec Espace Barista Marketplace

## 1. Référence réelle : Espace Barista Marketplace

`BaristaAccountShell` (`components/layout/barista-account-shell.tsx`) est une fine coquille
autour de `ProfessionalAccountShell` (`components/layout/professional-account-shell.tsx`), qui
contient le vrai header. Icônes du bloc desktop (`sm:grid sm:grid-cols-6`, ligne ~214), gauche
à droite :

1. **Messages** — `MessageCircle` (lucide), `<Link href={messagesPath}>`, bouton
   `w-9 h-9 rounded-xl text-white hover:bg-white/15`, icône `w-4 h-4`. Composant :
   `AccountHeaderActions` (`components/account/account-header-actions.tsx`).
2. **Notifications** — `Bell` (lucide) dans un `Popover` (`NotificationBellPopover`,
   `components/account/notification-bell-popover.tsx`), badge rouge si non lues, liste des 5
   dernières notifications réelles (`useNotifications`/`useUnreadNotificationCount`), lien
   "Voir toutes" vers `communicationPath?tab=notifications`.
3. **Avis** — `Star` (lucide), même composant `AccountHeaderActions`, `<Link href={reviewsPath}>`.
4. **Mode clair/sombre** — `Sun`/`Moon` (lucide) selon l'état, bouton dédié dans
   `ProfessionalAccountShell`, piloté par `useAccountThemeStore` + politique admin
   `useAccountDarkModeSettings` (visible seulement si `toggleAllowed`).
5. **Paramètres** — `Settings` (lucide), `AccountHeaderActions`, `<Link href={settingsPath}>`.
6. **Déconnexion** — `LogOut` (lucide), bouton dédié `onClick={() => logout()}`, le plus à
   droite.

Mobile (<sm) réordonne en grille 2×3 : Paramètres/Mode clair/Déconnexion puis
Messages/Notifications/Avis — comportement existant, non modifié ici.

## 2. Navbar Admin/Supplier actuel

`DashboardLayout` (`components/layout/dashboard-layout.tsx`) — header unique partagé par
Admin, Supplier, Coffee Owner (et quelques routes legacy Driver/Delivery via
`DeliveryCompanyOrDashboardLayout`). Contenu actuel du header, de gauche à droite :
- `HeaderSidebarTrigger` (visible seulement sur mobile pour Admin/Supplier).
- `NotificationBellDropdown` (`components/notifications/notification-bell-dropdown.tsx`) — bell
  avec badge, filtre par date, "tout marquer comme lu", lien "Voir toutes" vers
  `/admin/notifications` ou `/supplier/notifications` (`NOTIFICATIONS_PAGE_BY_ROLE`). Déjà plus
  riche que la référence (filtre de date, mark-all) — comportement **préservé intégralement**,
  aucune modification de ce composant.
- Toggle Mode clair/sombre (`Sun`/`Moon`), visible seulement si `accountKey` (ADMIN/
  SUPER_ADMIN/SUPPLIER) et `toggleAllowed` — même politique admin que la référence
  (`useAccountDarkModeSettings`), déjà correct.
- Panier (Cafe Owner uniquement, hors scope).

Manquent, par rapport à la référence : icônes Messages, Avis, Paramètres, Déconnexion.
Routes réelles déjà existantes (aucune nouvelle à créer) : Admin → `/admin/messages`,
`/admin/reviews`, `/admin/settings` ; Supplier → `/supplier/messages`, `/supplier/reviews`,
`/supplier/settings`. Déconnexion : `logout()` de `useAuth()` (déjà utilisé par le bouton
"Sign Out" du pied de sidebar — même action, pas de doublon de logique).

## 3. Implémentation minimale

1. Dans `dashboard-layout.tsx`, ajouter 4 boutons/liens (Messages, Avis, Paramètres,
   Déconnexion) **uniquement quand `accountKey` est défini** (donc jamais pour Coffee Owner/
   Driver/autres rôles traversant ce même layout) et réordonner le bloc existant pour obtenir
   exactement l'ordre de référence : Messages → Notifications (inchangé) → Avis → Mode clair
   (inchangé) → Paramètres → Déconnexion.
2. Style des 4 nouveaux boutons : repris de la convention **déjà existante** du bouton Mode
   clair de ce même header (`w-9 h-9 rounded-full ... text-muted-foreground hover:text-foreground
   hover:bg-secondary`, icône `w-4 h-4`) plutôt que du style `text-white` de
   `AccountHeaderActions` (pensé pour l'en-tête à fond dégradé coloré de
   `ProfessionalAccountShell` — y recourir tel quel rendrait les icônes blanches invisibles sur
   le fond clair/neutre du header Admin/Supplier). Les icônes elles-mêmes (`MessageCircle`,
   `Star`, `Settings`, `LogOut`) sont reprises de lucide-react, identiques à la référence.
3. Chemins par rôle (ADMIN/SUPER_ADMIN → `/admin/...`, SUPPLIER → `/supplier/...`) via une
   petite table locale, aucune nouvelle route/API.
4. Messages (Supplier) respecte le même flag `useMessagingSettings().globalVisible` qui
   masquait déjà l'icône Messages pour un Supplier non-admin quand désactivé (même logique que
   celle déplacée dans `SupplierCommunicationSwitcher` lors de la tâche précédente) — Admin en
   reste exempté, comme avant.
5. Bouton Déconnexion : réutilise `logout()`/`isLoggingOut` de `useAuth()` (ajoutés à la
   déstructuration existante), même action que le bouton "Sign Out" du sidebar — pas de
   nouvelle logique de session.
6. Row d'icônes passe en `overflow-x-auto` avec scrollbar masquée (motif déjà utilisé par les
   switchers Performance/Communication) pour éviter tout chevauchement/débordement sur mobile
   maintenant que la rangée compte jusqu'à 6 icônes au lieu de 2.

## 4. Garde-fous

- Coffee Owner et toute autre route traversant `DashboardLayout` restent strictement
  inchangés (nouveaux boutons gated par `accountKey`, jamais rendus pour eux).
- `ProfessionalAccountShell`/`BaristaAccountShell` (la référence) ne sont pas touchés.
- Aucune nouvelle route, endpoint API, table, ou système de notification/thème parallèle —
  uniquement des liens vers des pages déjà existantes et des actions déjà existantes
  (`logout()`).
- Permissions/scoping des données Admin vs Supplier inchangés (chaque lien pointe vers la
  route déjà protégée par `ProtectedRoute allowedRoles=[...]` de son propre rôle).

## 5. Tests prévus

- `npx tsc --noEmit`, `npm run build`.
- Relecture manuelle du diff.
- Aucun navigateur disponible — pas de test de clic/responsive réel.

---

# Analyse — Synchronisation temps réel des exigences de transport (Supplier → Orders)

## 1. Source de vérité unique (déjà le cas)

Une seule table, `sub_orders` (shared/schema.ts:250-284), porte les 7 champs : `requiredVehicleType`,
`totalWeightKg`, `totalVolumeL`, `numberOfPackages`, `numberOfItems`, `isFragile`,
`specialHandling`. `storage.updateSubOrderTransportRequirements` (storage.ts:4646-4668) fait un
simple `UPDATE` sur cette ligne — aucune copie dupliquée ailleurs. Tous les lecteurs dérivent
ces champs EN DIRECT de cette même ligne à chaque requête :
- `GET /api/orders` → `OrderWithDetails.subOrders[]` (storage.ts ~2600-2665, plusieurs fonctions
  de construction d'ordre, toutes lisent `subOrder.requiredVehicleType` etc. depuis la ligne
  fraîchement sélectionnée).
- `GET /api/deliveries` → `DeliveryWithDetails.subOrder` via `toDeliveryWithDetails`
  (storage.ts:1893-1946, lignes 1922-1930) — même ligne, même source.

Donc aucune migration, aucune nouvelle table : le modèle est déjà correct, seule la
**propagation temps réel** vers les clients déjà ouverts manquait.

## 2. Lecteurs/éditeurs réels (audit, pas d'hypothèse — confirmé par exploration de tout le repo)

- **Éditeur** : `components/supplier/supplier-order-details-modal.tsx` (section "Transport
  requirements", bouton "Enregistrer") → `useUpdateTransportRequirements()`
  (`hooks/use-orders.ts:141-168`) → `PATCH /api/suborders/:id/transport-requirements`
  (`server/routes.ts:5473-5496`, `requireApprovedSupplier`, et `storage` revérifie
  `subOrder.supplierId !== supplierId → Forbidden` — seul le fournisseur propriétaire peut
  écrire, déjà appliqué côté serveur).
- **Lecteurs** (tous confirmés, pas supposés identiques) :
  - Supplier → Orders (`pages/supplier/orders-page.tsx`), Supplier → Order Requests
    (`pages/supplier/order-requests-page.tsx`) — tous deux via `SupplierOrderDetailsModal`.
  - Coffee Owner (`components/cafe/order-details-modal.tsx`, 3 points d'appel : `pages/cafe/
    orders-page.tsx`, `pages/shared/orders-page.tsx`, `components/cafe/marketplace-layout.tsx`).
  - Admin (même `pages/shared/orders-page.tsx` pour les commandes ; `pages/admin/
    delivery-page.tsx` + `components/delivery/delivery-details.tsx` pour les livraisons).
  - Espace Livraison (`pages/delivery/available-deliveries-page.tsx`,
    `pages/delivery/my-deliveries-page.tsx`) et Espace Chauffeur
    (`pages/delivery/driver-deliveries-page.tsx`) — tous via `DeliveryDetails`
    (`components/delivery/delivery-details.tsx:224-251`, qui affiche les 7 champs).
  - Supplier → Order Delivery (`pages/supplier/delivery-status-page.tsx`) — aussi via
    `DeliveryDetails`.
- Aucun autre composant (carte, tableau, vue mobile) n'affiche ces champs — confirmé par grep
  exhaustif sur les 7 noms de champs dans tout `client/src`.

## 3. Infrastructure temps réel existante (réutilisée, pas réinventée)

WebSocket déjà en place et fonctionnel : `server/ws.ts` (`broadcast()` = tous les clients
connectés, authentifiés côté session, jamais sur un rôle/propriétaire fourni par le client) +
`client/src/hooks/use-realtime.ts` (un seul `useRealtime(userId)` déjà monté par
`DashboardLayout`/`ProfessionalAccountShell`, qui route chaque `event` reçu vers des
`qc.invalidateQueries(...)` ciblés). C'est exactement le mécanisme que la tâche demande de
réutiliser — reconnexion automatique (3s) déjà gérée, ré-invalidation de certaines requêtes au
`onopen` déjà conventionnelle (Pack availability, notifications).

**Écart identifié (la vraie cause du manque de synchro)** : la route PATCH diffusait déjà un
événement (`suborder_status_changed`, réutilisé à tort — le statut ne change pourtant pas ici),
ce qui invalidait bien `/api/orders` côté client (`ORDER_EVENTS` le contient déjà) mais **jamais
`/api/deliveries`** (`suborder_status_changed` n'est pas dans `DELIVERY_EVENTS`) — donc Espace
Livraison/Chauffeur/Admin→Livraisons ne recevaient jamais la mise à jour en direct.

**Deuxième écart, plus important, trouvé par une exploration dédiée de tout le repo (6 pages)** :
même avec le bon événement + la bonne invalidation de cache, une modale déjà ouverte ne se
redessine que si l'objet qu'elle reçoit en `prop` est **recalculé à chaque rendu depuis le cache
React Query** (`array.find(id)`), et non figé dans un `useState<...WithDetails|null>` rempli une
fois au clic. 6 des 11 points d'affichage utilisaient ce second pattern ("snapshot gelé") :
`pages/supplier/orders-page.tsx`, `pages/supplier/order-requests-page.tsx`,
`pages/admin/delivery-page.tsx`, `pages/delivery/available-deliveries-page.tsx`,
`pages/delivery/my-deliveries-page.tsx`, `pages/supplier/delivery-status-page.tsx`. Les 5 autres
(Coffee Owner ×3, `pages/shared/orders-page.tsx`, `pages/delivery/driver-deliveries-page.tsx`)
suivaient déjà le bon motif ("snapshot = juste l'id, objet re-dérivé du tableau live à chaque
rendu") et ont servi de référence pour corriger les 6 autres.

## 4. Implémentation (minimale, réutilise tout)

1. **Backend** (`server/routes.ts`, route transport-requirements) : remplace les deux appels
   `broadcast(To Users)('suborder_status_changed', ...)` par un seul
   `broadcast('suborder_transport_requirements_updated', { orderId, subOrderId, ...les 7 champs
   mis à jour })` — payload minimal (pas de prix, pas de données personnelles), diffusion
   globale identique à tous les autres événements order/delivery existants (l'autorisation réelle
   reste faite côté serveur à chaque `GET /api/orders`/`GET /api/deliveries`, jamais sur la
   confiance du client).
2. **Client** (`hooks/use-realtime.ts`) : nouvel événement ajouté, invalide `/api/orders` ET
   `/api/deliveries` (un seul bloc, pas de troisième cache dupliqué) ; ajouté aussi à la
   ré-invalidation au `onopen` (reconnexion) à côté de Pack availability/notifications, pour
   qu'une coupure réseau ne laisse jamais une vue déjà ouverte durablement obsolète.
3. **6 fichiers** : `useState<OrderWithDetails|null>`/`useState<DeliveryWithDetails|null>` →
   `useState<number|null>` (id seul) + `array.find(id) ?? null` recalculé à chaque rendu — même
   motif que les 5 endroits déjà corrects, zéro changement de layout/style/texte.

## 5. Garde-fous respectés

- Aucun changement aux formules de prix, frais de livraison, payouts, ledger, settlement,
  statuts de livraison, assignation chauffeur, paiement, COD, annulation — uniquement les 7
  champs "transport requirements" et leur propagation.
- Aucune nouvelle colonne/migration : `sub_orders` n'a pas de colonne `updatedAt`/version ; le
  conflit réel possible ici est étroit (seul le fournisseur propriétaire peut écrire, vérifié
  serveur) — donc "dernier enregistrement gagne" (déjà le comportement de toute l'app, aucune
  concurrence optimiste nulle part ailleurs) reste suffisant, documenté plutôt que silencieusement
  changé.
- **Edge case documenté, non traité (comportement existant, pas une régression introduite ici)** :
  si LE MÊME fournisseur a la même commande ouverte dans 2 onglets, et sauvegarde depuis l'onglet
  A pendant que l'onglet B est en cours d'édition (non sauvegardé), l'effet existant de
  `supplier-order-details-modal.tsx` (resynchronise `transport` et repasse en lecture seule dès
  que `subOrder` change) fera sortir l'onglet B du mode édition et afficher la valeur fraîche —
  perdant un brouillon NON sauvegardé dans B, jamais une donnée déjà enregistrée. Avant cette
  tâche, ce scénario ne pouvait simplement pas se produire (l'onglet B ne recevait jamais la mise
  à jour) ; c'est la conséquence directe et attendue de la synchro temps réel demandée, pas un
  bug introduit par erreur.
- Permissions inchangées : la route PATCH garde exactement ses vérifications existantes
  (`requireApprovedSupplier` + `subOrder.supplierId !== supplierId → Forbidden`).

## 6. Tests exécutés

- `npx tsc --noEmit`, `npm run build` → résultats ci-dessous.
- Relecture manuelle de chacun des 8 fichiers modifiés (2 serveur/client realtime + 6 pages).
- Aucun navigateur ni deuxième session disponible dans cet environnement — pas de test de clic
  réel à deux onglets/deux comptes ; comportement vérifié par lecture de code uniquement.

---

# Analyse — Sous-compétences Maintenance + switcher Compétences/Zones

## 1. Audit de synchronisation existant (avant toute modification)

- **Admin → PRINT → Catégories** (référence demandée) : `printCategoryTaxonomy`/
  `printSubCategoryTaxonomy` (shared/schema.ts) — relation parent/enfant par `categoryId` en
  référence souple (pas de FK dure), `printCatalogItems.category`/`.subCategory` restent du
  texte libre (jamais corrompus par une édition/suppression de taxonomie). CRUD complet déjà
  en place : `POST/PATCH/DELETE /api/admin/print/categories` et `/subcategories`, diffusant un
  événement dédié `print_categories_updated` (déjà câblé dans `use-realtime.ts`). Côté UI
  (`pages/admin/print-page.tsx`) : **pas de switcher/onglets** entre catégories et
  sous-catégories — deux `Card` côte à côte dans la même grille, la carte "sous-catégories"
  portant elle-même un `Select` pour choisir le parent, et la liste affichée est un simple
  `.filter(s => s.categoryId === selected)` sur le tableau complet déjà chargé (pas de requête
  séparée par parent).
- **Admin → Maintenance → "Compétences & zones"** (`pages/admin/maintenance-page.tsx`,
  onglet `taxonomy`) : affichait déjà Compétences + Zones côte à côte dans **une seule
  grille**, via un unique composant générique `TaxonomyList` paramétré par
  `kind: "competencies" | "zones"`. Une seule requête agrégée
  `useQuery(["/api/admin/maintenance"])` alimente tout (comptes, taxonomie, "Demandes par
  compétence", interventions) ; `refresh()` invalide cette clé + `/api/maintenance/categories`
  + `/api/maintenance/taxonomy`.
- **"Demandes par compétence" — vérifié, pas supposé** : `storage.getMaintenanceAdminOverview()`
  construit `categoryCounts` en comptant, pour chaque **compte Maintenance**, les compétences
  qu'il a lui-même déclarées (`maintenanceProfiles.categories`) — **pas** les demandes
  d'intervention (`maintenanceJobPosts.categories` n'est jamais lu ici). C'est donc un compte
  côté offre (combien de prestataires proposent X), pas côté demande, malgré le libellé. Son
  calcul n'est pas modifié par cette tâche (aucune tâche de ce travail n'ajoute de
  sous-compétence à `maintenanceProfiles` — voir §3).
- **`maintenanceJobPosts.categories`** ("Interventions") : tableau de chaînes libres,
  **purement informatif/d'affichage, jamais utilisé comme filtre d'éligibilité serveur**
  (confirmé par lecture de `isMaintenanceProviderEligible`/`getDiscoverableMaintenanceJobPosts`
  — aucune comparaison avec les compétences du prestataire). Donc : introduire des
  sous-compétences ne peut pas casser une logique de matching, puisqu'aucune n'existe
  aujourd'hui pour les compétences.
- **Sélection des compétences par le prestataire Maintenance lui-même**
  (`pages/maintenance/profile.tsx`) : chips togglables, alimentées par le même
  `GET /api/maintenance/taxonomy` que l'Admin et le Coffee Owner (**source unique confirmée**).
  Écrit à la fois `skills` ET `categories` (duplication déjà existante, non touchée ici).
  Aucune sélection de sous-compétence n'est ajoutée côté prestataire (hors périmètre — la tâche
  ne demande cette gestion qu'à l'Admin ; le prestataire continue de choisir uniquement des
  compétences parentes, exactement comme avant).
- **Temps réel déjà en place** : toutes les mutations compétences/zones existantes diffusent
  déjà `broadcast("maintenance_updated", { kind: "taxonomy" })`, et `use-realtime.ts` invalide
  déjà `/api/maintenance/categories`, `/api/maintenance/taxonomy` et `/api/admin/maintenance`
  sur cet événement (contrairement à PRINT qui a son propre événement dédié). **Conclusion :
  aucune modification de `use-realtime.ts` n'est nécessaire** — il suffit que les nouvelles
  routes de sous-compétences réutilisent ce même événement.

## 2. Source de vérité et modèle

Nouvelle table `maintenance_sub_competencies` (migrée via `npm run db:push`, confirmée en base) :
`id, competencyId, name, icon, isActive, isFrozen, createdAt, updatedAt` — réplique exacte de
`printSubCategoryTaxonomy` (référence souple `competencyId`, pas de FK dure, suppression dure
sans cascade). Aucune autre table ne référence une sous-compétence : ni
`maintenanceProfiles` (compétences du prestataire = noms de compétences parentes uniquement),
ni `maintenanceJobPosts` (idem) — donc **supprimer une sous-compétence ne peut jamais rendre
orpheline une donnée de profil ou d'intervention existante**, par construction (pas de
référence à casser).

## 3. Implémentation

**Backend** (`shared/schema.ts`, `server/storage.ts`, `server/routes.ts`) :
- Table + schéma d'insertion + types (`MaintenanceSubCompetency`/`InsertMaintenanceSubCompetency`).
- `storage.getMaintenanceSubCompetencies/createMaintenanceSubCompetency/
  updateMaintenanceSubCompetency/deleteMaintenanceSubCompetency` — mêmes signatures que leurs
  équivalents PRINT.
- `getMaintenanceTaxonomy()`/`getAvailableMaintenanceTaxonomy()` renvoient désormais aussi
  `subCompetencies` (donc `/api/maintenance/taxonomy`, `/api/admin/maintenance/taxonomy` et
  `/api/admin/maintenance` — qui réutilise `getMaintenanceTaxonomy()` — l'exposent tous les
  trois sans route supplémentaire).
- 3 nouvelles routes `POST/PATCH/DELETE /api/admin/maintenance/sub-competencies(/:id)`,
  `requireAdmin`, diffusant `broadcast("maintenance_updated", { kind: "taxonomy" })` — même
  convention que les routes compétences/zones existantes, donc **zéro changement dans
  `use-realtime.ts`**.

**Admin** (`pages/admin/maintenance-page.tsx`) :
- L'onglet "Compétences & zones" (inchangé dans la barre d'onglets externe) contient
  maintenant un switcher interne **Compétences / Zones** (même classes CSS que le
  pill-switcher déjà utilisé par cette page et par PRINT — aucun nouveau style).
  - **Compétences** : `TaxonomyList` (compétences, inchangé) + nouveau
    `SubCompetencyManager` (Select pour choisir la compétence parente, liste filtrée
    `subCompetencies.filter(s => s.competencyId === selected)`, ajout/édition d'icône/nom,
    gel/activation, suppression — même motif visuel que `TaxonomyList`, même comportement que
    la `SubCategoryManager` de PRINT) + la carte "Demandes par compétence" (inchangée, données
    et calcul non modifiés).
  - **Zones** : `TaxonomyList` (zones), seule, inchangée.
- `Overview.taxonomy` étend son type avec `subCompetencies`.

**Coffee Owner `/maintenance`** (`pages/cafe/maintenance/maintenance-page.tsx`) :
- Le type de la requête `/api/maintenance/taxonomy` inclut maintenant `subCompetencies`.
- Nouveau `subSkillsByCategory` (Map nom-de-compétence → sous-compétences), joint côté client
  par nom pour rester cohérent avec la convention texte-libre déjà utilisée partout
  (`filterCategory`, badges, etc. travaillent déjà sur des noms, jamais des ids).
- Sous la bande de chips de compétences, une légende "Sous-compétences : …" s'affiche
  **uniquement quand une compétence est sélectionnée et possède des sous-compétences** — la
  vue "Tous" par défaut reste strictement identique à avant. Purement informatif (relation de
  taxonomie admin), jamais attribué à un prestataire précis (aucun prestataire ne sélectionne
  de sous-compétence — voir §1), donc aucun risque de laisser croire qu'un technicien précis
  offre exactement telle sous-compétence.
- Fast Search et `AgentDetailModal` **non modifiés** : Fast Search ne porte déjà aucune icône
  de compétence aujourd'hui (pas de régression de parité à corriger) et `AgentDetailModal` est
  un composant partagé par de nombreux appelants (preview Admin, auto-preview prestataire) —
  y ajouter une prop aurait élargi le rayon d'impact sans nécessité (le besoin exprimé —
  "afficher les sous-compétences, là où c'est pertinent" — est déjà satisfait par la page
  principale).

## 4. Garde-fous respectés

- Aucune modification de `getMaintenanceAdminOverview()`'s `categoryCounts` (Demandes par
  compétence) — comptage et signification inchangés.
- Aucune nouvelle sélection de sous-compétence par le prestataire ; `maintenanceProfiles` et
  `maintenanceJobPosts` ne sont pas touchés.
- Admin → PRINT → Catégories non touché (aucun fichier PRINT modifié).
- Onglets externes Admin Maintenance (Comptes/Interventions/Compétences & zones/Analytics)
  inchangés ; seul le contenu interne de l'onglet "Compétences & zones" est restructuré.
- Aucune route de pricing/assignation/statut/paiement touchée.
- Synchronisation temps réel obtenue en réutilisant l'événement `maintenance_updated` déjà
  existant — zéro nouveau mécanisme, zéro changement à `use-realtime.ts`.

## 5. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès (2818 modules).
- `npm run db:push` → table `maintenance_sub_competencies` créée et vérifiée directement en
  base (colonnes confirmées via une requête `information_schema.columns`).
- `curl http://localhost:5000/api/maintenance/taxonomy` contre un serveur de développement
  **déjà en cours d'exécution avant ces modifications** (processus `tsx` démarré
  indépendamment de cette session, sans rechargement à chaud) : réponse reçue mais ne reflète
  pas encore `subCompetencies`, confirmant que ce serveur sert toujours l'ancien code. Ce
  serveur n'a pas été redémarré (processus que je n'ai pas lancé — redémarrage laissé à
  l'utilisateur pour éviter d'interrompre une session de développement potentiellement active)
  — donc **pas de vérification HTTP en direct du nouveau endpoint/flux temps réel réalisée**,
  seulement par lecture de code + compilation/build réussis.
- Aucun navigateur disponible — pas de test de clic/responsive réel.

---

# Analyse — Redesign Espace Imprimerie → Business → Catégories (visuel uniquement)

## 1. Audit

- **Page actuelle** : `client/src/pages/printer/categories.tsx`, un seul `Card` global contenant
  des lignes à plat (checkbox + icône + nom), sous-catégories affichées en pilules inline sous
  la ligne cochée, pas de stats, pas de pagination. État local `selectedCategories`/
  `selectedSubCategories` (tableaux de **noms**, texte libre — même convention que
  `maintenanceProfiles.categories`), ré-ensemencé depuis `GET /api/print/me/categories` tant que
  `!dirty` (jamais écrasé par un refresh pendant une édition). Sauvegarde : un seul
  `PATCH /api/print/me/categories` qui remplace les deux tableaux d'un coup.
- **Référence** : `client/src/pages/supplier/categories-page.tsx` → `MyCategoriesSection` :
  `DashboardHero` simple, 3 cartes stats, bandeau d'aide, liste de `Card` par catégorie
  (icône + nom + compteur sous-catégories, `Checkbox`/grille pour les sous-catégories),
  pagination `usePagination`/`DataPagination`. **Mais** ce modèle Supplier inclut aussi un
  workflow propre au Supplier — requête d'ajout avec approbation admin (`PENDING`/`APPROVED`),
  gel (`Freeze`), suppression individuelle, modal "Add Categories", réordonnancement par
  glisser-déposer — **aucun de ces éléments n'existe côté Imprimerie** et la tâche demande
  explicitement de ne pas les introduire (sélection directe Imprimerie = pas d'approbation,
  pas de gel, pas de suppression séparée : cocher/décocher IS la seule action, confirmée par
  "Enregistrer").
- **Source de vérité inchangée** : `GET /api/print/taxonomy` (catégories/sous-catégories actives
  gérées par l'Admin PRINT) + `GET/PATCH /api/print/me/categories` (sélection de ce compte
  Imprimerie uniquement, scoping déjà serveur-side par session). Aucune route touchée.
- **Temps réel déjà correct** : `save.onSuccess` invalide déjà `/api/print/me/categories` et
  `/api/print/taxonomy` ; `print_categories_updated` (émis par toute mutation de taxonomie
  Admin **ou** par ce PATCH lui-même) est déjà dans `PRINT_EVENTS` de `use-realtime.ts` et
  invalide déjà les deux mêmes clés partout où elles sont utilisées (Coffee Owner `/print`,
  `services.tsx`, etc.). **Aucune lacune de synchronisation trouvée — aucun changement
  nécessaire dans `use-realtime.ts` ou côté serveur.**

## 2. Implémentation (visuelle uniquement)

`client/src/pages/printer/categories.tsx` — seul fichier modifié :
- `DashboardHero` (titre/sous-titre/icône/dégradé bleu/bouton Enregistrer) **inchangé** —
  déjà cohérent avec les autres onglets Business Imprimerie (ex. `services.tsx` utilise le même
  dégradé bleu) ; le remplacer par le hero nu de Supplier aurait désaccordé cette page de ses
  propres pages sœurs pour un gain nul.
- Ajout des 3 cartes stats (mêmes classes exactes que Supplier : `Card border shadow-none` +
  pastille icône + nombre + libellé) : Catégories sélectionnées / Sous-catégories actives /
  Disponibles — dérivées des mêmes variables déjà existantes, aucune nouvelle donnée.
- Ajout du bandeau d'aide bleu (même style), texte adapté au modèle Imprimerie réel (cocher →
  Enregistrer), pas au modèle Supplier (qui parle de filtrage produits, inexistant ici).
- Chaque catégorie admin devient sa propre `Card` (au lieu d'une ligne dans un `Card` unique),
  avec surbrillance `ring-1 ring-primary` quand cochée — même motif que
  `CategoryMappingCard` de Supplier, sans ses badges d'approbation/gel/suppression (absents car
  sans équivalent ici).
- Sous-catégories : remplacées par la même grille `Checkbox` + ligne bordée que Supplier
  (`grid sm:grid-cols-2 lg:grid-cols-3`) au lieu des pilules précédentes — même handler
  `toggleSubCategory(name)` inchangé, juste un autre habillage visuel.
- Pagination ajoutée sur la liste de catégories (`usePagination`/`DataPagination`, mêmes props
  que Supplier) — n'affecte pas la sélection/sauvegarde, qui continuent de porter sur les
  tableaux complets `selectedCategories`/`selectedSubCategories`, jamais sur la page affichée.
- Carte de résumé "Sélectionné par mon compte Imprimerie" en bas : **conservée telle quelle**
  (information Imprimerie existante, sans équivalent Supplier à copier).
- `EmptyState` ("Aucune catégorie PRINT…") **conservé tel quel** pour le cas où l'Admin n'a
  encore créé aucune catégorie — sémantique différente du "0 sélectionné" de Supplier, non
  modifiée.

## 3. Garde-fous respectés

- Aucune route, mutation, payload, ou donnée serveur modifiée — `toggleCategory`/
  `toggleSubCategory`/`save` sont exactement les mêmes fonctions qu'avant, juste rendues dans
  un balisage différent.
- Aucun workflow Supplier (approbation, gel, suppression, modal d'ajout, glisser-déposer)
  introduit.
- Admin → PRINT → Catégories et Supplier → Categories non touchés (aucun fichier modifié
  en dehors de `printer/categories.tsx`).
- Aucune autre page/onglet Imprimerie modifié.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès (2818 modules).
- Aucun navigateur disponible — pas de test de clic/responsive réel ; comportement vérifié par
  relecture (les handlers de sélection/sauvegarde sont inchangés mot pour mot).

---

# Analyse — Onglet "Compétences" pour Espace Maintenance → Business

## 1. Audit

- **Structure actuelle** : `pages/maintenance/business.tsx` (routé par
  `MaintenanceAccountShell` → `/maintenance-panel/business`) héberge déjà un
  `SubTabSwitcher` générique (`components/account/sub-tab-switcher.tsx`, déjà utilisé par
  Communication/Performance de tous les comptes pro) avec 3 onglets : Profil / Planning /
  Interventions. Purement présentationnel, déjà deep-linkable via `?tab=`, aucune liste de
  clés à mettre à jour ailleurs.
- **Contenu "compétences" existant** : dans `pages/maintenance/profile.tsx` (onglet Profil),
  carte "Spécialités & Compétences" — chips togglables alimentées par
  `GET /api/maintenance/taxonomy` (même source que l'Admin et le Coffee Owner, déjà confirmée
  unique lors d'une tâche précédente), état local `selectedSpecialties`, persistée via le
  bouton unique "Sauvegarder le profil" de Profil qui envoie **tous** les champs du profil en
  un seul `PATCH /api/maintenance/profile` (jobTitle, bio, disponibilité, etc. + `skills`/
  `categories`).
- **Vérifié avant toute modification** : `storage.upsertMaintenanceProfile` fait un simple
  `db.update(...).set({...updates})` Drizzle — **mise à jour partielle réelle**, les champs
  absents du corps de la requête restent inchangés en base. Donc extraire `skills`/
  `categories` dans leur propre bouton "Enregistrer" indépendant (sans renvoyer jobTitle/bio/
  etc.) ne peut pas réinitialiser le reste du profil — confirmé par lecture directe de
  `server/routes.ts`/`server/storage.ts`, pas supposé.
- **Zone d'intervention** (`coverageArea`) reste dans Profil — ce n'est pas une "compétence"
  (même distinction Compétences/Zones déjà faite côté Admin dans une tâche précédente), et la
  tâche ne liste que 4 onglets (Profil/Planning/Interventions/**Compétences**), sans onglet
  Zones.
- **Temps réel déjà correct** : `PATCH /api/maintenance/profile` diffuse déjà
  `broadcast("maintenance_updated", { userId, kind: "profile" })`, déjà dans
  `MAINTENANCE_EVENTS` de `use-realtime.ts`, qui invalide déjà `/api/maintenance/profiles`
  (liste publique lue par Coffee Owner) et `/api/maintenance/profile` — **aucun changement de
  synchronisation nécessaire**.

## 2. Implémentation

- **Nouveau fichier** `pages/maintenance/competencies.tsx` : extrait tel quel la carte
  "Spécialités & Compétences" (mêmes classes, mêmes libellés) + son propre état
  `selectedSpecialties`/`dirty` + son propre bouton "Enregistrer", qui appelle
  `PATCH /api/maintenance/profile` avec **uniquement** `{ skills, categories }` (mise à jour
  partielle, cf. §1 — jobTitle/bio/disponibilité ne sont jamais touchés). Ajout d'une carte
  "Sous-compétences" purement informative (même motif que la page Coffee Owner /maintenance
  d'une tâche précédente : regroupement des sous-compétences admin par nom de compétence
  parente, affiché uniquement pour les compétences déjà sélectionnées) — aucune nouvelle
  sélection, aucune nouvelle donnée, même source `GET /api/maintenance/taxonomy`.
- **`pages/maintenance/business.tsx`** : ajout du 4ᵉ onglet `{ key: "competencies", label:
  "Compétences", icon: Award, content: <MaintenanceCompetenciesPage /> }` au `SubTabSwitcher`
  existant — Profil/Planning/Interventions inchangés.
- **`pages/maintenance/profile.tsx`** : carte "Spécialités & Compétences" retirée (déplacée,
  pas dupliquée) ; `selectedSpecialties`/`toggleSpecialty` supprimés ; `skills`/`categories`
  retirés du payload de `saveProfileMutation` (mise à jour partielle — aucun risque de les
  réinitialiser) ; la requête `taxonomy` ne lit plus que `zones` (Zone d'intervention,
  inchangée). Tout le reste de Profil (identité, détails pro, certifications/portfolio,
  visibilité, disponibilité, Aperçu/Flash, Go Live) **strictement inchangé**.
- **`dashboard.tsx`** (conteneur Maintenance historique, confirmé mort — `HomeRoute` redirige
  tout compte MAINTENANCE vers `/maintenance-panel` avant qu'il ne soit jamais atteint, voir
  son propre commentaire "replaces the previous... wildcard route") : non modifié, son import
  de `Profile` reste valide (signature du composant inchangée).

## 3. Garde-fous respectés

- Aucune route/endpoint/permission modifiée — même `PATCH /api/maintenance/profile`, mêmes
  vérifications serveur (`requireAuth` + rôle + `req.session.userId` → impossible de modifier
  le profil d'un autre compte Maintenance).
- Aucune duplication de données/état : les compétences n'existent plus que dans
  `competencies.tsx` ; Profil ne les lit/écrit plus du tout.
- Planning et Interventions non touchés (fichiers non ouverts/modifiés).
- Admin → Maintenance → Compétences et Coffee Owner → /maintenance non touchés.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès (2819 modules, +1 pour le nouveau fichier).
- Aucun navigateur disponible — pas de test de clic/responsive réel.

---

# Analyse — Aligner le visuel Compétences Maintenance sur Imprimerie Catégories

## 1. Audit

- **Référence** : `pages/printer/categories.tsx` tel que redessiné lors de la tâche
  précédente — `DashboardHero` + 3 cartes stats + bandeau d'aide + liste de `Card` par
  catégorie (checkbox + icône + nom + compteur sous-catégories, grille de sous-catégories
  **sélectionnables** quand ouverte) + pagination + carte résumé en bas.
- **Page actuelle** (`pages/maintenance/competencies.tsx`, créée lors de la tâche
  précédente) : chips togglables en vrac pour les compétences, carte "Sous-compétences"
  séparée listant les sous-compétences des compétences déjà sélectionnées — aucune
  statistique, aucune pagination, pas de présentation en liste de cartes.
- **Différence de règle métier à respecter** (vérifiée, pas supposée) : contrairement à
  Imprimerie où le compte sélectionne RÉELLEMENT des sous-catégories (état propre,
  persisté dans `PATCH /api/print/me/categories`), un compte Maintenance ne sélectionne
  **que** des compétences parentes — `maintenanceProfiles` n'a aucun champ de
  sous-compétences et rien ne lit une sélection de sous-compétence côté Maintenance. La
  tâche demande explicitement de ne pas "introduire de nouvelles règles de sélection" :
  les sous-compétences restent donc informatives (affichées, non cochables) même si la
  présentation "carte + révélation au clic" imite celle d'Imprimerie.

## 2. Implémentation

`pages/maintenance/competencies.tsx` réécrite pour suivre exactement la structure
d'Imprimerie, adaptée :
- 3 cartes stats : "Compétences sélectionnées" (`selectedSpecialties.length`),
  "Sous-compétences actives" (dérivée — nombre réel de sous-compétences appartenant aux
  compétences déjà sélectionnées, jamais un chiffre inventé), "Disponibles"
  (`competencies.length`).
- Bandeau d'aide (teinte orange Maintenance au lieu du bleu Imprimerie, cohérent avec le
  reste des pages Maintenance) : "Cochez une compétence pour afficher ses
  sous-compétences…".
- Chaque compétence = sa propre `Card` (checkbox + icône + nom + compteur de
  sous-compétences), surbrillance `ring-1 ring-primary` quand cochée — identique à
  Imprimerie. Sous-compétences révélées au clic, rendues en grille mais **sans
  `Checkbox`** (simples items non interactifs), car aucune sélection de sous-compétence
  n'existe pour ce rôle.
- Pagination (`usePagination`/`DataPagination`) ajoutée sur la liste de compétences.
- Carte résumé en bas ("Sélectionné par mon compte Maintenance"), même motif
  qu'Imprimerie, teinte orange.
- `toggleSpecialty`/`save` (payload `{ skills, categories }`) **inchangés** — même
  `PATCH /api/maintenance/profile` partiel qu'avant ce redesign visuel.

## 3. Garde-fous respectés

- Aucune nouvelle règle de sélection : les sous-compétences restent purement
  informatives, exactement comme juste après leur introduction côté Admin/Coffee Owner.
- Aucun autre onglet Maintenance (Profil/Planning/Interventions) touché.
- Imprimerie → Catégories non touché.
- Aucune route/API/permission modifiée.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès (2819 modules).
- Aucun navigateur disponible — pas de test de clic/responsive réel.

---

# Analyse — Maintenance Skills, Sub-Skills & Intervention Matching Synchronization

## 1. Audit (findings + décisions explicites avant implémentation)

- **Sélection réelle de sous-compétences par le prestataire** : jusqu'ici purement
  informative (tâche précédente). Ajout d'une colonne `maintenanceProfiles.subSkills`
  (texte libre, même convention que `skills`/`categories` — pas de FK dure) + acceptation
  dans `PATCH /api/maintenance/profile` avec validation serveur : un sous-compétence
  soumis n'est conservé que s'il appartient réellement (dans la taxonomie Admin) à une
  compétence parente actuellement sélectionnée ; sinon il est silencieusement filtré
  (jamais une erreur bloquante) — même garde-fou que côté client (`toggleSpecialty`
  déselectionne aussi les sous-compétences orphelines).
- **`pages/maintenance/competencies.tsx`** (créée dans une tâche précédente, UI non
  interactive pour les sous-compétences) devient interactive : cases à cocher réelles,
  état `selectedSubSkills`, payload `{ skills, categories, subSkills }`.
- **Modale de détail prestataire** (`AgentDetailModal`,
  `pages/cafe/maintenance/maintenance-page.tsx`) : la section "Catégories & Compétences"
  n'affichait que l'union de `categories`/`skills` — aucune sous-compétence. Corrigé pour
  regrouper les VRAIES sous-compétences sauvegardées du prestataire (`agent.subSkills`)
  sous leur bonne compétence parente (jointure via `/api/maintenance/taxonomy`, même cache
  partagé que la page principale — aucune requête dupliquée).
- **Coffee Owner `/maintenance` — filtres** : déjà corrects (`item.categories.includes(filterCategory)`),
  non affectés par l'ajout des sous-compétences. Aucun filtre par sous-compétence n'existe
  aujourd'hui sur cette page ni sur Fast Search — la tâche ne demande d'en synchroniser un
  que "where... introduced by the existing design" (conditionnel) ; aucun n'existe, donc
  aucun ajouté (éviter le scope creep).
- **Formulaire "Publier une intervention"** (`maintenance-job-post-form-modal.tsx`) :
  vérifié — le champ "Catégorie" est déjà une grille de **chips multi-sélection**
  (`categories: string[]`), pas un Select simple, malgré le libellé "single Catégorie
  field" de la tâche. **Décision** : conserver le multi-sélection existant (ne pas casser
  les interventions déjà publiées avec plusieurs catégories) et généraliser la
  coordination à "la liste des sous-compétences correspond à l'UNION des compétences
  parentes actuellement sélectionnées" au lieu de supposer un seul parent — satisfait la
  même UX demandée (le 2ᵉ picklist se met à jour quand le 1ᵉʳ change, les sous-compétences
  orphelines sont retirées) sans régression de compatibilité.
- **`maintenanceJobPosts`** n'avait aucune colonne de sous-catégorie. `categories` était
  **déjà explicitement documenté comme purement informatif, jamais un filtre serveur**
  (confirmé par lecture directe de `isMaintenanceProviderEligible`/
  `getDiscoverableMaintenanceJobPosts` — aucune comparaison avec les compétences du
  prestataire nulle part, aucun code mort/partiel de matching). C'est le vrai écart que
  cette tâche comble.
- **Ciblage manuel (`MaintenanceJobTargetButton`)** : vérifié — il n'existe **aucune** UI
  "parcourir tous les prestataires et cocher les éligibles". Le flux va dans l'autre sens :
  depuis la carte/modale d'UN prestataire déjà affiché, on choisit laquelle de MES
  interventions MANUAL lui associer (`POST /api/maintenance/jobs/:id/targets`). Il n'y a
  donc aucune liste de sélection existante à filtrer visuellement. **Décision** : le vrai
  point d'application de la règle "le Coffee Owner ne doit pas pouvoir contourner
  l'éligibilité" est cette route elle-même (seul endroit où un ciblage est réellement
  enregistré, quelle que soit l'UI qui l'atteint) — j'y ai ajouté la vérification de
  correspondance de compétences, plutôt que d'inventer une nouvelle UI de liste de
  prestataires (hors du "smallest safe change").
- **Distribution automatique** : confirmée purement "pull" — aucun événement de
  "distribution" séparé à dupliquer ; chaque prestataire reréexécute en direct
  `getDiscoverableMaintenanceJobPosts` à chaque `maintenance_jobs_updated`. Donc ajouter un
  filtre de compétence dans cette fonction ne crée aucun risque de notification/
  distribution dupliquée.
- **Écart temps réel préexistant trouvé** (non lié aux compétences) : la route de ciblage
  manuel ne diffusait jamais `maintenance_jobs_updated` — corrigé au passage (même
  convention que les routes create/update existantes), ce qui comble aussi une partie du
  §8 point 7 ("Manual provider selection uses current eligibility").

## 2. Implémentation

**Schéma** (`shared/schema.ts`, poussé via `npm run db:push`, colonnes vérifiées en base) :
- `maintenanceProfiles.subSkills: text[]` (compétences du prestataire → sous-compétences
  réellement offertes).
- `maintenanceJobPosts.subCategories: text[]` (sous-compétences requises par
  l'intervention, optionnelles).

**Backend** (`server/routes.ts`, `server/storage.ts`) :
- `PATCH /api/maintenance/profile` : accepte `subSkills`, filtre serveur contre la
  taxonomie + les compétences effectivement sélectionnées.
- `POST`/`PATCH /api/maintenance/jobs(/:id)` : acceptent `subCategories`, même filtrage
  serveur (`validMaintenanceSubCategories`) contre les catégories effectives de
  l'intervention.
- **Nouvelle fonction** `storage.isMaintenanceProviderSkillMatch(userId, job)` — ADDITIVE à
  `isMaintenanceProviderEligible` (non modifiée) : une intervention sans catégorie requise
  correspond toujours ; sinon le prestataire doit avoir au moins une des catégories
  requises dans ses propres `skills` ; si des sous-compétences sont requises, il doit aussi
  avoir au moins l'une d'elles dans ses propres `subSkills`.
- `getDiscoverableMaintenanceJobPosts` : les interventions **AUTOMATIC** sont maintenant
  filtrées par `isMaintenanceProviderSkillMatch` en plus du filtre d'éligibilité existant
  (inchangé). Les interventions **MANUAL** ciblées restent affichées sans re-filtrage ici
  (déjà validées à l'assignation et à la publication — voir ci-dessous) pour ne jamais faire
  disparaître silencieusement une intervention explicitement ciblée par le Coffee Owner.
- `POST /api/maintenance/jobs/:id/targets` : ajoute la vérification
  `isMaintenanceProviderSkillMatch` (rejet 400 si non conforme) + diffuse désormais
  `maintenance_jobs_updated` (écart préexistant comblé).
- `PATCH /api/maintenance/jobs/:id` : quand le statut passe à `PUBLISHED` en mode
  `MANUAL`, re-vérifie CHAQUE cible déjà enregistrée contre les compétences
  effectives (celles de la requête si modifiées, sinon les existantes) ; si une cible ne
  correspond plus, la publication est bloquée avec un message nommant le(s) prestataire(s)
  concerné(s) — jamais de suppression silencieuse d'une cible déjà enregistrée.

**Client** :
- `pages/maintenance/competencies.tsx` : sous-compétences redevenues sélectionnables
  (cases à cocher réelles), payload de sauvegarde étendu.
- `pages/cafe/maintenance/maintenance-page.tsx` (`AgentDetailModal`) : section
  "Catégories & Compétences" regroupe maintenant les sous-compétences réellement
  sauvegardées sous leur compétence parente.
- `components/maintenance/maintenance-job-post-form-modal.tsx` : nouveau picklist
  "Sous-compétences", filtré par les catégories actuellement cochées, se vide des
  sous-compétences devenues invalides quand une catégorie est décochée.
- `hooks/use-maintenance-jobs.ts` : `MaintenanceJobPostInput` étend `subCategories`.

## 3. Synchronisation temps réel — aucun nouveau mécanisme

Tout repose sur les événements déjà existants, déjà câblés dans `use-realtime.ts` :
`maintenance_updated` (profil prestataire → invalide `/api/maintenance/profiles`,
`/api/maintenance/profile`, etc.) et `maintenance_jobs_updated` (interventions → invalide
`/api/maintenance/jobs*`, `/api/maintenance/applications/mine`). Aucun nouvel événement
introduit ; le seul changement temps réel est l'ajout du `broadcast` manquant sur la route
de ciblage (§1).

## 4. Garde-fous respectés

- Aucune donnée existante supprimée/réinitialisée : les deux nouvelles colonnes démarrent
  à `[]` par défaut, aucune migration destructive.
- `isMaintenanceProviderEligible` non modifiée — le matching de compétences est une
  fonction séparée, additive, jamais un remplacement des règles d'éligibilité existantes
  (rôle/statut/visibilité/gel/approbation).
- Admin → Maintenance → Compétences et Imprimerie → Catégories non touchés.
- Aucune logique de livraison/paiement/ledger touchée.

## 5. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès (2819 modules).
- `npm run db:push` → les deux nouvelles colonnes (`maintenance_profiles.sub_skills`,
  `maintenance_job_posts.sub_categories`) existent et ont été vérifiées en base.
- Aucun navigateur ni serveur de développement redémarré dans cet environnement — pas de
  test de bout en bout réel (publication automatique/manuelle, synchronisation à deux
  onglets) ; comportement vérifié par lecture de code et par les deux audits dédiés menés
  avant l'implémentation.

## 6. Limites connues / suivi optionnel

- L'onglet Admin "Interventions" (lecture seule) n'affiche pas encore `subCategories` dans
  son tableau récapitulatif — non requis par la checklist de la tâche, laissé tel quel par
  prudence de périmètre (§7 : "reuse the existing Admin configuration... without changing
  the configuration interface").
- Aucune UI "parcourir tous les prestataires éligibles" n'existe pour le ciblage manuel
  (confirmé absente avant cette tâche) — l'application réelle de la règle d'éligibilité se
  fait côté serveur sur la route d'assignation, pas via un filtrage visuel d'une liste qui
  n'existe pas.

---

# Analyse — Fix Maintenance Sub-Skill Isolation, Intervention Matching & Filter UI

## 1. Audit — cause racine du bug de sélection partagée

**Confirmé par lecture directe, pas supposé** : `maintenanceProfiles.subSkills` (et le
code qui le lit/l'écrit, introduits lors de la tâche précédente) stockait chaque
sélection comme un **nom brut** de sous-compétence (`selectedSubSkills: string[]`), puis
vérifiait `selectedSubSkills.includes(sub.name)` pour chaque compétence parente affichée.
Or le même libellé (`Entretien`, `Installation`, `Réparation`...) existe légitimement sous
plusieurs compétences parentes différentes dans la taxonomie Admin (lignes distinctes de
`maintenance_sub_competencies`, `id`/`competencyId` différents, `name` identique). Cocher
"Installation" sous Caméras ajoutait la chaîne `"Installation"` au tableau ; en
redessinant la carte Climatisation, `selectedSubSkills.includes("Installation")`
retournait `true` aussi — exactement le bug décrit. **Même bug, exactement la même
cause**, retrouvé dans 3 autres endroits qui comparaient par nom brut :
`AgentDetailModal` (regroupement d'affichage), `storage.isMaintenanceProviderSkillMatch`
(correspondance d'éligibilité), et implicitement toute page de filtre qui aurait comparé
par nom.

**Cause du problème "Association Impossible" (§4)** : `MaintenanceJobTargetButton` (le
seul endroit où un ciblage manuel est réellement créé — confirmé par un audit dédié lors
de la tâche précédente : il n'existe AUCUNE UI "parcourir tous les prestataires") liste
les interventions MANUAL+PUBLISHED du Coffee Owner **sans aucun filtre de compétence**,
quel que soit le prestataire dont la fiche/carte héberge le bouton. Seul le serveur
(ajouté la tâche précédente) rejetait l'association après coup. Le vrai problème n'est
donc pas le sens du flux ("choisir un prestataire pour un job"), mais l'absence de
filtrage AVANT l'affichage des choix dans ce flux existant.

## 2. Correctif structurel — clé qualifiée par le parent

Nouveau module partagé **`shared/maintenance-sub-skill-key.ts`** :
`encodeMaintenanceSubSkillKey(competency, subSkill)` / `decodeMaintenanceSubSkillKey(key)`
— produit/lit des clés `"<compétence>::<sous-compétence>"`. Utilisé partout où une
sélection de sous-compétence de PRESTATAIRE est lue/écrite/comparée (jamais de
ré-écriture ad hoc du split/join ailleurs) :
- `pages/maintenance/competencies.tsx` — `selectedSubSkills` stocke désormais des clés ;
  `toggleSubSkill(competencyName, subSkillName)` encode ; l'état "coché" de chaque case
  se vérifie par clé complète, donc deux sous-compétences de même nom sous deux parents
  différents ont des états de case totalement indépendants (vérifié par construction : la
  clé inclut le nom du parent). Décocher une compétence parente filtre par
  `decode(key).competency === name` (jamais par simple nom de sous-compétence).
- `AgentDetailModal` (`pages/cafe/maintenance/maintenance-page.tsx`) — le regroupement
  "Catégories & Compétences" décode directement chaque clé sauvegardée du prestataire
  (n'a plus besoin de recouper par nom contre toute la taxonomie, ce qui éliminait la
  seule source d'ambiguïté possible).
- `server/routes.ts` (`PATCH /api/maintenance/profile`) — validation serveur : décode
  chaque clé soumise, vérifie que `competency` fait partie de la sélection effective de
  compétences ET que `subSkill` est une vraie sous-compétence Admin de CE parent précis
  (plus une simple vérification par nom contre l'union de toutes les sous-compétences
  valides).
- `server/storage.ts` (`isMaintenanceProviderSkillMatch`) — reconstruit la clé attendue
  (`encodeMaintenanceSubSkillKey(parent, subName)`) et la compare au tableau
  `subSkills` du prestataire, donc un prestataire ayant "Installation" sous un AUTRE
  parent ne correspond plus jamais par erreur à une intervention qui exige
  "Caméras → Installation" — exemple explicite de la tâche, vérifié dans le code.
- Filtre Coffee Owner `/maintenance` (nouveau, voir §4) — même principe.

Aucune migration de schéma nécessaire pour ce correctif : la colonne reste
`text("sub_skills").array()`, seul le **format du contenu** change (clé composite au lieu
d'un nom brut). Toute donnée déjà enregistrée au format brut (uniquement des données de
test introduites lors de la tâche immédiatement précédente, dans cette même session) ne
sera simplement plus reconnue par `decodeMaintenanceSubSkillKey` (retourne `null`, filtrée
silencieusement) — aucune perte de données réelle/historique, car cette colonne n'existait
pas avant cette session.

## 3. Intervention — une compétence, plusieurs sous-compétences

`maintenance-job-post-form-modal.tsx` : le champ "Catégories" (grille de chips
multi-sélection) devient un `Select` **single-select** (`form.category: string`).
Soumis comme `categories: form.category ? [form.category] : []` — **aucun changement de
schéma** (`maintenanceJobPosts.categories` reste un `text[]`, un enregistrement
historique à plusieurs catégories reste lisible, et se "collapse" à sa première catégorie
seulement s'il est réédité et resauvegardé, conformément à l'exigence explicite de
single-select). Changer la compétence parente retire automatiquement toute
sous-compétence déjà cochée qui n'appartient pas à la nouvelle (même règle que côté
Admin/Compétences prestataire, avec le même garde-fou serveur `validMaintenanceSubCategories`
déjà en place depuis la tâche précédente).

## 4. Correctif du ciblage manuel — filtrer avant la sélection

`isMaintenanceProviderSkillMatch` (serveur) passe de `.some()` à `.every()` pour les
sous-compétences requises — "the provider must satisfy... for all required sub-skills.
Do not silently weaken the requirements" — un prestataire ne connaissant qu'une partie
des sous-compétences exigées n'est plus considéré éligible.

`MaintenanceJobTargetButton` reçoit deux nouvelles props (`maintenanceSkills`,
`maintenanceSubSkills` — les données déjà chargées du prestataire dont la fiche/carte
héberge le bouton, aucune requête réseau supplémentaire) et filtre la liste de **ses
propres interventions MANUAL+PUBLISHED** par une fonction miroir côté client
(`jobMatchesProviderSkills`, même sémantique `.every()`) avant même de les proposer —
donc un prestataire incompatible n'apparaît plus du tout comme option sélectionnable,
au lieu d'échouer après coup avec "Association impossible". Message vide distinct selon
le cas réel : "aucune intervention manuelle publiée" (rien à proposer) vs "aucune de vos
interventions ne correspond aux compétences de ce professionnel" (des jobs existent, mais
aucun ne convient à CE prestataire précis). La validation serveur existante reste
l'unique rempart réel (ce filtrage client est un confort UX, pas la sécurité) — elle ne
peut plus se déclencher que si les compétences du prestataire changent entre l'ouverture
du menu et le clic, cas que la tâche demande explicitement de gérer "clairement" (déjà le
cas : le serveur renvoie toujours une erreur explicite).

Interprétation nécessaire : le texte de la tâche parle de "filtrer les prestataires
sélectionnables", mais **aucune UI de ce type n'existe** (confirmé par audit dédié) — le
flux réel va dans l'autre sens (depuis la fiche d'UN prestataire, choisir LEQUEL de mes
jobs lui associer). Le correctif applique donc le même principe ("ne jamais proposer une
option invalide") au flux qui existe réellement, plutôt que d'inventer une nouvelle UI de
navigation de prestataires (hors du "smallest safe change").

## 5. Filtres Coffee Owner `/maintenance` — parité visuelle avec `/print`

Vérifié : la bande de chips "Compétences" en haut de la page Maintenance suit déjà
exactement le même motif que la bande de chips catégorie de `/print`
(`PrintCategoryStrip`) — rien à changer là. La seule pièce manquante était un filtre
"Sous-compétence" dans la seconde rangée de filtres : ajouté comme `Select`, classes
strictement identiques à celles déjà utilisées par `/print`'s `Sous-catégorie`
(`h-7 text-xs rounded-full px-3 ... ${t.selectTrigger}`), options limitées aux
sous-compétences de la compétence actuellement sélectionnée (`subSkillsByCategory`, déjà
construite lors d'une tâche précédente), masqué entièrement si aucune compétence n'est
sélectionnée ou si elle n'a aucune sous-compétence — même comportement que `/print`. Le
filtrage réel compare par clé qualifiée (`encodeMaintenanceSubSkillKey(filterCategory,
filterSubSkill)` contre `item.subSkills`), donc un prestataire ayant le même libellé sous
un autre parent n'apparaît jamais à tort dans les résultats.

## 6. Garde-fous respectés

- Aucune donnée existante supprimée/réinitialisée ; aucune nouvelle table/colonne autre
  que celles déjà introduites la tâche précédente (réutilisées, pas dupliquées).
- `isMaintenanceProviderEligible` (statut/approbation/visibilité/gel) toujours
  intouchée — le matching de compétences reste une vérification additive séparée.
- Admin → Maintenance → Compétences, Imprimerie → Catégories et `/print` lui-même non
  modifiés.
- Aucune logique de livraison/paiement/ledger touchée.

## 7. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès (2820 modules, +1 pour `shared/maintenance-sub-skill-key.ts`).
- Aucun navigateur ni serveur de développement redémarré dans cet environnement — pas de
  test de bout en bout réel ; comportement vérifié par lecture de code (en particulier la
  reproduction manuelle du bug original avant correctif : tracer `selectedSubSkills.includes(sub.name)`
  confirme la collision par nom, corrigée par la clé qualifiée).

---

# Analyse — Simplify Admin → Users → Add User Form

## 1. Audit

- **Un seul fichier concerné** : `pages/admin/users-page.tsx`, qui contient DEUX
  composants distincts partageant les mêmes constantes/hooks/`MultiChip` :
  `AddUserModal` (le formulaire "Ajouter un utilisateur", seul concerné par cette tâche)
  et `UserDetailDialog` (la modale d'édition d'un compte existant, **non mentionnée par
  la tâche — non touchée**).
- Vérifié avant modification : `TUNISIAN_GOVERNORATES`, `MARKETING_CATS`,
  `MAINTENANCE_CATS`, `PRINT_CATS`/`usePrintCategoryOptions`, `BARISTA_SPECIALTIES`/
  `useBaristaSkillOptions`, et le composant `MultiChip` sont tous **réutilisés par
  `UserDetailDialog`** (ses propres `form.governorates`/`printCategories`/etc., envoyés
  dans `handleSave()`) — donc aucun de ces éléments partagés n'a été supprimé ; seuls
  leurs DEUX appels de hook et les 5 blocs `<MultiChip>` propres à `AddUserModal` ont été
  retirés.
- Vérifié côté serveur (`POST /api/admin/users`, `server/routes.ts`) : `governorates`,
  `printCategories`, `marketingCategories`, `maintenanceCategories`, `categories` sont
  déjà **tous optionnels** (`?? null`) — aucune contrainte serveur ne force leur envoi à
  la création. Retirer ces champs du payload client ne peut donc jamais faire échouer
  `POST /api/admin/users`.
- **Validation cachée trouvée et corrigée** : `validate()` du formulaire Add User avait
  `if (form.governorates.length === 0) e.governorates = "Sélectionnez au moins un
  gouvernorat";` pour DELIVERY_COMPANY — en supprimant le champ sans retirer cette ligne,
  la création d'un compte Delivery Company serait devenue **définitivement impossible**
  (le tableau restant toujours vide). Retirée en même temps que le champ, exactement le
  risque que la tâche demandait d'anticiper ("Ensure that removing these inputs does not
  leave behind hidden validation requirements... prevent form submission").

## 2. Implémentation

Dans `AddUserModal` uniquement :
- Suppression des 5 blocs `<MultiChip>` (Gouvernorats couverts / Catégories impression /
  Services marketing / Spécialités ×2 / Catégories de maintenance) et de leurs messages
  d'erreur associés.
- Suppression de `governorates`/`printCategories`/`marketingCategories`/
  `maintenanceCategories`/`categories` de l'état `form`, de `reset()`, et des 5 lignes
  conditionnelles qui les ajoutaient au payload dans `submit()`.
- Suppression de la validation `governorates` (seule validation cachée trouvée — aucune
  autre règle de validation ne portait sur ces 5 champs).
- Suppression des deux appels `useBaristaSkillOptions()`/`usePrintCategoryOptions()`
  propres à `AddUserModal` (devenus inutilisés dans ce composant précis uniquement — les
  deux fonctions et leurs deux AUTRES appels dans `UserDetailDialog` restent intacts).

## 3. Garde-fous respectés

- `UserDetailDialog` (modale d'édition) strictement inchangée — toujours capable
  d'afficher/envoyer ces 5 champs si un jour on lui ajoute une UI pour les éditer (déjà le
  cas avant cette tâche : le payload existant les transmettait déjà, sans UI de
  modification).
- Aucune route, permission, ou règle métier serveur modifiée.
- Admin → PRINT → Catégories, Maintenance → Compétences, et tout autre module de
  configuration de catégories/spécialités non touchés — ces taxonomies restent la seule
  source de vérité, inchangée.
- Aucune donnée utilisateur existante supprimée/réinitialisée.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès (2820 modules).
- Aucun navigateur disponible — pas de test de clic réel ; la suppression de la
  validation `governorates` a été vérifiée par lecture directe du code (confirmée comme
  seule règle de validation bloquante parmi les 5 champs retirés).

---

# Analyse — Remove Legacy Categories from Maintenance and Use Only Compétences

## 1. Audit

- **Bug confirmé en base, pas supposé** : requête directe sur `maintenance_profiles`
  montre que `categories` (`text[]`) et `skills` (`text[]`) — censées toujours rester
  identiques (le formulaire Business → Compétences envoyait déjà les deux avec la même
  valeur) — avaient **déjà divergé** pour de vrais comptes. Exemple réel : compte 27
  "GOMYCODE" → `categories: []` alors que `skills: ["Caméras", "Chicha"]` avec des
  `sub_skills` réels associés. `skills` est donc la seule valeur à jour ; `categories`
  est un doublon mort qui n'est plus écrit nulle part.
- **Deuxième champ mort trouvé, distinct du premier** : `users.maintenanceCategories`
  (colonne séparée sur `users`, pas sur `maintenance_profiles`). Vérifié en base : ses
  valeurs sont totalement déconnectées des vraies compétences de chaque compte. Tracé
  son seul point d'écriture légitime côté UI (`AddUserModal`) — déjà retiré dans la tâche
  précédente ("Simplify Admin → Users → Add User Form"). `UserDetailDialog` portait
  encore un état mort `maintenanceCategories` (seedé depuis `u.maintenanceCategories`,
  renvoyé dans `handleSave()`) sans aucun sélecteur UI réel (confirmé par recherche :
  zéro rendu conditionnel pour ce champ dans tout le composant) — pur passthrough mort.
- **Route admin déjà cassée pour Maintenance, trouvée avant d'y toucher** :
  `PATCH /api/admin/users/:id/categories` (seul appelant : `admin/categories-page.tsx`)
  tracée en détail : `getUserCategories()` n'a aucune branche `MAINTENANCE` (retombe sur
  `.categories` générique) et `PRESET_CATS_BY_ROLE` n'a aucune entrée `MAINTENANCE` — cette
  route était donc déjà 100% non fonctionnelle pour Maintenance avant cette tâche, pas un
  doublon actif à retirer. Laissée intacte (route partagée, utilisée par d'autres rôles).
- **Formulaire d'inscription vérifié** : `MaintenanceForm` (`landing-page.tsx`) ne
  collecte ni `categories` ni `skills` à l'inscription — un commentaire existant confirme
  que ces champs sont "complétés plus tard depuis la page de profil du compte
  Maintenance". Le schéma zod partagé de `/api/auth/register` garde donc
  `maintenanceCategories` accepté-mais-inutilisé (même traitement que les champs
  équivalents non encore collectés des autres rôles) — non retiré, pour éviter de
  modifier un objet de schéma partagé pour un bénéfice marginal.
- Audit complet des consommateurs de `.categories`/`.skills` côté Admin, Coffee Owner et
  Espace Maintenance avant toute modification (grep exhaustif + lecture de chaque site)
  pour s'assurer qu'aucune donnée réelle ne serait perdue en basculant sur `skills` seul.

## 2. Implémentation

**Un seul champ authoritative : `maintenanceProfiles.skills`.** `categories` est
marquée dépréciée par commentaire de schéma (colonne conservée, non supprimée — "éviter
les changements de base de données inutiles") mais n'est plus lue nulle part côté
affichage/filtrage/appariement.

- `shared/schema.ts` : commentaires de dépréciation sur `maintenanceProfiles.categories`
  (colonne gardée, plus aucun code ne l'écrit) ; `skills` documentée comme LE champ de
  compétence authoritative.
- `server/storage.ts` :
  - `getMaintenanceAdminOverview()` — stat "Demandes par compétence" : lit désormais
    `profile.skills` (plus `profile.categories`).
  - `getMaintenanceProfiles()` / `getMaintenanceCard()` : `specialty` dérivée de
    `profile.skills[0]` (plus `profile.categories[0]`).
  - `getMaintenanceCategories()` (fallback de bootstrap, utilisé seulement si la
    taxonomie admin est totalement vide) et `seedMaintenanceTaxonomyIfEmpty()` : lisent
    `skills`, plus `categories`.
- `server/routes.ts` :
  - `PATCH /api/maintenance/profile` : `categories` retiré du schéma zod du body —
    seul `skills` est accepté désormais.
  - `POST /api/auth/register` (branche MAINTENANCE) : `categories` n'est plus écrit au
    profil créé (il restait de toute façon toujours vide, cf. audit ci-dessus).
- `client/src/pages/maintenance/competencies.tsx` : le payload de sauvegarde n'envoie
  plus `categories`, seulement `skills`/`subSkills`.
- `client/src/hooks/use-favorites.ts` : `syncMaintenance()` lit `profile.skills` (plus
  `profile.categories`) pour synchroniser les favoris.
- **Coffee Owner — `cafe/maintenance/maintenance-page.tsx`** : `AgentCard` et les deux
  appels `toggleMaintenance()` utilisent `agent.skills` ; la section détail du prestataire
  (`AgentDetailModal`) n'affiche plus qu'une unique liste "Compétences" (au lieu de
  "Catégories & Compétences" avec union `[...categories, ...skills]`) ; la recherche et
  le filtre (`filtered` memo) utilisent `item.skills` exclusivement.
- **`maintenance-fast-search.tsx`** : `allCategories`, le filtre `filtered`, et
  `triggerFavorite()` lisent tous `p.skills` ; le libellé du panneau de filtre passe de
  "Catégorie" à "Compétence".
- **`maintenance-job-post-form-modal.tsx`** : tous les libellés utilisateur visibles
  ("Catégories" → "Compétence", "Aucune catégorie disponible" → "Aucune compétence
  disponible", placeholder du Select, message de guidage) renommés — les identifiants
  internes (`categoryOptions`, `form.category`, data-testids) sont restés inchangés car
  hors périmètre (terminologie utilisateur, pas identifiants de code).
- **Admin → Users (`admin/users-page.tsx`, `UserDetailDialog`)** : suppression complète
  du champ mort `maintenanceCategories` (state, seed `useEffect`, payload `handleSave()`)
  et de la constante `MAINTENANCE_CATS` désormais inutilisée (vérifié par recherche :
  zéro usage restant après suppression).
- **Admin → Maintenance (`admin/maintenance-page.tsx`)** :
  - Panneau détail d'une intervention : libellé "Catégorie" → "Compétence" (vue en
    lecture seule du champ `jobPost.categories`, qui reste un champ d'intervention à part,
    volontairement inchangé — cf. modèle "une seule compétence par intervention" déjà mis
    en place dans la tâche précédente).
  - Filtre Select des interventions : placeholder "Catégorie" → "Compétence", option
    "Toutes catégories" → "Toutes compétences".
  - **Panneau détail d'un compte prestataire** : affichait
    `[...account.categories, ...account.skills]` sous le libellé "Compétences /
    catégories" — union avec le champ mort, pouvant afficher doublons/entrées obsolètes.
    Corrigé pour n'afficher que `account.skills`, libellé simplifié en "Compétences".
  - **Options de filtre / recherche / filtrage de la liste des comptes**
    (`filterOptions.categories`, `haystack` de recherche, condition de filtre `category`) :
    les trois lisaient `[...a.categories, ...a.skills]` — ramenés à `a.skills` seul,
    pour ne plus jamais faire apparaître une compétence fantôme venant du champ mort.
  - Ligne 284 (commentaire de code référençant "Admin → PRINT → Catégories'
    SubCategoryManager") : vérifiée et **laissée intacte** — c'est une référence à un
    module différent (PRINT) où "Catégories" reste le nom correct, pas une étiquette du
    système legacy visé par cette tâche.
- **Espace Maintenance** :
  - `maintenance-job-management-modal.tsx` (détail d'intervention côté prestataire) :
    libellé "Catégorie" → "Compétence" (même champ `job.categories`, même raisonnement
    que côté Admin).
  - `interventions.tsx` (modale de détail d'intervention) : libellé "Catégorie" →
    "Compétence".
  - `analytics.tsx` : stat "Catégories utilisées" → "Compétences utilisées" (compte le
    nombre de valeurs distinctes de `reservation.category`, un champ d'instantané
    d'intervention, pas le système de compétences dupliqué — renommé pour cohérence
    terminologique à travers tout le module, pas pour une raison de duplication de
    données).
  - `profile.tsx`, `business.tsx` : vérifiés, aucune étiquette "Catégorie" restante.

## 3. Garde-fous respectés

- **Aucune donnée supprimée.** La colonne `maintenanceProfiles.categories` reste en
  base (dépréciée par commentaire uniquement) ; aucune migration destructrice. Les
  sélections de compétences/sous-compétences existantes, les enregistrements
  d'intervention historiques, et les relations parent/sous-compétence sont intacts —
  aucune de ces modifications ne touche aux données elles-mêmes, uniquement aux chemins
  de lecture/écriture et aux libellés.
- **Une seule source de vérité.** `skills` est désormais le seul champ de compétence lu
  par l'Admin (overview, liste de comptes, filtres), le Coffee Owner (filtres, cartes,
  détail prestataire, création d'intervention) et l'Espace Maintenance (sauvegarde,
  affichage de profil) — plus aucune lecture de `categories`/`maintenanceCategories`
  nulle part dans ces trois espaces.
- **Appariement par compétences inchangé et déjà correct** :
  `isMaintenanceProviderSkillMatch()` (tâche précédente) continue de vérifier
  `profile.skills.includes(parent)` puis chaque sous-compétence requise via
  `encodeMaintenanceSubSkillKey()` — non modifié ici, toujours la seule logique
  d'éligibilité manuelle/automatique.
- **PRINT et modules non liés non touchés** : `printCategoryTaxonomy`,
  `admin/print-page.tsx`, `printer/categories.tsx`, et toute référence à "Catégories" où
  elle désigne légitimement le système PRINT sont restées strictement inchangées — la
  seule occurrence PRINT trouvée dans un fichier Maintenance est un commentaire de
  référence, volontairement laissé tel quel.
- **Synchronisation temps réel inchangée** : aucun nouvel événement introduit ;
  `broadcast("maintenance_updated", ...)` et `broadcast("maintenance_jobs_updated", ...)`
  (déjà câblés dans `use-realtime.ts`) continuent de propager les mises à jour sans
  rafraîchissement manuel.
- **Routes/permissions/comptes non affectés** : `PATCH /api/admin/users/:id/categories`
  laissée intacte (déjà non fonctionnelle pour Maintenance avant cette tâche, partagée
  par d'autres rôles) ; aucune route supprimée ou renommée ; aucune règle de
  validation/permission modifiée.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès (client + serveur compilés sans erreur, `dist/index.cjs`
  généré).
- Aucun navigateur/serveur de développement disponible dans cet environnement — pas de
  test de clic réel de bout en bout. Comportement vérifié par :
  - requêtes SQL directes confirmant la divergence réelle `categories`/`skills` avant
    correctif (base du diagnostic, pas une supposition) ;
  - recherche exhaustive (`grep`) de `Catégorie`/`Categories`/`.categories` à travers
    tous les fichiers touchant Maintenance (Admin, Coffee Owner, Espace Maintenance)
    après implémentation, pour confirmer qu'aucune étiquette ou lecture du système
    legacy ne subsiste, hors la référence PRINT volontairement conservée.
- **Limite à signaler** : la colonne `maintenanceProfiles.categories` reste présente en
  base (non supprimée, par choix explicite de la tâche) — elle n'est simplement plus
  lue ni écrite par aucun chemin de code actif.

---

# Analyse — Marketing Categories & Subcategories: Complete End-to-End Integration

## 1. Audit

- **Référence PRINT étudiée en détail** avant toute modification :
  `printCategoryTaxonomy`/`printSubCategoryTaxonomy` (taxonomie Admin à deux niveaux),
  `users.printCategories`/`printSubCategories` (sélection propre à chaque compte
  Imprimerie, distincte de la taxonomie Admin), `GET/PATCH /api/print/me/categories`
  (mapping self-service), `validatePrintTaxonomySelection` (validation serveur :
  catégorie/sous-catégorie actives ET sélectionnées par le compte), et
  `pages/printer/categories.tsx`/`services.tsx` (UI de sélection + formulaire de
  service gated par cette sélection).
- **Modèle Marketing existant audité** et trouvé substantiellement différent de PRINT :
  - `marketingProfiles.categories` n'est **pas** une sélection éditable — c'est un
    résumé **dérivé**, recalculé automatiquement à partir des services réellement
    PUBLIÉS de l'agence (`storage.syncMarketingProfileCategories`, appelé après chaque
    création/mise à jour/suppression de service). Le champ `categories` accepté par
    `PATCH /api/marketing/profile` n'est envoyé par **aucun** appel client réel
    (vérifié dans `marketing/profile.tsx`'s `saveAll()`).
  - Il n'existait **aucun** mécanisme de sélection de catégories à l'échelle du compte
    (pas d'équivalent de `users.printCategories`), et **aucune** notion de
    sous-catégorie Marketing nulle part (ni taxonomie, ni champ sur les services).
  - Le formulaire "Nouveau service" (`marketing/services.tsx`) proposait déjà
    n'importe quelle catégorie Admin active, sans aucun filtre par sélection de compte.
- **Risque de compatibilité identifié avant d'implémenter le gating façon PRINT** :
  si le nouveau Select "Catégorie" du formulaire de service était immédiatement
  restreint à une sélection de compte (comme PRINT), **toutes** les agences existantes
  (dont la sélection démarre vide puisque le champ est nouveau) perdraient
  instantanément la possibilité de modifier leurs services déjà créés — leur
  catégorie actuelle ne figurerait pas encore dans la liste. Confirmé par une requête
  SQL directe : l'agence réelle 19 a 4 services (Ads/Branding/Photo/Vidéo) et un
  nouveau champ `selected_categories` vide par défaut.

## 2. Implémentation

**Modèle de données (`shared/schema.ts`)** — nouvelle taxonomie et sélection
entièrement indépendantes de PRINT (aucune table/donnée PRINT réutilisée) :
- `marketingSubCategoryTaxonomy` (nouvelle table) : miroir exact de
  `printSubCategoryTaxonomy` (id/categoryId/name/icon/isActive/isFrozen,
  `categoryId` en référence souple comme toutes les taxonomies de ce projet, index +
  contrainte d'unicité `(categoryId, name)`).
- `marketingProfiles.selectedCategories`/`selectedSubCategories` (nouvelles colonnes
  `text[]`) : la vraie sélection de l'agence, distincte du `categories` existant
  (qui reste le résumé dérivé, documenté comme tel, non touché).
- `marketingServices.subCategories` (nouvelle colonne `text[]`, défaut `[]`) :
  multi-sélection par service (contrairement à PRINT qui n'autorise qu'une seule
  sous-catégorie par article — ce point est explicitement demandé différent par
  cette tâche).
- Aucune colonne existante renommée ou supprimée ; `npm run db:push` appliqué et
  vérifié par lecture directe du schéma en base — toutes les données existantes
  (2 profils, 4 services, 7 catégories) intactes après la migration.

**Serveur (`server/storage.ts`, `server/routes.ts`)** :
- CRUD Admin des sous-catégories (`getMarketingSubCategoryTaxonomy`,
  `createMarketingSubCategory`, `updateMarketingSubCategory`,
  `deleteMarketingSubCategory`) + routes `POST/PATCH/DELETE
  /api/admin/marketing/subcategories`, miroir exact des routes PRINT équivalentes.
- `getMarketingCategoryMapping`/`setMarketingCategoryMapping` + routes
  `GET/PATCH /api/marketing/me/categories` : mapping self-service de l'agence,
  miroir de `getPrinterCategoryMapping`/`setPrinterCategoryMapping` — valide chaque
  catégorie/sous-catégorie soumise contre la taxonomie Admin active ET la cohérence
  parent/enfant, rejette silencieusement le reste et le rapporte (`rejected`).
- **Migration auto-réparatrice** (`migrateMarketingCategoryMappingIfNeeded`,
  appelée au premier `getMarketingCategoryMapping`) : si une agence a déjà de vrais
  services mais `selectedCategories` encore vide, ensemence `selectedCategories` à
  partir des catégories réellement utilisées par ses services existants — jamais les
  sous-catégories (aucune donnée historique à migrer, champ réellement nouveau).
  Ceci neutralise exactement le risque de compatibilité identifié à l'audit : une
  agence déjà active peut immédiatement continuer à modifier ses services existants ;
  seule une agence sans aucun service voit le nouveau message "sélectionnez d'abord
  une catégorie".
- `validateMarketingTaxonomySelection` (nouveau, dans `routes.ts`) : miroir de
  `validatePrintTaxonomySelection`, adapté à un tableau `subCategories[]` (PRINT ne
  valide qu'une sous-catégorie singulière) — appelé sur `POST`/`PATCH
  /api/marketing/services`.
- `getMarketingAdminOverview()` renvoie désormais aussi `subcategoryTaxonomy` (même
  convention que l'overview PRINT).
- Réutilisation de l'événement temps réel existant `marketing_updated` (aucun nouvel
  événement introduit) : les mutations Admin de sous-catégories et le mapping
  self-service diffusent `{kind: "taxonomy"}`/`{kind: "mapping"}` comme le fait déjà
  le reste du module Marketing.

**Client** :
- `hooks/use-marketing.ts` : nouveaux types (`MarketingSubCategory`,
  `MarketingCategoryMapping`), nouveaux hooks (`useMarketingSubCategoryTaxonomy`,
  `useMyMarketingCategoryMapping`, `useUpdateMarketingCategoryMapping`) ; `category`/
  `selectedCategories`/`selectedSubCategories`/`subCategories` ajoutés aux types
  `MarketingProfile`/`MarketingService` existants.
- `pages/marketing/categories.tsx` (nouveau) : Business → Catégories, miroir quasi
  exact de `pages/printer/categories.tsx` (mêmes stats/pagination/interaction
  cocher-une-catégorie-affiche-ses-sous-catégories), adapté au thème fuchsia et à la
  taxonomie Marketing indépendante.
- `pages/marketing/business.tsx` : nouvel onglet "Catégories" ajouté au
  `SubTabSwitcher`, entre Services et Projets.
- `App.tsx` : route de redirection directe `/marketing-panel/categories` →
  `/marketing-panel/business?tab=categories`, même convention que les autres
  sous-onglets Business.
- `pages/marketing/services.tsx` (`ServiceFormDialog`) : le Select "Catégorie" est
  désormais limité à la sélection de l'agence (`mappedCategories`), avec le même
  bandeau d'avertissement + lien vers Catégories que PRINT quand la sélection est
  vide ; nouveau multi-select "Sous-catégories" (cases à cocher) scopé à la catégorie
  choisie ∩ la sélection de l'agence ; changer de catégorie vide automatiquement les
  sous-catégories ; l'édition d'un service pré-sélectionne ses sous-catégories
  sauvegardées ; état vide explicite si la catégorie choisie n'a aucune sous-catégorie
  sélectionnée. Carte de la grille Services : ligne sous-catégories ajoutée (miroir du
  `item.subCategory` de PRINT).
- `components/marketing/marketing-service-detail-modal.tsx` (modal Coffee Owner) :
  badges "Sous-catégories" ajoutés juste sous le titre, affichant uniquement les
  sous-catégories réellement enregistrées pour CE service (jamais la liste complète
  disponible sous la catégorie parente).
- `lib/marketing-category-icon.ts` : `resolveMarketingSubCategoryIcon` ajouté, même
  convention de fallback que la fonction catégorie existante.
- `hooks/use-realtime.ts` : `marketing_updated` invalide désormais aussi
  `/api/marketing/subcategories` et `/api/marketing/me/categories` (même liste
  d'invalidation existante, deux clés ajoutées).
- `pages/admin/marketing-page.tsx` : nouveau composant `SubCategoryManager` (miroir
  exact de celui de PRINT), rendu à côté de `TaxonomyList` dans l'onglet "Catégories de
  services" ; type `Overview` étendu avec `subcategoryTaxonomy` ; la carte "Demandes
  par catégorie" déplacée en pleine largeur en dessous (gardée telle quelle — revue
  mais jugée suffisante sans ventilation par sous-catégorie, qui n'apporterait rien
  d'actionnable de plus) ; `refresh()` invalide désormais aussi
  `/api/marketing/subcategories`.

## 3. Garde-fous respectés

- **Taxonomie Marketing strictement indépendante de PRINT** : aucune table, route, ni
  donnée PRINT lue ou modifiée ; vérifié par relecture de tous les fichiers PRINT
  touchés par la session (aucun) et confirmation que `marketingSubCategoryTaxonomy`
  est une table entièrement nouvelle, jamais un alias de `printSubCategoryTaxonomy`.
- **Aucune perte de données** : `npm run db:push` n'a fait qu'ajouter des colonnes/une
  table ; vérifié par requête directe post-migration (2 profils, 4 services, 7
  catégories — tous identiques à avant). Le champ dérivé `categories` sur
  `marketingProfiles` reste inchangé et continue d'alimenter les consommateurs
  périphériques existants (MarketingFastSearch, liste `/api/marketing/profiles`).
- **Migration auto-réparatrice testée en conditions réelles** (pas seulement lue) :
  script `tsx` ad hoc exécuté contre la vraie base de développement, confirmant que
  `getMarketingCategoryMapping(19)` (agence avec 4 vrais services) peuple
  correctement `selectedCategories` à partir de ses services réels, que
  `getMarketingCategoryMapping(70)` (agence sans service) reste vide comme prévu, et
  que `setMarketingCategoryMapping` rejette bien une catégorie/sous-catégorie
  inexistante tout en acceptant celles valides. Les données de test (compte réel 19)
  modifiées par ce script de vérification ont été restaurées à leur état
  post-migration correct immédiatement après, via la même couche `storage` (pas de
  SQL manuel risqué) ; script temporaire supprimé.
- **PRINT totalement non affecté** : zéro fichier PRINT modifié dans cette tâche
  (seul `printer/categories.tsx` apparaît dans le diff global de session, modifié par
  une tâche précédente, non par celle-ci).
- **Permissions/routes existantes inchangées** : toutes les nouvelles routes
  suivent exactement les mêmes garde-fous de rôle (`requireAuth` + vérification
  `role === "MARKETING"`, `requireAdmin`) que leurs équivalents PRINT.
- **Services existants préservés** : les 4 services réels de l'agence 19 continuent de
  fonctionner sans sous-catégorie (`subCategories: []` par défaut) ; leur catégorie
  reste éditable grâce à la migration auto-réparatrice.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur (vérifié deux fois, après l'implémentation complète et
  après la correction d'un hook React Query qui omettait son `queryFn`).
- `npm run build` → succès (client 2821 modules + serveur, `dist/index.cjs` généré).
- `npm run db:push` → appliqué avec succès ; schéma post-migration inspecté
  directement en base (`\d marketing_subcategory_taxonomy`, `\d marketing_profiles`,
  `\d marketing_services`) pour confirmer les nouvelles colonnes/table et l'absence de
  perte de données.
- **Vérification fonctionnelle réelle contre la base de développement** (script `tsx`
  ad hoc, supprimé après usage) : migration auto-réparatrice, validation
  accepté/rejeté de `setMarketingCategoryMapping`, confirmés avec de vraies données —
  pas seulement une relecture de code.
- Aucun navigateur disponible dans cet environnement — pas de test de clic réel du
  nouvel onglet Catégories ni du formulaire de service. Comportement UI vérifié par
  lecture attentive du JSX (gating du Select, réinitialisation des sous-catégories au
  changement de catégorie, pré-remplissage à l'édition) et par le test fonctionnel
  serveur ci-dessus, qui couvre la logique réellement partagée entre le front et le
  back (le mapping et sa validation).

---

# Analyse — Keep Sous-compétences Filters Always Visible on Maintenance and Marketing

## 1. Audit

- **Maintenance (`pages/cafe/maintenance/maintenance-page.tsx`)** : la barre de filtres
  contenait deux affichages distincts des sous-compétences, tous deux conditionnés à
  `filterCategory` (un parent devait déjà être sélectionné) :
  1. une liste de puces en lecture seule, libellée "Sous-compétences :"
     (`data-testid="text-maintenance-subcompetencies"`), purement informative ;
  2. juste en dessous, un `Select` à sélection **unique** (`filterSubSkill: string`),
     le vrai contrôle de filtrage, masqué tant qu'aucun parent n'était choisi.
  Les deux redondaient déjà en partie (mêmes sous-compétences listées deux fois sous
  des formes différentes), et le filtre réel n'acceptait qu'une seule sous-compétence
  à la fois — alors que la tâche demande explicitement la sélection multiple et une
  visibilité permanente, y compris avant tout choix de parent.
- **Marketing (`pages/cafe/marketing/marketing-page.tsx`)** : aucune puce
  redondante trouvée, mais aucun filtre de sous-catégorie non plus — la tâche
  "Marketing Categories & Subcategories" précédente n'avait ajouté les
  sous-catégories qu'au niveau de chaque service (`service.subCategories`), sans
  encore exposer de contrôle de filtrage côté Coffee Owner. Il fallait donc
  **ajouter** le picklist, pas seulement le rendre permanent.
- **Recherche d'un pattern de multi-sélection déjà établi** dans la base de code
  (pour ne pas inventer un nouveau composant) : trouvé dans
  `pages/cafe/barista/barista-page.tsx` — un filtre "Langue" multi-sélection utilisant
  `DropdownMenu`/`DropdownMenuCheckboxItem` (bouton compact affichant le nombre
  sélectionné, ex. "Langue (2)"), state `string[]`, correspondance OR
  (`.some()`). Repris à l'identique pour les deux marketplaces, plutôt que
  d'introduire un nouveau composant de multi-sélection.
- **Différence de modèle de clé entre les deux marketplaces, identifiée avant
  d'implémenter** : les sous-compétences Maintenance sont stockées côté profil comme
  des clés qualifiées par le parent (`"<compétence>::<sous-compétence>"`, voir
  `shared/maintenance-sub-skill-key.ts` — correctif d'un vrai bug de collision de noms
  entre parents traité dans une tâche précédente), alors que les sous-catégories
  Marketing sont stockées côté service comme de simples noms (`subCategories:
  string[]`), chaque service n'ayant qu'une seule catégorie parente donc aucune
  ambiguïté possible. Conséquence directe sur l'implémentation : le filtre Maintenance
  doit continuer à manipuler des clés qualifiées ; le filtre Marketing peut filtrer
  par nom brut sans risque.

## 2. Implémentation

**Maintenance** :
- Remplacement de `filterSubSkill: string` par `filterSubSkills: string[]` (clés
  qualifiées `encodeMaintenanceSubSkillKey`).
- Nouveau `subSkillFilterOptions` (`useMemo`) : liste les sous-compétences du parent
  sélectionné si `filterCategory` est renseigné, sinon l'union de toutes les
  sous-compétences de toutes les compétences — avec désambiguïsation du libellé
  (`"Nom · Parent"`) uniquement quand un même nom existe réellement sous plusieurs
  parents (détecté via un compteur d'occurrences), pour ne jamais perdre
  l'information de parenté dans la vue "Tous".
- Filtrage (`filtered`) : `filterSubSkills.some((key) => item.subSkills?.includes(key))`
  — sémantique OR entre sous-compétences sélectionnées, comme le filtre Langue de
  Barista.
- Nouvelle fonction `selectCategory(category)` : sélectionne le parent ET ne purge
  que les sous-compétences sélectionnées qui n'appartiennent plus à ce parent
  (au lieu de l'ancien `setFilterSubSkill("")` qui vidait tout) ; si le parent est
  désélectionné ("Tous"), rien n'est purgé — toutes les sous-compétences restent
  valides dans la vue globale.
- Suppression complète du bloc de puces redondant "Sous-compétences :".
- Remplacement du `Select` conditionnel unique par un `DropdownMenu` +
  `DropdownMenuCheckboxItem` **toujours rendu** (bouton "Sous-compétences" /
  "Sous-compétences (n)"), repris du pattern Barista ci-dessus.
- `hasFilters` et le bouton Reset mis à jour pour utiliser `filterSubSkills.length > 0`
  / `setFilterSubSkills([])`.

**Marketing** :
- Nouvel état `filterSubCategories: string[]` (noms bruts, pas de clé qualifiée —
  voir l'audit ci-dessus).
- Nouveau hook `useMarketingSubCategoryTaxonomy()` (déjà créé dans la tâche
  précédente) branché ici pour la première fois côté Coffee Owner.
- Nouveau `subCategoryFilterOptions` (`useMemo`) : sous-catégories actives du
  `categoryId` correspondant à `selectedService` si renseigné, sinon toute la
  taxonomie active.
- `filteredServices` étendu : en plus du filtre `filterRating` déjà client-side
  existant, ajoute `filterSubCategories.some((name) => s.subCategories?.includes(name))`
  — même sémantique OR, même endroit (filtrage client-side sur la liste déjà
  récupérée du serveur, sans toucher à `GET /api/marketing/services` ni à son
  hook, qui continuent de ne filtrer que par catégorie/recherche/type/ville
  côté serveur comme avant).
- Nouvelle fonction `selectCategoryFilter(categoryName)` : même logique de purge
  sélective que Maintenance, mais comparant des noms bruts à l'ensemble des noms de
  sous-catégories du nouveau parent (`categoryId` résolu via la taxonomie).
- Nouveau `DropdownMenu`/`DropdownMenuCheckboxItem` ajouté à la barre de filtres,
  juste avant le `Select` "Type" — même pattern visuel que Maintenance.
- `hasFilters`/`resetFilters` étendus pour inclure `filterSubCategories`.

## 3. Garde-fous respectés

- **Aucune régression du modèle parent/enfant** : la correspondance clé-qualifiée
  Maintenance (anti-collision entre parents) n'a pas été affaiblie — au contraire,
  la vue "union de tous les parents" désambiguïse explicitement les noms en collision
  plutôt que de les fusionner silencieusement.
- **Taxonomies Maintenance et Marketing restées strictement indépendantes** : aucun
  code, type, ou donnée partagé entre les deux filtres ; chacun lit sa propre
  taxonomie Admin (`/api/maintenance/taxonomy` vs `useMarketingSubCategoryTaxonomy`).
- **Logique d'éligibilité/publication/permissions backend non touchée** : ce travail
  est entièrement client-side (filtrage sur des listes déjà renvoyées par les routes
  existantes) — aucune route serveur modifiée, aucune règle métier changée.
- **Recherche, type, disponibilité/note, ville et Reset préservés** : aucun de ces
  filtres n'a été renommé, déplacé, ni eu sa logique modifiée ; seul le filtre de
  sous-compétence/sous-catégorie et la purge au changement de parent ont changé.
- **Design/responsive/dark mode préservés** : mêmes classes `h-7 text-xs rounded-full`
  et `t.inputBg`/`t.selectContent` que tous les autres contrôles de la même barre ;
  aucun nouveau composant visuel introduit — réutilisation du `DropdownMenu` déjà
  utilisé ailleurs dans l'app pour exactement ce rôle (filtre multi-sélection
  compact).

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès (client 2821 modules + serveur, `dist/index.cjs` généré).
- Aucun navigateur disponible dans cet environnement — pas de test de clic réel.
  Comportement vérifié par lecture attentive du code : purge sélective au changement
  de parent (`selectCategory`/`selectCategoryFilter`), désambiguïsation des noms en
  collision dans la vue "Tous" côté Maintenance, sémantique OR du filtrage
  multi-sélection, et préservation de tous les filtres/boutons Reset existants.

---

# Analyse — Add Icons to Barista Compétences and Display Them in the Marketplace

## 1. Audit

- **`baristaSkills` (`shared/schema.ts`)** : contrairement à `maintenanceCompetencies`
  (qui a déjà un champ `icon` depuis une tâche antérieure), la table `barista_skills`
  n'avait **aucune** colonne icône — `id/name/isActive/isFrozen` seulement.
- **Admin → Barista → Compétences → Compétences** (`admin/barista-page.tsx`) : le
  composant `TaxonomySection` qui rend cette liste est **partagé** par trois
  taxonomies distinctes — Compétences, Niveaux d'étude et Langues — aucune des deux
  dernières n'ayant de colonne icône ni de besoin fonctionnel d'en avoir une. Ajouter
  l'icône directement et sans condition dans ce composant générique aurait fait
  apparaître un champ icône superflu sur Niveaux d'étude/Langues, hors du périmètre
  demandé ("Do not perform a global icon redesign"). Un paramètre d'activation
  (`withIcon`) était donc nécessaire pour isoler le changement à Compétences
  uniquement.
- **Persistance** : `POST/PATCH /api/admin/barista/skills` et
  `storage.createBaristaSkill`/`updateBaristaSkill` n'acceptaient aucun champ `icon` —
  confirmé en lisant les schémas zod et les signatures de `storage.ts`.
- **Coffee Owner → `/barista`** : le filtre "Compétence" existant était un `Select`
  HTML standard (liste déroulante plate), sans aucune icône ni chip — à la différence
  de `/maintenance`, qui utilise un switcher de chips "Tous" + une par compétence
  avec icône, placé dans une bande dédiée au-dessus de la barre de filtres. Il n'y
  avait donc rien à "ajouter une icône à" au sens littéral — il fallait convertir le
  contrôle existant en switcher de chips pour pouvoir y afficher des icônes,
  exactement comme le demande la tâche ("Use the existing /maintenance
  competency-filter design as the visual reference").
- **Conteneur visuel différent entre les deux marketplaces, à respecter** :
  Maintenance utilise deux bandes `sticky` pleine-largeur distinctes (chips, puis
  barre de filtres) ; Barista utilise une seule carte arrondie `sticky` contenant
  tout. La tâche demande explicitement de "Preserve the existing Barista marketplace
  design and adapt the Maintenance pattern to fit it naturally" — le switcher de
  chips a donc été inséré **à l'intérieur** de la carte existante de Barista (une
  nouvelle rangée scrollable séparée par une bordure), sans jamais remplacer sa
  structure par celle de Maintenance.
- **Recherche d'autres composants affichant les mêmes compétences** (tâche section
  5) : `barista-fast-search.tsx` et `barista-detail-modal.tsx` affichent aussi des
  compétences, mais en texte brut, sans aucune icône ni mapping codé en dur à faire
  entrer en conflit — laissés inchangés, conformément à "update additional displays
  only where necessary."

## 2. Implémentation

**Schéma** :
- `baristaSkills.icon: text("icon")` ajouté (nullable, même convention que
  `maintenanceCompetencies.icon`/`marketingCategoryTaxonomy.icon` — texte libre type
  emoji, pas une bibliothèque d'icônes). Aucune colonne existante renommée ni
  supprimée.

**Serveur** :
- `storage.createBaristaSkill(name, icon?)` / `updateBaristaSkill(id, {..., icon?})`
  (et leur déclaration dans `IStorage`) étendus, miroir exact de
  `createMaintenanceCompetency`/`updateMaintenanceCompetency` (icône optionnelle,
  `.trim() || null`, jamais écrasée si absente du payload — `data.icon !== undefined`
  avant de l'inclure dans le `.set()`).
- `POST/PATCH /api/admin/barista/skills` : `icon` ajouté aux schémas zod
  (`z.string().trim().max(8).nullable().optional()`, même borne que PRINT/Marketing/
  Maintenance). `GET /api/admin/barista/skills` et `GET /api/barista/skills` (public,
  actif seulement) renvoient l'icône automatiquement — ce sont des `SELECT *`
  implicites sur `baristaSkills`, aucun changement de requête nécessaire.
- Aucune nouvelle route, aucun nouvel événement temps réel : `barista_taxonomy_updated`
  existait déjà et `use-realtime.ts` invalidait déjà `/api/barista/skills` et
  `/api/admin/barista/skills` — les icônes se propagent via ce mécanisme existant
  sans modification.

**Client — Admin** (`admin/barista-page.tsx`) :
- `SkillItem.icon?: string | null` ajouté (optionnel, pour ne rien exiger des deux
  autres taxonomies qui partagent ce type).
- `TaxonomySection` étendu avec un prop `withIcon?: boolean` : quand actif, affiche un
  champ icône à côté du champ nom (création) et un bouton-icône cliquable par ligne
  (édition inline, Entrée/blur pour sauvegarder) — repris à l'identique du pattern
  déjà utilisé par `CategoryTaxonomy`/`TaxonomyList` dans les pages Admin PRINT/
  Marketing/Maintenance. `EducationLevelsTaxonomy`/`LanguagesTaxonomy` n'activent pas
  `withIcon` et restent donc rigoureusement inchangés.
- `SkillsTaxonomy` passe `withIcon` et relaie l'icône dans ses mutations
  create/update.
- `DEFAULT_SKILL_ICON = "☕"` : fallback affiché par le bouton-icône quand une
  compétence n'a pas encore d'icône.

**Client — Coffee Owner `/barista`** (`pages/cafe/barista/barista-page.tsx`) :
- Nouveaux tokens de thème `switcherBg`/`switcherActive`/`switcherInactive` ajoutés à
  `useTheme()` (même forme que Maintenance, recolorés en vert pour matcher
  l'identité visuelle déjà établie de la page — hero en dégradé vert/émeraude).
- `allSkills` (liste de noms) remplacé par `skillChipOptions` (`{name, icon}[]`),
  dérivé de la taxonomie Admin (`skillOptions`, déjà chargée via `useBaristaSkills()`)
  avec le même repli de bootstrap qu'avant (noms dérivés des vrais profils si la
  taxonomie Admin est entièrement vide) — jamais de mapping d'icônes codé en dur côté
  Coffee Owner.
- Nouvelle rangée de chips "Tous" + une par compétence, insérée à l'intérieur de la
  carte de filtres existante (au-dessus de la barre de filtres actuelle, séparée par
  une bordure) — mêmes classes `switcherActive`/`switcherInactive`, placement et
  espacement d'icône que Maintenance.
- Ancien `Select` "Compétence" supprimé (remplacé par le switcher — un seul contrôle
  pour ce filtre, pas deux redondants).
- `baristaSkill`/`setBaristaSkill` (state) et `filteredBaristas` (logique de
  filtrage) strictement inchangés — seul le contrôle UI qui les pilote a changé.

## 3. Garde-fous respectés

- **Aucune régression de mapping/éligibilité** : la valeur stockée dans
  `baristaSkill` reste le nom de compétence exact, comparé exactement comme avant
  (`b.skills.some(s => s.toLowerCase() === baristaSkill.toLowerCase())`, logique non
  touchée) — l'icône est un attribut d'affichage de la compétence elle-même, jamais
  du profil Barista ni d'une sélection de filtre, conformément à "The icon must
  belong to the competency itself, not to an individual Barista provider or Coffee
  Owner filter selection."
- **Aucune fuite vers Maintenance/Marketing/PRINT/Academy** : aucune de leurs
  tables, routes ou données n'a été lue, écrite ou copiée ; seul le PATTERN visuel du
  switcher de chips de Maintenance a été réutilisé (pas son code, pas ses données).
- **Rétrocompatibilité confirmée en conditions réelles** : script `tsx` ad hoc
  exécuté contre la vraie base de développement — `createBaristaSkill` avec icône,
  `updateBaristaSkill` icône seule, puis `updateBaristaSkill` nom seul (icône
  préservée), puis re-lecture via `getBaristaSkills` : les 8 compétences existantes
  (Espresso, Latte Art, Cold Brew, etc.) restent intactes avec `icon = NULL` après
  `npm run db:push`, et retombent correctement sur `DEFAULT_SKILL_ICON` côté client.
  Script temporaire supprimé après usage.
- **Niveaux d'étude/Langues non affectés** : `TaxonomySection` vérifié pour les deux
  (pas de `withIcon`, donc zéro changement visuel ou fonctionnel).

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès (client + serveur, `dist/index.cjs` généré).
- `npm run db:push` → appliqué avec succès ; schéma post-migration inspecté
  directement en base (`\d barista_skills`) et les 8 lignes existantes confirmées
  intactes (`icon` à `NULL`, aucune autre colonne modifiée).
- **Vérification fonctionnelle réelle contre la base de développement** (script
  `tsx` ad hoc, supprimé après usage) : création avec icône, mise à jour de l'icône
  seule, mise à jour du nom seul (icône préservée), re-lecture via
  `getBaristaSkills()` — tous les résultats confirmés corrects avec de vraies
  données, pas seulement par relecture de code.
- Aucun navigateur disponible dans cet environnement — pas de test de clic réel du
  nouveau switcher de chips ni du champ icône Admin. Comportement vérifié par lecture
  attentive du JSX (classes de thème, repli d'icône, non-régression des filtres
  Niveau/Disponibilité/Ville/Niveau d'étude/Langue) et par le test fonctionnel
  serveur ci-dessus.

---

# Analyse — Remove Background from Barista Marketplace Filters

## 1. Audit

- **Référence** : `/maintenance`, `/print` et `/marketing` partagent toutes le même
  jeton de thème `stripBg` (`bg-gray-900/95`/`bg-white`, commentaire d'origine
  pointant vers `browse-products.tsx`) appliqué à deux bandes `border-b` pleine
  largeur (chips, puis contrôles), sans coins arrondis ni ombre — un style "à plat",
  fondu dans la page.
- **`/barista`** (modifié dans la tâche précédente, "Add Icons to Barista
  Compétences") : le switcher de chips + la barre de contrôles avaient été insérés
  dans le conteneur `sticky` **existant** de la page, qui utilise `${t.cardBg}` +
  `shadow-sm` + `rounded-2xl` + `border` — un style "carte flottante" avec fond plein
  et ombre, visuellement différent des trois pages de référence. C'est exactement ce
  que ce correctif cible.
- Confirmé que `t.cardBg` (`bg-gray-800 border-gray-700/60` / `bg-white
  border-gray-100`) combine une couleur de fond ET une couleur de bordure dans un
  seul jeton, et que `t.border` (`border-gray-700/60` / `border-gray-100`) porte déjà
  exactement la même couleur de bordure, sans le fond — un remplacement direct et
  sûr.

## 2. Implémentation

- Dans `pages/cafe/barista/barista-page.tsx`, le conteneur englobant le switcher de
  chips **et** la barre de filtres (`select-barista-level`, `-availability`,
  `-location`, `-education`, `-language`) :
  `className={\`sticky top-14 z-30 border rounded-2xl p-3 mb-5 shadow-sm ${t.cardBg}\`}`
  →
  `className={\`sticky top-14 z-30 border rounded-2xl p-3 mb-5 ${t.border}\`}`.
  Suppression du fond coloré (`t.cardBg`'s `bg-*`) et de l'ombre portée
  (`shadow-sm`) ; conservation de la bordure (recolorée via `t.border`, même
  teinte), des coins arrondis, du padding, de la marge et du comportement `sticky`
  — aucune restructuration du DOM, aucun déplacement hors de son conteneur
  `max-w-7xl` actuel.
- Les puces individuelles (`t.switcherBg`/`switcherActive`/`switcherInactive`) et les
  déclencheurs de `Select`/`DropdownMenu` (`t.inputBg`) gardent leur propre fond —
  seul le fond du panneau englobant a été retiré, conformément à "Do not remove the
  background of individual chips."

## 3. Garde-fous respectés

- **Pages de référence non touchées** : aucun fichier `/maintenance`, `/print` ou
  `/marketing` modifié — vérifié par `git diff --stat` ciblé.
- **Logique de filtrage, états sélectionnés, Reset, recherche** : strictement
  inchangés — seule une classe CSS a été remplacée sur un seul conteneur ; aucun
  state, handler, ou donnée touché.
- **Dark mode préservé** : `t.border` fournit déjà la bonne couleur dans les deux
  modes (c'est la même valeur que la partie bordure de `t.cardBg`).

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès.
- `git diff --stat` → un seul fichier modifié (`barista-page.tsx`), confirmant la
  portée minimale de ce correctif.
- Aucun navigateur disponible dans cet environnement — pas de capture d'écran
  réelle ; changement vérifié par lecture directe de la classe CSS modifiée et
  comparaison avec les jetons de thème des trois pages de référence.

---

# Analyse — Reduce Subcategory Picklist Scroller Height

## 1. Audit

- `DropdownMenuContent` (`components/ui/dropdown-menu.tsx`, composant shadcn
  partagé) porte déjà en dur
  `max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto` —
  c'est-à-dire que la liste défile déjà, mais sa hauteur maximale s'étend jusqu'au
  bord disponible du viewport plutôt que d'être compacte, d'où l'aspect "trop haut"
  signalé pour Sous-compétences (Maintenance) et Sous-catégories (Marketing) dès
  qu'il y a assez d'options.
- `cn()` (`lib/utils.ts`) utilise `tailwind-merge`, donc une classe `max-h-*` passée
  en `className` à `DropdownMenuContent` écrase proprement celle du composant de
  base — un correctif ciblé via `className`, sans toucher au composant partagé
  (qui reste inchangé pour tous ses autres usages dans l'app, dont le filtre
  "Langue" de Barista, volontairement hors périmètre de cette tâche).

## 2. Implémentation

- `pages/cafe/maintenance/maintenance-page.tsx` et
  `pages/cafe/marketing/marketing-page.tsx` : sur le `DropdownMenuContent` du
  picklist Sous-compétences/Sous-catégories respectivement,
  `className={t.selectContent}` → `className={\`${t.selectContent} max-h-56
  overflow-y-auto\`}` (14rem / 224px, assez pour ~6-7 lignes visibles avant
  défilement). Aucun autre changement — déclencheur, logique de bascule
  (`toggleSubSkill`/`toggleSubCategoryFilter`), options affichées, et filtrage par
  catégorie parente restent strictement identiques.

## 3. Garde-fous respectés

- **Composant partagé `DropdownMenuContent` non modifié** : tous ses autres usages
  dans l'app (menus Admin, filtre Langue de Barista, etc.) gardent leur hauteur
  maximale par défaut.
- **Aucune option retirée ni masquée** : la liste reste défilable en interne
  (`overflow-y-auto`), toutes les options restent atteignables par scroll.
- **Sélection multiple, coches, Reset, filtrage catégorie→sous-catégorie** :
  aucun state ni handler touché — uniquement une classe CSS de hauteur.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès.
- `git status` → seuls les deux fichiers concernés modifiés.
- Aucun navigateur disponible dans cet environnement — pas de test de défilement
  réel ; changement vérifié par lecture de la classe CSS et confirmation que
  `tailwind-merge` résout correctement le conflit `max-h-*` avec la classe de base
  du composant partagé.

---

# Analyse — Compact Dropdown Scrollbar (Sous-compétences / Sous-catégories)

## 1. Audit

- Ajustement ciblé en complément direct de la tâche précédente (hauteur du
  picklist) — même portée exacte : les deux mêmes `DropdownMenuContent`
  (Sous-compétences Maintenance, Sous-catégories Marketing), rien d'autre.
- **Convention de "scrollbar fine" déjà établie ailleurs dans l'app**, trouvée dans
  plusieurs modales (ex. `marketing-service-detail-modal.tsx`'s `DialogContent`) :
  `[&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent
  [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-700
  hover:[&::-webkit-scrollbar-thumb]:bg-gray-600` — un gris neutre qui fonctionne déjà
  tel quel en light ET dark mode dans ces modales (pas de variante `dark:`
  nécessaire), repris à l'identique plutôt que d'inventer une nouvelle palette.
- **Lacune Firefox identifiée** : les sélecteurs `::-webkit-scrollbar` ne
  fonctionnent que sur les navigateurs à moteur Chromium/WebKit ; Firefox n'a pas
  d'équivalent pseudo-élément mais supporte nativement la propriété CSS
  `scrollbar-width`. Un seul précédent trouvé dans la base de code
  (`marketplace-layout.tsx`'s `[scrollbar-width:none]`, pour masquer complètement
  des bandeaux de navigation horizontaux) utilisant la même syntaxe Tailwind à
  crochets — réutilisée ici avec la valeur `thin` (visible mais fine) plutôt que
  `none` (masquée), puisque la demande est de rendre la barre discrète, pas de la
  cacher.

## 2. Implémentation

- Sur les deux mêmes `DropdownMenuContent` modifiés dans la tâche précédente,
  ajout de `[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1
  [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full
  [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600`
  à la classe existante (`${t.selectContent} max-h-56 overflow-y-auto`) — la hauteur
  compacte de la tâche précédente et la finesse de la barre de défilement de
  celle-ci coexistent dans la même classe, sans conflit (deux propriétés CSS
  distinctes : `max-height`/`overflow` d'un côté, l'apparence du scrollbar de
  l'autre).

## 3. Garde-fous respectés

- **Aucun autre composant affecté** : les classes `[&::-webkit-scrollbar]:*` et
  `[scrollbar-width:thin]` sont passées en `className` sur ces deux instances
  précises de `DropdownMenuContent`, jamais sur le composant partagé
  `components/ui/dropdown-menu.tsx` lui-même — tous ses autres usages (menus Admin,
  filtre Langue de Barista) gardent leur scrollbar par défaut du navigateur.
- **Sélection multiple, filtrage, Reset** : aucun state ni handler touché —
  uniquement des classes CSS d'apparence de scrollbar.
- **Dark/light mode** : couleur de gris reprise telle quelle du précédent déjà
  éprouvé dans les deux modes, pas de nouvelle variante introduite.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès.
- `git status` → seuls les deux fichiers concernés modifiés (confirmé après coup).
- Aucun navigateur disponible dans cet environnement — pas de capture visuelle
  réelle de la barre de défilement ; changement vérifié par lecture directe des
  classes et comparaison avec le précédent déjà utilisé ailleurs dans l'app.

---

# Analyse — Remove Visible Scrollbars from Maintenance and Marketing Picklists

## 1. Audit

- **Référence inspectée en premier** : `/products` (`pages/cafe/browse-products.tsx`)
  → filtre "All Sub-Categories" (ligne ~830-838). Découverte clé : ce filtre est un
  `Select` Radix **standard** (mono-sélection), pas un `DropdownMenu` — or Radix
  `Select` gère le défilement de sa liste d'options via son propre mécanisme interne
  (boutons `SelectScrollUpButton`/`SelectScrollDownButton`), fondamentalement
  différent de celui d'un `DropdownMenu`/`DropdownMenuContent` (un `div` natif
  `overflow-y-auto` classique, qui affiche donc la vraie barre de défilement du
  navigateur). Les deux composants Radix ne partagent pas la même architecture de
  scroll — il n'existe pas une seule classe CSS "copiable telle quelle" entre les
  deux.
  Conséquence : impossible de reproduire le comportement de `/products` à
  l'identique en gardant `DropdownMenu` (nécessaire pour la multi-sélection à
  cases à cocher, que `Select` ne supporte pas) — l'objectif concret est donc de
  reproduire le RÉSULTAT (aucune barre visible, défilement toujours possible), pas
  le mécanisme interne exact.
- **Technique déjà établie et réutilisable trouvée dans la même barre de filtres**,
  à l'identique dans les deux pages : la rangée de chips juste au-dessus du
  picklist (switcher de compétences/catégories parentes) utilise déjà
  `[&::-webkit-scrollbar]:hidden` (classe, Chrome/Safari/Edge) +
  `style={{ scrollbarWidth: "none" }}` (Firefox) sur son propre conteneur
  `overflow-x-auto` — la combinaison cross-browser standard pour masquer une barre
  de défilement native tout en préservant molette/tactile/trackpad. Réutilisée ici
  verbatim, appliquée au défilement vertical du picklist au lieu
  du défilement horizontal des chips.
- Vérifié que `DropdownMenuContent` relaie `style`/`className` arbitraires via son
  spread `{...props}` (`components/ui/dropdown-menu.tsx`) — aucune modification du
  composant partagé nécessaire.

## 2. Implémentation

- Sur les deux mêmes `DropdownMenuContent` (Sous-compétences Maintenance,
  Sous-catégories Marketing), remplacement des classes de barre de défilement
  "fine" ajoutées à la tâche précédente par :
  `className={\`${t.selectContent} max-h-56 overflow-y-auto [&::-webkit-scrollbar]:hidden\`}`
  `style={{ scrollbarWidth: "none" }}`
  — la hauteur compacte (`max-h-56 overflow-y-auto`) de la tâche d'avant reste
  inchangée ; seule l'apparence de la barre change (masquée au lieu de fine).

## 3. Garde-fous respectés

- **`/products` non modifié** : uniquement inspecté comme référence, aucun fichier
  touché.
- **Composant partagé non modifié** : `components/ui/dropdown-menu.tsx` intact ;
  tous ses autres usages (Admin, filtre Langue Barista) gardent leur barre de
  défilement par défaut.
- **Défilement toujours fonctionnel** : `overflow-y-auto` reste actif — seule
  l'apparence visuelle de la barre est masquée (molette, tactile, trackpad, flèches
  clavier continuent de fonctionner nativement).
- **Sélection multiple, cases à cocher, filtrage parent→enfant, Reset** : aucun
  state ni handler touché.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès.
- `git status` → seuls les deux fichiers concernés modifiés.
- Aucun navigateur disponible dans cet environnement — pas de test de défilement
  réel ; changement vérifié par lecture directe des classes et par la présence
  confirmée de la même combinaison exacte (`[&::-webkit-scrollbar]:hidden` +
  `scrollbarWidth: "none"`) sur la rangée de chips immédiatement adjacente dans
  chacune des deux pages, qui sert de précédent prouvé dans ce même contexte visuel.
