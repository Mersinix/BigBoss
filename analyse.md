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

---

# Analyse — Match Barista Filter Section Layout and Styling

## 1. Audit

- **Structure exacte de référence relue sur `/maintenance` ET `/marketing`**
  (confirmée identique mot pour mot entre les deux) :
  ```
  </section>  (hero)
  {comingSoon ? ... : (<>
    {pending notice éventuel}
    <div className="sticky top-14 z-30">
      <div className={`border-b ${t.stripBg}`}>
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1.5 overflow-x-auto py-3" style={...}>{chips}</div>
        </div>
      </div>
      <div className={`border-b py-2 px-4 ${t.stripBg}`}>
        <div className="max-w-7xl mx-auto flex items-center gap-2 ..." style={...}>{contrôles}</div>
      </div>
    </div>
    <div className="max-w-7xl mx-auto px-4 py-8"><section>{grille}</section></div>
  </>)}
  ```
  Le bloc de filtres est un **frère** du conteneur `max-w-7xl` de contenu, placé
  juste après la notice "en attente" et AVANT lui — jamais imbriqué dedans. Chaque
  bande porte son propre fond `t.stripBg` plein format (pas de coins arrondis, pas
  d'ombre, pas de marge) et sa propre bordure basse `border-b` ; c'est cette
  bordure basse de la première bande qui sépare visuellement les deux, pas une
  bordure interne.
- **`/barista` (état avant cette tâche)** : le bloc de filtres (chips + contrôles)
  était imbriqué **à l'intérieur** du conteneur `<div className="max-w-7xl mx-auto
  px-4 py-8"><section>`, dans une carte unique `rounded-2xl p-3 mb-5` avec bordure
  tout autour — largeur, hauteur, position et fond tous différents de la référence,
  pas seulement la largeur. C'est exactement l'écart que cette tâche corrige : les
  tâches précédentes ("Add Icons…", "Remove Background…") avaient déjà rapproché
  l'apparence des puces/contrôles individuellement, mais jamais restructuré le
  conteneur englobant lui-même.
- `t.stripBg` n'existait pas dans le thème de `/barista` — valeur identique copiée
  de `/maintenance`/`/marketing` (`bg-gray-900/95 border-gray-800` /
  `bg-white border-gray-100`).

## 2. Implémentation

- `pages/cafe/barista/barista-page.tsx` :
  - Ajout du jeton `stripBg` à `useTheme()` (valeur identique aux deux pages de
    référence).
  - Le bloc de filtres a été **déplacé** hors du conteneur `max-w-7xl mx-auto px-4
    py-8` existant, repositionné comme frère juste après la notice "en attente",
    et **restructuré** en deux bandes `sticky top-14 z-30` séparées (`border-b
    ${t.stripBg}` pour les puces, `border-b py-2 px-4 ${t.stripBg}` pour les
    contrôles), chacune avec son propre conteneur interne `max-w-7xl mx-auto
    px-4`/`max-w-7xl mx-auto flex ...` — classes et imbrication reprises à
    l'identique de `/maintenance`.
  - Le conteneur `<div className="max-w-7xl mx-auto px-4 py-8"><section>` a été
    **réouvert** immédiatement après, ne contenant plus désormais que la grille/les
    états de chargement/erreur/vide des baristas.
  - Tout le contenu interne (puces de compétences avec icônes, recherche, Select
    Niveau/Disponibilité/Ville/Niveau d'étude, `DropdownMenu` Langue, bouton Reset)
    a été déplacé tel quel, sans aucune modification de ses props, handlers,
    data-testid ou logique — seule l'imbrication des `<div>` englobants a changé.

## 3. Garde-fous respectés

- **`/maintenance` et `/marketing` non modifiés** : utilisés uniquement comme
  référence de lecture ; confirmé par `git status` (seul `barista-page.tsx`
  apparaît dans le diff de cette tâche).
- **Aucune logique de filtrage, state, handler ou route touchée** : `baristaSkill`,
  `baristaSearch`, `baristaLevel`, etc., et leurs setters sont restés strictement
  identiques ; seule la structure JSX englobante (quels `<div>` contiennent quoi)
  a changé.
- **Puces individuelles, icônes, états sélectionnés préservés** : `switcherBg`/
  `switcherActive`/`switcherInactive`, icônes des compétences, et tous les
  `data-testid` existants conservés mot pour mot.
- **Dark mode** : `t.stripBg` reprend la même paire de valeurs déjà éprouvée dans
  les deux modes sur les pages de référence.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur (y compris après correction d'un déséquilibre de
  balises JSX provoqué par le déplacement initial du bloc, détecté par le
  compilateur et corrigé avant de continuer).
- `npm run build` → succès.
- `git status` / `git diff --stat` → seul `client/src/pages/cafe/barista/
  barista-page.tsx` modifié (28 insertions, 21 suppressions) ; aucun autre fichier
  touché par cette tâche.
- Aucun navigateur disponible dans cet environnement — pas de capture visuelle
  réelle ; correspondance de structure vérifiée par relecture ligne à ligne des
  trois fichiers (imbrication des `<div>`, classes, ordre des éléments) plutôt
  que par un rendu réel.

---

# Analyse — Academy Filter Design + Print Search Input

## Tâche 1 : Appliquer le même design de filtres à `/academy`

### 1. Audit

- `pages/cafe/barista/barista-academy-page.tsx` avait **exactement** le même écart
  que `/barista` avant la tâche précédente : bloc de filtres imbriqué dans
  `<div className="max-w-7xl mx-auto px-4 py-8"><section>`, dans une carte unique
  `sticky top-14 z-30 border rounded-2xl p-3 mb-5 shadow-sm ${t.cardBg}`.
- Différence structurelle à respecter : Academy n'a **qu'une seule rangée** de
  filtres (recherche + Niveau + Certification + Reset) — aucun switcher de
  catégories parentes comme Maintenance/Marketing/Barista. La référence à
  reproduire est donc la forme à **une seule bande** (`border-b py-2 px-4
  ${t.stripBg}`), identique à la seconde bande ("contrôles") de ces pages, pas
  les deux.
- `t.stripBg` absent du thème d'Academy — ajouté avec la même valeur exacte que
  `/barista`/`/maintenance`/`/marketing`.

### 2. Implémentation

- Ajout de `stripBg` à `useTheme()`.
- Bloc de filtres déplacé hors du conteneur `max-w-7xl` existant, repositionné
  comme frère juste après la notice "en attente", restructuré en une bande
  unique `sticky top-14 z-30` + `border-b py-2 px-4 ${t.stripBg}` +
  `max-w-7xl mx-auto flex ...` — même classes que la bande "contrôles" des pages
  de référence. Le conteneur `max-w-7xl mx-auto px-4 py-8` a été réouvert
  immédiatement après pour la section "Académies" (Store) et la grille de
  formations, qui restent inchangées.
- Tout le contenu interne (recherche, Select Niveau/Certification, Reset) déplacé
  tel quel — aucune prop, handler, state ou data-testid modifié.

### 3. Garde-fous respectés

- `/barista`, `/maintenance`, `/marketing` non modifiés (utilisés en lecture
  seule comme référence).
- Aucune logique de filtrage/state/route touchée.

## Tâche 2 : Ajouter un champ de recherche à `/print`

### 1. Audit

- **Comportement de recherche de référence inspecté sur `/academy`** : état
  `trainingSearch` (texte libre), transmis à `useAcademyCourses({ search:
  trainingSearch || undefined, ... })`, qui l'envoie en paramètre de requête à
  `GET /api/academy/courses`. Côté serveur, `storage.getPublishedAcademyCourses`
  normalise par `.trim().toLowerCase()` puis fait un `.includes()` sur un
  "haystack" `[titre, description, nom académie, catégorie].join(" ")` — une
  correspondance par sous-chaîne, sans distinction majuscule/minuscule, mise à
  jour à chaque frappe (la clé de requête React Query inclut le texte de
  recherche, donc chaque frappe relance l'appel).
- **État de `/print` avant cette tâche** : une logique de recherche existait
  déjà — `initialSearch` lu une seule fois depuis le paramètre d'URL `?q=`, puis
  filtrage **client-side** sur `cards` déjà chargées (`name`/`description`/
  `category`/`subCategory`/`printerName`, même convention `.toLowerCase()
  .includes()`) — mais **aucun champ de saisie visible** n'existait pour éditer
  ce texte ; seule une navigation avec `?q=...` dans l'URL (ex. depuis Fast
  Search) pouvait le renseigner. C'est exactement l'écart que cette tâche
  comble : ajouter le champ, pas réinventer la logique de correspondance (déjà
  identique en substance à celle d'Academy).
- **Piège identifié avant d'implémenter** : le switcher de catégories de
  `/print` (`PrintCategoryStrip.onSelect`) appelle déjà `resetFilters()` puis
  réinjecte volontairement `searchQuery` dans la nouvelle URL — c'est-à-dire que
  changer de catégorie doit **préserver** la recherche, jamais la vider. Si le
  nouveau bouton "Reset" (qui doit, lui, vider la recherche comme sur Academy)
  avait réutilisé cette même fonction `resetFilters`, les deux comportements
  opposés se seraient annulés. Résolu en gardant `resetFilters` strictement
  inchangée (ne vide que les 4 filtres de facette) et en ajoutant une nouvelle
  fonction `resetAll` (= `resetFilters()` + vider la recherche), utilisée
  uniquement par le bouton Reset de `PrintFilterBar`.

### 2. Implémentation

- `PrintFilterBar` (composant existant, inchangé dans sa structure générale) :
  nouveaux props `search`/`onSearchChange` ; nouveau champ de recherche ajouté en
  premier élément de la bande, repris à l'identique du champ de recherche
  d'Academy (bouton icône repliable sur mobile, `searchOpen`/`searchInputRef`
  **locaux** à ce composant — exactement le même découpage logique qu'Academy,
  qui garde aussi son état d'ouverture mobile local). Garde `if
  (!subCategories.length && !printers.length && !materials.length) return null`
  remplacée par `if (!cards.length) return null` pour que la recherche reste
  disponible même quand aucune autre facette n'existe. `hasActive` étendu pour
  inclure `!!search`.
- `PrintPage` : nouvel état `printSearch` (initialisé depuis `?q=` pour
  préserver les liens profonds existants) ; `searchQuery` dérivé de
  `printSearch.trim().toLowerCase()` au lieu de `initialSearch` figé ; nouvelle
  fonction `resetAll` ; bouton "Effacer les filtres" (état vide) étendu pour
  vider aussi `printSearch`.

### 3. Garde-fous respectés

- **Aucun nouvel endpoint ni changement de base de données** : la recherche
  reste un filtrage client-side sur les `cards` déjà chargées via la route
  existante — rien côté serveur n'a été touché.
- **`/academy` non modifié** : utilisé uniquement comme référence de
  comportement.
- **Recherche de Print uniquement** : le haystack reste
  `name`/`description`/`category`/`subCategory`/`printerName` du catalogue
  PRINT ; aucune donnée Academy lue ni mélangée.
- **Compatibilité avec les filtres existants préservée** : recherche + catégorie
  + sous-catégorie + société + matière + délai continuent de se combiner dans
  le même `useMemo` (`AND` entre tous les critères actifs, inchangé) ; changer
  de catégorie continue de préserver la recherche (comportement intentionnel
  existant, non régressé grâce à la séparation `resetFilters`/`resetAll`).

### 4. Tests exécutés (pour les deux tâches)

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès.
- `git status`/`git diff --stat` → seuls `barista-academy-page.tsx` et
  `print-page.tsx` modifiés par cette tâche (plus `barista-page.tsx`, déjà
  modifié par la tâche précédente et toujours non committé).
- Aucun navigateur disponible dans cet environnement — pas de test de frappe
  réel ; comportement vérifié par lecture directe de la logique de matching
  serveur d'Academy, comparaison avec la logique client-side déjà existante de
  Print, et relecture de la séquence `resetFilters`/`resetAll`/sélection de
  catégorie pour confirmer l'absence de conflit entre "préserver la recherche au
  changement de catégorie" et "vider la recherche au Reset".

---

# Analyse — Move SHOP Search Input into the Products Filter Section

## 1. Audit

- **Recherche produits actuelle localisée dans `marketplace-layout.tsx`** (la
  navbar globale, PAS dans `browse-products.tsx` lui-même) : un `<form
  onSubmit={handleSearch}>` avec son propre state local `search`/`setSearch`,
  **masqué sur mobile** (`hidden sm:block`), qui ne déclenche la recherche qu'au
  **submit** (Entrée) — `handleSearch` navigue vers `/products?q=...` (ou
  `/print?q=...` selon `isOnPrint`). Donc : pas de mise à jour immédiate à la
  frappe, et **cette même boîte est partagée entre `/products` et `/print`**.
- **Important** : `browse-products.tsx` avait déjà sa **propre** logique de
  correspondance déjà réactive — `search` (state local à cette page, state
  **distinct** de celui de la navbar malgré le même nom), synchronisé en continu
  depuis le paramètre d'URL `?q=` via un `useEffect` qui réagit à `searchStr`,
  et consommé directement par `categoryFiltered`/`filtered`
  (`.toLowerCase().includes()` sur nom+description). C'est exactement la
  correspondance d'Academy (même normalisation), déjà en place — il manquait
  seulement un champ de saisie **direct**, in situ, qui écrit dans ce state
  sans passer par un submit de formulaire ni un aller-retour d'URL.
- **Piège identifié avant d'implémenter** : la boîte de la navbar est
  **partagée** avec `/print` (`isOnPrint ? /print?q=... : /products?q=...`).
  La supprimer purement et simplement aurait cassé la recherche-depuis-la-navbar
  de `/print` et toute utilisation "sauter vers /products avec une recherche"
  depuis une autre page — hors du périmètre de cette tâche ("Do not modify
  unrelated navbar elements or change the layout of other pages"). Résolu en
  masquant ce formulaire **seulement** quand `location === "/products"`
  (la page qui a désormais son propre champ) ; partout ailleurs (y compris
  `/print` et le saut depuis n'importe quelle autre page), il reste identique.
- Même piège "changement de catégorie doit préserver la recherche, Reset doit la
  vider" déjà rencontré sur `/print` — `CategoryStrip.onSelect` de
  `browse-products.tsx` réinjecte déjà volontairement `search` dans la nouvelle
  URL au changement de catégorie.

## 2. Implémentation

- `components/cafe/marketplace-layout.tsx` : nouvelle variable `isOnProducts =
  location === "/products"` ; le `<form>` de recherche navbar est maintenant
  conditionné par `{!isOnProducts && (...)}` — strictement inchangé dans tout
  son contenu/comportement, simplement non rendu sur `/products`.
- `pages/cafe/browse-products.tsx` :
  - `FilterBar` (déjà la bande `border-b ${t.filterBg} py-2 px-4` existante)
    reçoit deux nouveaux props `search`/`onSearchChange` ; nouveau champ de
    recherche ajouté en premier élément, repris à l'identique du champ
    d'Academy/Print (bouton icône repliable sur mobile, `searchOpen`/
    `searchInputRef` **locaux** à ce composant). Garde `if
    (!subCategories.length && !brands.length && !flavors.length &&
    !sizes.length) return null` remplacée par `if (!categoryProducts.length)
    return null` pour que la recherche reste disponible même sans facette.
    `hasActive` étendu pour inclure `!!search`.
  - Nouveau token `inputBg` ajouté à `useTheme()` (valeur identique à Academy/
    Print/Maintenance/Marketing/Barista — absent jusqu'ici dans ce fichier).
  - Nouvelle fonction `resetAll` (= `resetFilters()` + `setSearch("")`),
    utilisée uniquement par le bouton Reset de `FilterBar` ; `resetFilters`
    elle-même strictement inchangée (toujours utilisée seule par
    `CategoryStrip.onSelect`, qui doit continuer à préserver la recherche).
  - `setSearch`/`search` (state déjà existant, déjà branché sur
    `categoryFiltered`/`filtered`) simplement réutilisés tels quels — aucune
    nouvelle logique de correspondance introduite.

## 3. Garde-fous respectés

- **Un seul champ de recherche produit visible à la fois** : masqué dans la
  navbar uniquement sur `/products`, ajouté une seule fois dans `FilterBar`.
- **`/print` et le reste de la navbar non affectés** : `isOnPrint`/
  `handleSearch` inchangés ; la boîte navbar continue de fonctionner à
  l'identique sur `/print` et sur toute autre page.
- **Aucune route, API, donnée, ni logique métier touchée** : recherche toujours
  filtrée client-side sur les données déjà chargées (`/api/marketplace`) ;
  tri, pagination, variantes, prix, panier, visibilité par rôle — aucun de ces
  éléments n'a été modifié, la state `search` existante alimentait déjà
  exactement les mêmes `useMemo` qu'avant.
- **Compatibilité avec les filtres existants préservée** : recherche +
  catégorie + sous-catégorie + marque + saveur + taille + tri continuent de se
  combiner dans les mêmes `useMemo` (`categoryFiltered` → `filtered`,
  inchangés) ; changer de catégorie continue de préserver la recherche
  (comportement intentionnel existant, non régressé grâce à
  `resetFilters`/`resetAll`).

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès.
- `git status`/`git diff --stat` → seuls `marketplace-layout.tsx` et
  `browse-products.tsx` modifiés par cette tâche.
- Aucun navigateur disponible dans cet environnement — pas de test de frappe ou
  de clic réel ; comportement vérifié par lecture directe du state `search`
  déjà existant (confirmé déjà branché sur le filtrage réactif avant cette
  tâche), de la condition `isOnProducts` dans la navbar, et de la séquence
  `resetFilters`/`resetAll`/sélection de catégorie pour confirmer l'absence de
  régression sur `/print` ou sur le comportement de recherche-depuis-une-autre-page.

---

# Analyse — Extend SHOP Search to Products, Stores, and Packs

## 1. Audit

- **Constat central** : `StoresSection` et `PacksSection` (toutes deux déjà
  existantes dans `browse-products.tsx`, chacune avec son propre `useMemo` de
  filtrage par `categoryId`/`filters.subCategoryId`/`filters.brandId`) étaient
  **entièrement masquées** dès qu'une recherche était active —
  `{!search.trim() && (<StoresSection .../>)}` / `{!search.trim() && (<PacksSection
  .../>)}`. Ce n'est pas un filtrage par la recherche : c'est une disparition
  pure et simple des deux sections. C'est exactement le symptôme décrit par la
  tâche ("the search primarily filters products").
- **Champs réellement disponibles inspectés** (pas de champ inventé) :
  - `StoreCard` (`shared/schema.ts`) : `name`, `description` — pas de
    `supplierName` sur ce type côté Coffee Owner (seulement sur
    `StoreAdminRow`, réservé à l'Admin) ; recherche donc limitée aux deux
    champs réellement présents.
  - `PackDetail` : `name`, `description` (via `Pack`), **`supplierName`**
    (bien présent sur ce type-ci), et `items: PackItemDetail[]` dont chaque
    élément a `productName` — exactement les "produits inclus" mentionnés par
    la tâche.
- Les deux composants recevaient déjà `categoryId`/`filters` en props et
  calculaient leur propre liste filtrée localement — le point d'intégration le
  plus cohérent pour la recherche est donc d'ajouter un prop `search` à chacun
  et de l'inclure dans leur `useMemo` existant, au même niveau que les autres
  conditions (combinaison `AND`), plutôt que de dupliquer une logique de
  correspondance au niveau de la page.
- **Sources de données non touchées** : `stores`/`packs` proviennent des mêmes
  `useQuery` qu'avant (non modifiées) — déjà scopées côté serveur aux éléments
  visibles/approuvés ; la recherche n'ajoute qu'un prédicat client
  supplémentaire sur des données déjà autorisées, donc aucun risque
  d'exposition de données non publiées.

## 2. Implémentation

- `StoresSection` : nouveau prop `search: string` ; `filteredStores` étend sa
  condition avec `s.name.toLowerCase().includes(q) || (s.description ??
  "").toLowerCase().includes(q)` quand `search.trim()` est non vide — ajoutée
  en AND avec les filtres catégorie/sous-catégorie/marque déjà existants.
- `PacksSection` : nouveau prop `search: string` ; `filteredPacks` étend sa
  condition avec correspondance sur `name`, `description`, `supplierName`, et
  `items.some(item => item.productName...)` — même logique AND.
- Dans le composant principal : suppression du `{!search.trim() && (...)}` qui
  masquait les deux sections ; elles sont maintenant toujours rendues et se
  gèrent elles-mêmes via leur garde existante (`if (!filteredStores.length)
  return null` / `if (!filteredPacks.length) return null`) — comportement
  identique à avant quand la recherche est vide, filtré par la recherche en
  plus quand elle ne l'est pas.
- Aucun changement à `FilterBar`, au champ de recherche lui-même, à sa
  position, son design, ou à la logique de correspondance des Produits
  (`categoryFiltered`/`filtered`, déjà existante et inchangée).

## 3. Garde-fous respectés

- **Aucune nouvelle route, endpoint, ni changement de base de données** :
  uniquement un prédicat client-side supplémentaire sur des données déjà
  chargées par les requêtes existantes.
- **Visibilité/autorisation préservées** : `stores`/`packs` toujours issues des
  mêmes `useQuery` non modifiées — aucune donnée non publiée/non autorisée
  n'est exposée, la recherche ne fait que réduire un ensemble déjà filtré côté
  serveur.
- **Filtres spécifiques aux produits non appliqués à tort** : les filtres
  catégorie/sous-catégorie/marque restent ceux déjà utilisés par chaque
  section (déjà pertinents pour elles avant cette tâche) ; aucun nouveau
  filtre "produit uniquement" n'a été introduit sur Stores/Packs.
- **Design et position du champ de recherche strictement inchangés** : aucune
  modification de `FilterBar`, de son `Input`, ni de `marketplace-layout.tsx`
  dans cette tâche.
- **Panier, variantes, prix, pagination, tri, détails produit/store/pack** :
  aucun de ces éléments n'a été touché.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès.
- `git status`/`git diff --stat` → seul `browse-products.tsx` modifié par cette
  tâche.
- Aucun navigateur disponible dans cet environnement — pas de test de frappe
  réel ; comportement vérifié par lecture directe des types `StoreCard`/
  `PackDetail`/`PackItemDetail` (confirmant les champs réellement disponibles
  avant de les utiliser) et de la nouvelle logique de filtrage dans les deux
  `useMemo`, ainsi que par confirmation que `stores`/`packs` restent issues des
  mêmes requêtes serveur non modifiées.

---

# Analyse — Unify Service and Store Search + Remove Navbar Search Inputs

## Tâche 1 : Retirer la recherche de la navbar sur 5 pages

### 1. Audit

- Vérifié au préalable que chacune des cinq pages cibles a **déjà** son propre
  champ de recherche fonctionnel dans sa section de filtres :
  `input-maintenance-search`, `input-barista-search`, `input-training-search`
  (Academy), `input-print-search`, `input-provider-search` (Marketing) — tous
  déjà construits lors de tâches précédentes de cette session.
- La boîte de recherche de la navbar (`marketplace-layout.tsx`) est un
  `<form>` **unique et partagé**, dont le submit (`handleSearch`) ne navigue
  jamais que vers `/print?q=...` ou `/products?q=...` selon `isOnPrint` — sur
  `/maintenance`, `/barista`, `/academy` et `/marketing`, elle ne faisait déjà
  rien de pertinent (elle aurait redirigé l'utilisateur vers `/products`).

### 2. Implémentation

- Nouvelle variable `hideNavbarSearch = isOnProducts || isOnPrint ||
  ["/maintenance", "/barista", "/academy", "/marketing"].includes(location)` ;
  le `<form>` est maintenant conditionné par `{!hideNavbarSearch && (...)}`.
  Contenu du formulaire, `handleSearch`, `isOnPrint` et tout le reste de la
  navbar strictement inchangés.

### 3. Garde-fous respectés

- La boîte reste visible et fonctionnelle sur **toute autre page** (accueil,
  panier, etc.), y compris pour "sauter" vers `/products` ou `/print` avec une
  requête.
- Aucun autre élément de la navbar (logo, localisation, notifications, icônes
  de compte) touché.
- Pas de trou de mise en page : l'élément est simplement omis du `flex` (avec
  son `gap`), un `<div className="flex-1" />` existant absorbe déjà l'espace
  restant.

## Tâches 2-4 : Étendre la recherche Academy/Print/Marketing aux Stores

### 1. Audit

- **Academy** : `AcademyStoresSection` (composant **partagé**, réutilisé aussi
  par Espace Barista Marketplace → Académie selon son propre commentaire) ne
  recevait **aucun filtrage** du tout — `companies={academyCompanies}` passé
  brut, sans même la recherche. Comme le composant est partagé, le filtrage a
  été ajouté **au niveau de la page** (`filteredAcademyCompanies`), pas dans le
  composant lui-même, pour ne jamais affecter l'autre appelant.
- **Print** et **Marketing** : `PrintStoresSection`/`MarketingStoresSection`
  sont des fonctions **locales** à leur propre fichier de page (confirmé : zéro
  autre site d'appel dans toute la base) — le prop `search` a donc pu être
  ajouté directement sur ces composants sans risque.
- **Champs réellement disponibles inspectés** (schema) :
  `AcademyCompanyListCard`/`PrintCompanyListCard` (via `PrintCompanyCard`)/
  `MarketingCompanyListCard` ont tous `name`/`description` — utilisés tels
  quels, aucun champ inventé.
- Dans les trois cas, les filtres déjà appliqués à ces sections (catégorie
  pour Print/Marketing ; aucun pour Academy) sont restés des filtres
  pertinents pour une "boutique" (ex. `categories` est un champ réel du
  prestataire) — la recherche a été ajoutée en AND, jamais en remplacement.

### 2. Implémentation

- **Academy** (`barista-academy-page.tsx`) : nouveau `filteredAcademyCompanies`
  (`useMemo`), filtrant `academyCompanies` par `trainingSearch` sur
  `name`/`description` — **volontairement pas** filtré par
  `trainingLevel`/`trainingCert` (attributs de formation, non pertinents pour
  la carte d'une académie). `AcademyStoresSection` reçoit désormais cette liste
  filtrée au lieu de la liste brute ; le composant partagé lui-même n'a pas
  été modifié.
- **Print** (`print-page.tsx`) : `PrintStoresSection` reçoit un nouveau prop
  `search` ; son `filtered` (`useMemo`) combine désormais la condition
  catégorie existante avec une correspondance sur `name`/`description`, en
  AND. Appel mis à jour avec `search={printSearch}`.
- **Marketing** (`marketing-page.tsx`) : même changement exact sur
  `MarketingStoresSection`, avec `search={search}`.
- Dans les trois cas, **aucun nouveau champ de saisie** n'a été ajouté — le
  champ de recherche déjà existant dans chaque filtre section (inchangé dans
  sa conception, sa position, son design) alimente désormais aussi bien le
  service/produit que le store, exactement comme demandé ("Keep one search
  input per page").

### 3. Garde-fous respectés

- **Modules restés indépendants** : chaque section continue de lire
  exclusivement les données de son propre module (`academyCompanies`/
  `printCompanies`/`marketingCompanies`, chacune de sa propre requête
  existante, non modifiée) — aucun mélange de prestataires entre Academy,
  Print et Marketing.
- **Visibilité/autorisation préservées** : aucune des requêtes `useQuery`
  alimentant ces trois listes de stores n'a été modifiée — la recherche
  n'ajoute qu'un prédicat client supplémentaire sur des données déjà
  autorisées côté serveur, exactement comme pour Shop.
- **Pas de doublons de cartes** : chaque section continue d'afficher une seule
  carte par prestataire (dérivée de sa propre liste de companies, jamais
  dupliquée à partir des services) — aucune logique de déduplication
  supplémentaire n'était nécessaire.
- **Filtres existants préservés** : catégorie (Print/Marketing), Niveau/
  Certification (Academy, non appliqués aux stores) — tous inchangés dans
  leur propre portée.

## Tests exécutés (pour les 4 tâches)

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès.
- `git status`/`git diff --stat` → `marketplace-layout.tsx`,
  `barista-academy-page.tsx`, `print-page.tsx` et `marketing-page.tsx`
  modifiés par cette tâche ; confirmé par recherche exhaustive qu'aucun autre
  site d'appel de `MarketingStoresSection`/`PrintStoresSection` n'existe dans
  la base (donc aucun risque de régression ailleurs), et qu'`AcademyStoresSection`
  (composant partagé) a délibérément été laissé intact pour ne pas affecter
  son autre appelant.
- Aucun navigateur disponible dans cet environnement — pas de test de frappe
  réel ; comportement vérifié par lecture directe des types de données, des
  nouvelles conditions de filtrage, et de la condition `hideNavbarSearch` dans
  la navbar.

---

# Analyse — Add Product and Pack Search to Individual Store Pages

## 1. Audit

- **Page cible** : `pages/cafe/store-detail-page.tsx` (route `/stores/:storeId`,
  composant `StoreDetailPage`) — aucun état de recherche n'existait avant
  cette tâche (confirmé par recherche exhaustive : aucun `search`/`setSearch`
  dans tout le fichier).
- **Données déjà scopées au store courant** : `store?.products` provient de
  `GET /api/stores/:storeId` et `storePacks` de `GET /api/stores/:storeId/packs`
  — les deux requêtes sont déjà keyed par `storeId` et ne renvoient jamais que
  le contenu de CE store. Aucune donnée d'un autre store ne peut donc jamais
  apparaître dans les résultats de recherche — la portée "un seul store" est
  héritée gratuitement de l'architecture de requêtes existante, pas quelque
  chose à implémenter.
- **`StorePacksSection` et `FilterState`** : composant local à ce fichier
  (confirmé par recherche : aucun autre site d'appel), donc modifiable
  directement sans risque pour un autre appelant — contrairement à
  `AcademyStoresSection` dans la tâche précédente.
- **Piège de mise en page identifié avant d'implémenter** : la bande de
  filtres "Sub-category + brand" n'était rendue que si
  `subCategories.length > 0 || brands.length > 0`, et la bande englobante
  (catégories + filtres) que si l'une des trois taxonomies avait au moins une
  entrée. Ajouter la recherche à l'intérieur de ces blocs sans ajuster leurs
  gardes l'aurait fait disparaître pour tout store sans taxonomie du tout —
  même correctif de principe que pour `/print`/`/products` dans les tâches
  précédentes (`!cards.length`/`!categoryProducts.length` à la place de
  "aucune facette").
- **Pas de synchronisation URL `?q=`** sur cette page (contrairement à
  `/products`/`/print`) ni de handler "changer de catégorie préserve la
  recherche" — les boutons de catégorie appellent directement
  `setCategoryId`/`setFilters` en ligne, jamais une fonction `resetFilters`
  partagée. Donc, contrairement aux tâches précédentes, **pas besoin** de
  séparer `resetFilters`/`resetAll` ici : le seul `resetFilters` existant (déjà
  utilisé uniquement par le bouton Reset et par le bouton de l'état vide) peut
  vider la recherche directement sans casser un autre comportement.

## 2. Implémentation

- Nouveaux `search`/`setSearch`, `searchOpen`/`setSearchOpen`,
  `searchInputRef` (mêmes noms/rôles que `/products`).
- Nouveau token `inputBg` ajouté à `useTheme()` (valeur identique aux autres
  pages SHOP/Academy/Print/Marketing).
- `categoryFiltered` (produits) étendu : recherche sur `name`/`description`
  ajoutée en AND avant le filtre catégorie — exactement la même logique et le
  même ordre que `browse-products.tsx`.
- `StorePacksSection` : nouveau prop `search` ; son `filtered` (`useMemo`)
  étendu avec une correspondance sur `name`/`description`/
  `items.some(item => item.productName...)` — **pas** de `supplierName`
  (contrairement à la version Shop-wide) puisque tous les packs d'un store
  donné partagent déjà le même fournisseur ; ce champ n'aurait servi à rien
  ici.
- Garde englobante de la bande de filtres étendue avec `|| products.length >
  0` ; garde interne de la bande "Sub-category + brand" supprimée (bande
  toujours rendue désormais) pour que la recherche reste disponible même sans
  aucune taxonomie.
- Champ de recherche ajouté en premier élément de cette bande, repris à
  l'identique du champ `/products` (bouton icône repliable sur mobile,
  `w-44 sm:w-full`, `h-7 text-xs pl-8 rounded-full`, placeholder "Search
  products…").
- `resetFilters` étendu pour vider aussi `search` ; `hasActive` étendu avec
  `|| !!search`.

## 3. Garde-fous respectés

- **Portée strictement limitée au store courant** : héritée des requêtes
  `/api/stores/:storeId` et `/api/stores/:storeId/packs`, non modifiées —
  aucune fuite de données d'un autre store possible.
- **Changement de store** : `store`/`storePacks` se rafraîchissent déjà
  automatiquement via leur `queryKey` incluant `storeId` ; `search` n'est pas
  explicitement réinitialisé au changement de store, exactement comme
  `categoryId`/`filters` ne l'étaient déjà pas avant cette tâche — aucune
  régression introduite, comportement cohérent avec l'existant.
- **Aucun nouvel endpoint, migration, ni composant navbar** : filtrage
  entièrement client-side sur des données déjà chargées ; `marketplace-layout.tsx`
  non touché par cette tâche (la case de recherche globale reste visible sur
  `/stores/:id`, hors du périmètre explicite de cette tâche).
- **Produits ≠ Packs** : chaque type continue d'utiliser sa propre section/
  carte/navigation existante ; aucune carte de pack affichée comme produit ou
  inversement.
- **Panier, variantes, prix, disponibilité, navigation détail** : aucun de ces
  éléments touché.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur (y compris après correction d'un déséquilibre
  de balises JSX provoqué par la suppression de la garde conditionnelle de la
  bande sub-category/brand, détecté et corrigé avant de continuer).
- `npm run build` → succès.
- `git status`/`git diff --stat` → seul `store-detail-page.tsx` modifié par
  cette tâche.
- Aucun navigateur disponible dans cet environnement — pas de test de frappe
  ou de navigation entre stores réel ; comportement vérifié par lecture
  directe des `queryKey` scopées par `storeId`, des nouvelles conditions de
  filtrage, et confirmation que `StorePacksSection` n'a aucun autre site
  d'appel dans la base.

---

# Analyse — Standardize Maintenance and Barista Detail Modal Layouts

## 1. Audit

- **Référence `/academy`** (`components/academy/academy-detail-modal.tsx`,
  non modifié) : chaque section logique du corps (`p-5 sm:p-6 space-y-5`) a
  son propre conteneur `p-3 rounded-xl ${t.sectionBg}` (petites tuiles Prix/
  Catégorie/Format/Places en `grid grid-cols-2`, bloc "Détails de la
  formation"), sauf l'en-tête (nom + badge + notation, texte brut sans fond)
  et le bloc "Académie" (bouton cliquable avec bordure, `sectionBgAlt`). Pas
  de hauteur fixe imposée à chaque section — `formationDetails` lui-même n'a
  **aucun** scroll interne propre : c'est tout le `DialogContent`
  (`max-h-[90vh] overflow-y-auto`) qui absorbe une longueur de contenu. Les
  Avis ont déjà été déplacés hors du corps principal vers une modale dédiée.
- **`/maintenance`** (`AgentDetailModal`, dans `pages/cafe/maintenance/
  maintenance-page.tsx`) : incohérence confirmée — "Expérience/Réponse" et
  "Zone d'intervention" utilisaient déjà un conteneur `${t.mutedBg} rounded-xl
  p-3`, mais "À propos", "Détails de Service", "Compétences", "Certifications"
  et "Portfolio" étaient de simples `<div><h3>…</h3>…</div>` sans fond ni
  séparation visuelle — exactement l'écart que la tâche décrit.
- **`/barista`** (`BaristaDetailModal`,
  `components/barista/barista-detail-modal.tsx`) : même incohérence, avec le
  jeton `t.sectionBg` (déjà défini et déjà utilisé par les tuiles Expérience/
  Niveau d'étude) — "Compétences", "Langue", "Certifications", "Portfolio" et
  "Cafés précédents" étaient tous non boîtés.
- **Décision de palette** : garder le jeton de couleur déjà établi dans
  **chaque** fichier (`t.mutedBg` pour Maintenance, `t.sectionBg` pour
  Barista) plutôt que d'importer la valeur hexadécimale exacte d'Academy — la
  tâche demande de reproduire la logique STRUCTURELLE d'Academy (chaque
  section = son propre conteneur visuellement séparé), pas de recolorer deux
  modules différents avec une palette qui n'est pas la leur. Les deux jetons
  sont déjà conceptuellement équivalents (boîte de fond discrète) et déjà
  utilisés ailleurs dans ces mêmes modales.

## 2. Implémentation

**`/maintenance`** : "À propos", "Compétences", "Certifications" et
"Portfolio" enveloppés dans `p-3 rounded-xl ${t.mutedBg}` ; "Détails de
Service" enveloppé de même, avec en plus un conteneur interne `max-h-48
overflow-y-auto` (mêmes classes de scrollbar fine que le `DialogContent` de
cette modale) — seule section explicitement visée par la tâche comme sujette
à un long contenu ("long bullet lists"), les autres restent sans hauteur
imposée, conformément à "Do not force every section to have an identical
fixed height." "Expérience/Réponse" et "Zone d'intervention" strictement
inchangées (déjà boîtées).

**`/barista`** : "Compétences", "Langue", "Certifications" et "Portfolio"
enveloppés dans `p-3 rounded-xl ${t.sectionBg}` ; "Cafés précédents" de même,
avec le même traitement `max-h-48 overflow-y-auto` que "Détails de Service"
côté Maintenance (liste d'emplois potentiellement longue). "Expérience/Niveau
d'étude" strictement inchangées (déjà boîtées).

Dans les deux fichiers : **aucune donnée, prop, handler, data-testid, route,
ou logique métier modifiée** — uniquement l'ajout d'un `<div>` englobant
(classe + fermeture) autour du contenu déjà existant de chaque section.

## 3. Garde-fous respectés

- **`/academy` non modifié** : confirmé par `git status` — seuls
  `barista-detail-modal.tsx` et `maintenance-page.tsx` apparaissent dans le
  diff de cette tâche.
- **Aucune section vide créée** : chaque bloc reste gardé par sa condition
  d'existence déjà en place (`agent.serviceDetails?.trim() &&`,
  `card.skills.length > 0 &&`, etc.) — juste déplacée à l'intérieur du
  nouveau conteneur, jamais retirée.
- **Pas de hauteur fixe uniforme** : seules les deux sections explicitement
  signalées comme pouvant devenir longues (Détails de Service, Cafés
  précédents) ont reçu un plafond + défilement interne ; toutes les autres
  restent de taille naturelle, exactement comme la référence Academy.
- **Pas de conflit de défilement imbriqué** : le plafond `max-h-48
  overflow-y-auto` ajouté est strictement interne à sa propre section (et
  significativement plus petit que la hauteur du `DialogContent` englobant,
  `max-h-[90vh]`), donc jamais en compétition avec le scroll global de la
  modale.
- **Portfolio, compétences/sous-compétences, certifications, zone
  d'intervention, historique professionnel** : rendu interne (grille,
  lightbox, puces, icônes) strictement inchangé — seul le conteneur
  englobant a changé.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès.
- `git status`/`git diff --stat` → seuls `barista-detail-modal.tsx` (39
  lignes) et `maintenance-page.tsx` (48 lignes) modifiés par cette tâche ;
  confirmé qu'`academy-detail-modal.tsx` n'apparaît pas dans le diff.
- Aucun navigateur disponible dans cet environnement — pas de capture
  visuelle réelle des nouvelles sections boîtées ; mise en page vérifiée par
  lecture directe des classes ajoutées et comparaison structurelle avec la
  référence Academy (conteneurs, espacement, absence de hauteur fixe
  généralisée).

---

# Analyse — Reduce SHOP Hero Height and Remove Subtitle

## 1. Audit

- Hero SHOP localisé dans `pages/cafe/browse-products.tsx` : `<section
  className="relative pt-5 pb-12 px-5 ...">`, une rangée de contrôles
  (`mb-9`), puis un bloc centré (icône, `<h1>BigBoss SHOP</h1>` avec `mb-2`,
  puis le `<p>` sous-titre "Commandez vos produits professionnels
  directement auprès de fournisseurs vérifiés.").
- Seuls trois leviers identifiés pour réduire la hauteur sans toucher au
  reste : le padding bas de la `<section>` (`pb-12`), la marge sous la
  rangée de contrôles (`mb-9`), et la marge du titre (`mb-2`, qui ne sert
  plus à rien une fois le sous-titre retiré).

## 2. Implémentation

- `pb-12` → `pb-6` sur la `<section>`.
- `mb-9` → `mb-5` sur la rangée de contrôles (bouton Flash Mode).
- Suppression complète du `<p>` sous-titre.
- Suppression de `mb-2` sur le `<h1>` (devenu inutile, plus aucun élément ne
  le suit dans le bloc centré — évite un espace vide résiduel).
- Titre "BigBoss SHOP", icône, couleurs, dégradé de fond, bouton Flash Mode :
  tous strictement inchangés.

## 3. Garde-fous respectés

- Aucun autre contenu de la page (recherche, filtres, catégories, produits,
  stores, packs, navigation) touché — seules les 4 lignes de la section hero
  modifiées.
- Aucun composant partagé modifié (le hero est local à `browse-products.tsx`).
- Aucune logique métier, API, route, ni donnée touchée.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès.
- `git status` → seul `browse-products.tsx` modifié par cette tâche.
- Aucun navigateur disponible dans cet environnement — pas de capture
  visuelle réelle ; changement vérifié par lecture directe des classes
  Tailwind modifiées (réduction effective de padding/marges, titre toujours
  présent, sous-titre entièrement retiré).

---

# Analyse — Restore Original SHOP Hero Section

## 1. Contexte

- Le résultat de la tâche précédente ("Reduce SHOP Hero Height and Remove
  Subtitle") n'a pas convenu — demande explicite de tout annuler et de
  restaurer l'apparence d'origine du hero SHOP.

## 2. Implémentation

- Les 4 modifications de la tâche précédente, toutes dans
  `pages/cafe/browse-products.tsx`, annulées une à une à l'identique de leur
  état avant cette tâche :
  - `pb-6` → `pb-12` sur la `<section>` du hero (+ commentaire ajouté retiré).
  - `mb-5` → `mb-9` sur la rangée de contrôles (bouton Flash Mode).
  - `mb-2` restauré sur le `<h1>` "BigBoss SHOP".
  - Sous-titre restauré : `<p className="text-base mb-0 max-w-xl mx-auto ...">Commandez
    vos produits professionnels directement auprès de fournisseurs
    vérifiés.</p>`.
- Vérifié via `git diff` qu'aucun hunk ne subsiste sur la zone du hero par
  rapport au dernier commit — confirmation que le fichier est revenu à l'état
  exact d'avant la tâche précédente, pas une simple approximation visuelle.

## 3. Garde-fous respectés

- Seul `browse-products.tsx` touché ; aucune autre page, composant partagé,
  route, API ou logique métier modifiée.
- Aucune autre partie de SHOP (recherche, filtres, produits, stores, packs,
  navigation) touchée.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès.
- `git diff` sur la zone du hero → aucune différence restante par rapport au
  dernier commit, confirmant la restauration exacte.

---

# Analyse — Admin Service Hero Customization + Dynamic SHOP Statistics

## 1. Audit préalable

### 1.1 Précédent architectural réutilisé

- `heroActionSettings` (`shared/schema.ts`) : une ligne par service
  (`heroServiceEnum` = SHOP/BARISTA/ACADEMY/MAINTENANCE/PRINT/MARKETING),
  auto-seedée via `onConflictDoNothing`, lecture publique
  (`GET /api/hero-actions`), écriture Admin uniquement
  (`PATCH /api/admin/hero-actions/:service`), broadcast temps réel. Ce
  modèle exact est repris pour la nouvelle table `service_hero_configs`
  (même forme get/set, même seed, même garde Admin, même broadcast).
- `HeroSlidesEditor`/`LandingConfigSection` (même fichier, ~lignes 551-680) :
  confirmé comme une fonctionnalité distincte et non concernée — le
  carrousel hero de la page de connexion (pré-login), piloté par
  `/api/landing-config`. Ni la table, ni les routes, ni l'UI de cette tâche
  n'y touchent.
- `SERVICE_ORDER_CARDS`/`HERO_SERVICES` (`system-management-page.tsx`) :
  registre existant des 6 services avec icône/label — réutilisé tel quel
  comme sélecteur de service dans la nouvelle UI Admin (aucun nouveau
  registre dupliqué).

### 1.2 Vérification des données pour les statistiques SHOP (Partie 3)

Objectif : confirmer que les compteurs Stores/Packs/Products peuvent être
calculés sans nouvel endpoint, à partir des données déjà chargées par
`browse-products.tsx`.

- `storage.getMarketplacePacks()` (`server/storage.ts:11954`) : filtre déjà
  `visibility='VISIBLE'`, `isArchived=false`, puis `isAvailable` — exactement
  la même règle que la route détail `/api/marketplace/packs/:id`. Le tableau
  `packs` reçu par le client est donc déjà 100% éligible.
- `storage.getVisibleStores()` (`server/storage.ts:12405`) : filtre déjà
  `approvalStatus='APPROVED'` + `visibility='VISIBLE'`, et ne retourne que
  les stores avec `productCount > 0`. Le tableau `stores` est donc déjà la
  liste exacte des magasins disponibles, sans filtre supplémentaire à
  ajouter côté client.
- `storage.getMarketplaceProducts()` (`server/storage.ts:5745`) : exclut déjà
  les produits `status='FREEZE'`, les listings `onlyForPack`, les catégories
  gelées par fournisseur, et les listings sans stock/prix positif. Le
  tableau `allProducts` est donc déjà la liste exacte des produits
  disponibles.
- Conclusion : `stores.length`, `packs.length`, `allProducts.length` sur les
  requêtes déjà existantes de `browse-products.tsx` donnent directement les
  3 compteurs demandés, sans nouvelle route ni logique d'éligibilité
  dupliquée.

## 2. Implémentation

### 2.1 Base de données (`shared/schema.ts`)

- Nouvelle table `service_hero_configs` (une ligne par `heroServiceEnum`,
  contrainte `unique()` sur `service`) : `backgroundImages` (text[]),
  `rotationIntervalSeconds`, `gradientEnabled`/`gradientFrom`/`gradientVia`/
  `gradientTo`/`gradientDirection`, `subtitle` (nullable = défaut du
  service), `height` (compact/medium/large), `horizontalAlign`
  (left/center/right), `verticalAlign` (top/center/bottom),
  `infoRowEnabled` (bool, défaut `true` — préserve le comportement actuel).
- Appliquée en base via `npm run db:push` (additive uniquement, aucune
  colonne ni table existante modifiée/supprimée) — vérifié par requête SQL
  directe sur `information_schema.columns`.

### 2.2 Serveur (`server/storage.ts`, `server/routes.ts`)

- `storage.getServiceHeroConfigs()` : même mécanique que
  `getHeroActionSettings` — lit les lignes existantes, auto-seed les
  services manquants avec les valeurs par défaut, retourne une map complète
  des 6 services (jamais de trou).
- `storage.setServiceHeroConfig(service, updates)` : upsert ciblé sur un
  seul service (update si la ligne existe, insert sinon), puis relecture
  complète — garantit qu'une modification/réinitialisation d'un service ne
  touche jamais la ligne d'un autre.
- `GET /api/service-hero-config` (public) : lecture, mêmes garanties que
  `/api/hero-actions`.
- `PATCH /api/admin/service-hero-config/:service` (`requireAdmin`) :
  validation zod stricte par champ (longueurs/bornes/enums : rotation 2-60s,
  max 8 images, max 240 caractères de sous-titre, enums fermés pour
  height/horizontalAlign/verticalAlign), service invalide → 400, non-admin
  → 401 (vérifié), broadcast `service_hero_config_updated` après écriture.
- `client/src/hooks/use-realtime.ts` : nouvel événement
  `service_hero_config_updated` invalide `["/api/service-hero-config"]`
  (même convention que `hero_actions_updated`).

### 2.3 Client — hook et composant partagés (nouveaux fichiers)

- `client/src/hooks/use-service-hero-config.ts` : `useServiceHeroConfigMap()`
  / `useServiceHeroConfig(service)`, défauts sûrs identiques au serveur (un
  échec de chargement ne change jamais l'apparence actuelle d'un hero).
- `client/src/components/shared/service-hero.tsx` : `ServiceHeroBackground`
  (rotation d'images avec `setInterval`/`clearInterval` propre au montage,
  dégradé CSS inline — couleurs admin arbitraires, pas de classes Tailwind
  dynamiques —, repli sur le fond par défaut existant du service si rien
  n'est configuré ; règle de précédence explicite : un dégradé actif
  remplace les images) et `ServiceHeroShell` (centralise
  hauteur/alignement horizontal/vertical autour du fond + du contenu propre
  à chaque page). Un seul point d'implémentation pour les 6 heros — pas de
  logique dupliquée ni réinventée par service.

### 2.4 Intégration dans les 6 heros (Parties 1 & 2)

Fichiers modifiés : `browse-products.tsx` (SHOP), `maintenance-page.tsx`,
`barista-page.tsx`, `barista-academy-page.tsx`, `print-page.tsx`,
`marketing-page.tsx`. Pour chacun :

- `<section>` + fond conditionnel dark/light existant → `<ServiceHeroShell
  config={heroConfig} defaultBackground={...} controlsRow={...}>` ; le fond
  par défaut d'origine est passé tel quel (inchangé visuellement quand
  aucune image/dégradé n'est configuré).
- Icône/titre conservés à l'identique (propres à chaque service, jamais
  génériques).
- Sous-titre : `{heroConfig.subtitle ?? "<texte par défaut d'origine>"}` —
  le texte par défaut exact de chaque service est préservé mot pour mot.
- Ligne d'info (stats) existante : enveloppée dans
  `{heroConfig.infoRowEnabled && (...)}` — ON affiche la ligne telle
  qu'elle existait déjà (aucune valeur inventée), OFF la masque entièrement.
- Alignement horizontal appliqué à l'icône (`H_ALIGN_ICON_MX`) et à la
  ligne d'info (`H_ALIGN_ROW_JUSTIFY`) ; alignement vertical + hauteur
  gérés par `ServiceHeroShell`.

### 2.5 Statistiques SHOP (Partie 3, `browse-products.tsx`)

- Nouvelle ligne sous le sous-titre du hero SHOP, toujours affichée
  (exigence explicitement séparée du toggle `infoRowEnabled` ci-dessus — sa
  propre règle, jamais masquée) :
  `{storesLoading ? "…" : stores.length} magasins`,
  `{packsLoading ? "…" : packs.length} packs`,
  `{isLoading ? "…" : allProducts.length} produits`.
- Zéro nouvelle requête : réutilise les 3 `useQuery` déjà existants de la
  page (`/api/stores`, `/api/marketplace/packs`, `/api/marketplace`), ajout
  seulement de `isLoading: storesLoading`/`isLoading: packsLoading` sur les
  deux qui ne l'exposaient pas encore.
- Catégories vides → `0` affiché explicitement (comportement natif de
  `.length`), jamais masqué ni remplacé par une valeur inventée.

### 2.6 Interface Admin (`system-management-page.tsx`)

Nouveau composant `ServiceHeroCustomizationSection()`, inséré dans l'onglet
« Services » juste après `HeroActionsSection` (zone déjà dédiée aux
réglages par service) :

- Sélecteur des 6 services (réutilise `HERO_SERVICES`).
- Édition en brouillon local (`draft`) distincte de la valeur enregistrée
  (`saved`) — un bandeau « Modifications non enregistrées » apparaît
  uniquement si `draft` diffère de `saved` ; le brouillon ne se resynchronise
  sur le serveur qu'au changement de service (jamais écrasé par un
  rafraîchissement temps réel en arrière-plan pendant une édition en cours).
- Sections : Images d'arrière-plan (ajout/suppression + intervalle de
  rotation si ≥2 images), Dégradé (toggle + 3 couleurs avec
  `<input type="color">` + sélecteur de direction), Sous-titre (texte vide
  = défaut, bouton explicite « Revenir au défaut »), Hauteur & Position (3
  `Select`), Ligne d'info (switch), Aperçu en direct (rendu du vrai
  `ServiceHeroShell`, pas une maquette séparée), boutons Enregistrer
  (désactivé si rien à enregistrer) et Réinitialiser (persiste les valeurs
  par défaut pour le service sélectionné uniquement).
- États de chargement (`Skeleton`), succès/erreur (toasts), chaque mutation
  cible explicitement `:service` dans l'URL — jamais d'écriture multi-
  services en un seul appel.

## 3. Garde-fous respectés

- `HeroSlidesEditor`/`LandingConfigSection`/`/api/landing-config` non
  modifiés — fonctionnalité pré-login totalement indépendante.
- Aucune route, permission ou règle d'éligibilité marketplace existante
  modifiée ; les 3 requêtes SHOP réutilisées sont lues en l'état, jamais
  réécrites.
- Aucune donnée métier existante supprimée ; migration DB strictement
  additive (nouvelle table uniquement).
- Chaque service garde son apparence exacte tant qu'il n'a pas de
  configuration Admin (valeurs par défaut = comportement actuel inchangé).
- Réinitialiser un service ne touche que ce service (vérifié par script,
  voir §4).

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur (avant et après l'ajout de l'UI Admin).
- `npm run build` → succès (client + serveur).
- `npm run db:push` → changements appliqués ; colonnes de
  `service_hero_configs` vérifiées directement en base
  (`information_schema.columns`).
- Redémarrage du serveur de dev (`tsx` sans mode watch serveur — nécessaire
  pour charger les nouvelles routes) ; ancien process arrêté puis relancé
  proprement (`[express] serving on port 5000`).
- `GET /api/service-hero-config` sans authentification → 200, les 6
  services présents avec les valeurs par défaut exactes.
- `PATCH /api/admin/service-hero-config/SHOP` sans authentification → 401
  (garde Admin active avant toute validation).
- Script temporaire (`scratch-test-hero.ts`, supprimé après usage) appelant
  directement `storage.setServiceHeroConfig` : mise à jour de MARKETING
  (sous-titre, hauteur, alignements, images, rotation) confirmée persistée,
  PRINT strictement inchangé après cette mise à jour, puis réinitialisation
  de MARKETING confirmée retournant exactement aux valeurs par défaut,
  PRINT toujours inchangé — confirme le scoping par service demandé par la
  tâche.
- `GET /api/stores`, `/api/marketplace/packs`, `/api/marketplace` sur
  l'environnement réel : 10 magasins, 6 packs, 34 produits — chiffres réels
  non fabriqués, cohérents avec les données déjà en base.
- `git status --short` final : uniquement les fichiers attendus pour cette
  tâche (+ fichiers déjà modifiés par des tâches précédentes de la session,
  non touchés davantage ici).

## 5. Limites connues

- Aucun navigateur réel disponible dans cet environnement pour une
  vérification visuelle directe (rendu du dégradé, timing exact de la
  rotation d'images, absence de chevauchement du logo/titre à toutes les
  tailles d'écran). La logique a été vérifiée par lecture de code, type-
  checking strict et tests fonctionnels côté serveur/API ; une vérification
  visuelle manuelle reste recommandée avant mise en production.
- Les couleurs de dégradé sont stockées en texte libre (hex ou nom CSS) et
  appliquées via `style` inline — aucune validation de format côté serveur
  au-delà d'une limite de longueur (cohérent avec les autres champs "image
  URL" déjà en texte libre ailleurs dans l'app, ex. `landingConfig`).

---

# Analyse — Improve Service Hero Personalization (Non-Breaking Update)

## 1. Audit préalable

### 1.1 Cause exacte du bug SHOP (Partie 1)

Trace complète du réglage "Ligne d'info sous le sous-titre" de l'admin
jusqu'au rendu réel :

- Admin → `draft.infoRowEnabled` (state local) → `saveMutation` →
  `PATCH /api/admin/service-hero-config/SHOP` → `storage.setServiceHeroConfig`
  → colonne `info_row_enabled` en base → `GET /api/service-hero-config` →
  `useServiceHeroConfig("SHOP")` côté client. Cette chaîne fonctionne
  correctement et a été vérifiée de bout en bout (voir §4).
- Le défaut se trouvait uniquement dans `browse-products.tsx` : lors de
  l'implémentation précédente (tâche "Admin Service Hero Customization"),
  la ligne de statistiques SHOP (magasins/packs/produits) avait été codée
  comme **toujours affichée sans condition**, avec un commentaire
  explicite justifiant cela comme "une exigence séparée" du toggle
  `infoRowEnabled`. Aucune autre page ne présentait ce problème — les 5
  autres heros (Maintenance, Barista, Academy, Print, Marketing) encapsulent
  déjà correctement leur ligne d'info dans `{heroConfig.infoRowEnabled && (...)}`.
- Confirmé en lisant l'état réel sauvegardé en base avant toute correction :
  SHOP avait déjà `infoRowEnabled: false` enregistré, mais la ligne
  continuait de s'afficher — reproduction exacte du bug signalé.
- Aucun second mécanisme de configuration concurrent trouvé ; un seul champ
  `infoRowEnabled` existe et est déjà correctement persisté/chargé. La
  correction consiste uniquement à faire respecter ce champ existant dans
  `browse-products.tsx`, sans toucher à la persistance ni à l'admin.

### 1.2 Détection dark/light mode

- Chaque page héros lit son propre booléen (`t.dk`, `isDark`, etc.) depuis
  `useThemeStore` (déjà utilisé pour toutes les classes Tailwind
  conditionnelles existantes du hero). Les nouvelles couleurs de sous-titre
  réutilisent exactement cette même valeur par page — aucun nouveau
  mécanisme de détection de thème introduit.

### 1.3 Rendu et rotation des images d'arrière-plan

- `ServiceHeroBackground` (`client/src/components/shared/service-hero.tsx`)
  gère déjà la rotation (`setInterval`/`clearInterval` sur changement
  d'images ou d'intervalle) et empilait un calque **fixe et non
  configurable** `bg-black/30` par-dessus les images, sans jamais l'appliquer
  aux modes dégradé/couleur unie (branche séparée, retournée avant). C'est
  exactement la même séparation déjà en place qui permet d'ajouter le calque
  configurable uniquement dans la branche "images" sans toucher au dégradé.

## 2. Implémentation

### 2.1 Partie 1 — Correction du toggle SHOP

- `client/src/pages/cafe/browse-products.tsx` : la ligne de statistiques
  SHOP est désormais enveloppée dans `{heroConfig.infoRowEnabled && (...)}`,
  exactement comme les 5 autres services. Les données/icônes/testids de la
  ligne sont inchangés — seule sa visibilité est maintenant pilotée par le
  réglage existant. Aucun nouveau mécanisme introduit.

### 2.2 Partie 2 — Visibilité et couleurs du sous-titre

- Nouveaux champs persistés (table `service_hero_configs`) : `subtitleEnabled`
  (bool, défaut `true`), `subtitleColorLight`/`subtitleColorDark` (text,
  défaut `""` = couleur Tailwind par défaut du service, inchangée).
- `client/src/components/shared/service-hero.tsx` : nouvelle fonction
  exportée `getHeroSubtitleColorStyle(config, isDark)` — retourne
  `{ color: "#xxxxxx" }` uniquement si une couleur valide (format hex
  `#RRGGBB`) est enregistrée pour le thème actif, sinon `{}` (aucun style
  inline, les classes Tailwind existantes du service s'appliquent comme
  avant). Centralisé une seule fois, réutilisé par les 6 pages + l'aperçu
  Admin — pas de logique dupliquée.
- Chaque page héros (`browse-products.tsx`, `maintenance-page.tsx`,
  `barista-page.tsx`, `barista-academy-page.tsx`, `print-page.tsx`,
  `marketing-page.tsx`) : le `<p>` du sous-titre est désormais enveloppé
  dans `{heroConfig.subtitleEnabled && (...)}` (démontage complet — pas de
  `visibility:hidden` — donc aucun espace vide résiduel) et reçoit
  `style={getHeroSubtitleColorStyle(heroConfig, isDark)}` en plus de ses
  classes existantes. Titre, icône, ligne d'info, arrière-plan : non
  modifiés par ce réglage.
- Le toggle sous-titre et le toggle ligne d'info restent deux champs
  totalement indépendants (`subtitleEnabled` vs `infoRowEnabled`) — aucune
  des deux implémentations ne lit l'état de l'autre.

### 2.3 Partie 3 — Calque transparent configurable sur les images

- Nouveaux champs persistés : `overlayEnabled` (bool, défaut `true`),
  `overlayColor` (text, défaut `"#000000"`), `overlayOpacity` (integer 0-100,
  défaut `30`) — ces valeurs par défaut reproduisent exactement l'ancien
  calque fixe `bg-black/30`, donc un service déjà configuré avant cette
  tâche garde une apparence strictement identique.
- `ServiceHeroBackground` : le calque fixe est remplacé par un calque
  conditionnel calculé via un nouvel utilitaire interne `hexToRgba(color,
  alpha)` (conversion hex → `rgba()` pour appliquer l'opacité), rendu
  uniquement dans la branche "images" (jamais sur dégradé/couleur unie,
  comme demandé) et seulement si `overlayEnabled !== false`. Ordre
  d'empilement inchangé : images (opacité croisée pour la transition) →
  calque → (dans `ServiceHeroShell`) contrôles puis contenu — le calque
  reste un simple `<div>` sans `pointer-events`, donc n'intercepte aucune
  interaction avec le contenu au-dessus.
- Aucun espace ni dimension additionnelle introduite ; le calque est
  `absolute inset-0` comme l'ancien, donc le comportement responsive
  (mobile/tablette/desktop) suit exactement celui déjà existant du fond.

### 2.4 Interface Admin (`system-management-page.tsx`)

- Section **Sous-titre** étendue : switch de visibilité en en-tête : quand
  désactivé, le texte/les couleurs restent éditables mais un message indique
  que le sous-titre est masqué et que le texte est conservé ; quand activé,
  deux sélecteurs couleur (clair/sombre), chacun avec `<input type="color">`
  + champ hex + bouton "revenir au défaut" par couleur.
- Section **Images d'arrière-plan** étendue : bloc "Calque transparent"
  affiché uniquement si au moins une image est configurée (switch ON/OFF,
  sélecteur de couleur, `Slider` 0-100% avec pourcentage affiché en direct).
- **Aperçu en direct** : ajout d'un petit bouton Clair/Sombre pour que
  l'aperçu puisse refléter la couleur de sous-titre correspondant au thème
  choisi (le calque et la rotation d'images étaient déjà reflétés
  automatiquement, car l'aperçu utilise le même composant
  `ServiceHeroShell`/`ServiceHeroBackground` que les vraies pages — aucune
  logique de rendu séparée/dupliquée pour l'aperçu).
- Description du toggle "Ligne d'info" clarifiée (l'exemple "techniciens"
  ne concernait que Maintenance ; le texte précise maintenant explicitement
  que chaque service garde son propre contenu, Shop inclus).

### 2.5 Persistance et compatibilité (Partie 4)

- Les 6 nouveaux champs suivent exactement les conventions déjà en place
  (table/route/validation existantes étendues, pas de nouveau mécanisme) :
  colonnes ajoutées à `service_hero_configs` via `npm run db:push` (ajout
  additif uniquement), zod étendu dans la même route
  `PATCH /api/admin/service-hero-config/:service` (`requireAdmin`,
  inchangé), mapping étendu dans `storage.getServiceHeroConfigs`/
  `setServiceHeroConfig` (même upsert ciblé par service, inchangé).
- Compatibilité arrière vérifiée en base réelle : les lignes déjà
  existantes (SHOP et MAINTENANCE avaient déjà des configurations réelles
  enregistrées par des tests précédents) ont automatiquement reçu les
  valeurs par défaut de rétrocompatibilité dès l'ajout des colonnes
  (`ALTER TABLE ... DEFAULT` rétroactif de Postgres) — aucune valeur
  existante (images, dégradé, sous-titre, hauteur, position) n'a été
  modifiée ou perdue.

## 3. Garde-fous respectés

- Aucune reconstruction du système : les tables, routes, hooks et composant
  partagé existants ont été étendus, jamais remplacés.
- Aucune statistique ni contenu de service codé en dur — la ligne SHOP
  garde ses propres données réelles (`stores.length`/`packs.length`/
  `allProducts.length`), les autres services gardent leur propre contenu.
- Aucune configuration existante supprimée ou écrasée (vérifié en base,
  §2.5).
- Aucune route, permission, taxonomie ou logique métier marketplace
  modifiée.
- Mise à jour d'un service vérifiée comme n'affectant jamais un autre
  service (voir §4).

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès (client + serveur).
- `npm run db:push` → changements appliqués ; les 6 nouvelles colonnes et
  leurs valeurs par défaut vérifiées directement en base
  (`information_schema.columns`) : `subtitle_enabled=true`,
  `subtitle_color_light=''`, `subtitle_color_dark=''`,
  `overlay_enabled=true`, `overlay_color='#000000'`, `overlay_opacity=30`.
- Redémarrage du serveur de dev pour charger les nouvelles routes/colonnes ;
  aucune erreur dans les logs serveur après redémarrage (hors 401/404
  attendus pour des requêtes non authentifiées).
- `GET /api/service-hero-config` : confirmé que SHOP avait réellement
  `infoRowEnabled: false` déjà enregistré en base (configuration réelle
  issue de tests précédents) — reproduction directe du bug avant correction.
- `PATCH /api/admin/service-hero-config/SHOP` sans authentification → 401
  (garde Admin toujours active, inchangée).
- Script temporaire (`scratch-test-hero2.ts`, supprimé après usage) appelant
  directement `storage.setServiceHeroConfig` : mise à jour de MAINTENANCE
  (sous-titre masqué, couleurs clair/sombre, calque couleur/opacité
  personnalisés) confirmée persistée, **SHOP strictement inchangé**
  (y compris sa configuration réelle préexistante) après cette mise à jour,
  puis restauration de MAINTENANCE à son état antérieur confirmée exacte,
  SHOP toujours inchangé — confirme à nouveau le scoping strict par
  service.
- `git status --short` final : uniquement les fichiers attendus pour cette
  tâche.

## 5. Résumé des livrables

1. **Correction SHOP** : la ligne de statistiques (magasins/packs/produits)
   était codée pour s'afficher sans condition ; elle respecte maintenant
   `heroConfig.infoRowEnabled` comme les 5 autres services, sans changer ses
   données, icônes ni styles.
2. **Sous-titre** : toggle de visibilité indépendant du toggle ligne d'info,
   + couleur dédiée par thème (clair/sombre) et par service, avec défauts
   rétrocompatibles (visible, couleur par défaut du service inchangée).
3. **Calque transparent** : activable/désactivable, couleur et opacité
   (0-100%) configurables par service, appliqué uniquement en mode image
   (jamais en dégradé/couleur unie), défauts reproduisant exactement
   l'ancien comportement codé en dur.
4. **Persistance** : 6 nouvelles colonnes additives sur la table existante,
   même route/validation/garde Admin déjà en place, rétrocompatibilité
   vérifiée sur des données réelles déjà enregistrées.

## 6. Limites connues

- Aucun navigateur réel disponible pour vérifier visuellement le rendu
  exact des couleurs/calque sur les 6 heros et dans l'aperçu Admin ;
  vérifié par lecture de code, type-checking strict, et tests
  fonctionnels directs sur la couche `storage`/API (persistance, scoping,
  rétrocompatibilité). Une vérification visuelle manuelle reste
  recommandée avant mise en production.

---

# Analyse — Consolidate Supplier Order Management

## 1. Audit préalable

### 1.1 Navigation

- `client/src/components/layout/app-sidebar.tsx:184` (avant modification) :
  entrée « Order Requests » → `/supplier/order-requests`, juste au-dessus de
  « Orders » → `/orders` dans le même groupe « ORDERS ».
- `client/src/App.tsx:19` (import) et `:377-379` (route, avant
  modification) : `/supplier/order-requests` → `OrderRequestsPage`,
  `allowedRoles=["SUPPLIER"]`, `requireApproved`.
- Aucune autre page (dashboard fournisseur, notifications, barre mobile)
  ne pointe vers `/supplier/order-requests` — seule la sidebar y menait.
- `client/src/pages/supplier/dashboard.tsx` : son lien « Voir tout » pointe
  déjà vers `/orders`, confirmant que `/orders` est déjà traité comme la
  destination canonique.
- Un troisième fichier, `client/src/pages/supplier/orders-page.tsx` (route
  `/supplier/orders`), existe mais n'est relié à **aucune** entrée de
  navigation — hors périmètre de cette tâche (non mentionné par la demande,
  non touché, voir §5).

### 1.2 Comparaison des deux pages

- `client/src/pages/supplier/order-requests-page.tsx` (avant suppression) :
  utilisait le même hook `useOrders()`/`useUpdateSubOrderStatus()` que tout
  le reste de l'app, filtrait côté client les sous-commandes du fournisseur
  connecté (`so.supplierId === user.id`), avec deux onglets (« En attente »
  = `status==="PENDING"` avec boutons Approuver/Refuser directement sur la
  carte, et « Historique »). Un bouton « Suivant » renvoyait vers
  `/orders?focus={orderId}`.
- `client/src/pages/shared/orders-page.tsx` (`/orders`) : même hook, mêmes
  données, inclut déjà PENDING dans `STATUS_OPTS` et dans la liste (aucune
  commande n'est masquée). Cliquer sur une carte PENDING ouvre
  `SupplierOrderDetailsModal` **sans** `readOnly` (donc `readOnly=false`
  par défaut) — le picklist complet `SUPPLIER_NEXT_STATUSES`
  (PENDING → Accepter/Refuser inclus) y est donc déjà pleinement
  fonctionnel, juste un clic plus profond (carte → modal) que le bouton
  direct de l'ancien onglet.
- Deux capacités UI existaient sur Order Requests et étaient absentes de
  `/orders` : un filtre de priorité (NORMAL/HIGH/URGENT) et la recherche
  par nom de café, réservée à `isAdmin` sur `/orders` alors qu'Order
  Requests l'exposait aussi au Fournisseur.

### 1.3 Backend / API / hooks / permissions / schéma

- Aucun hook dédié : pas de `use-order-requests.ts` — les deux pages
  utilisent le même `client/src/hooks/use-orders.ts`.
- Aucune route ni méthode `storage` dédiée : `GET /api/orders`
  (`server/routes.ts`, filtre `supplierId = user.id` pour le rôle
  SUPPLIER) et `PATCH /api/suborders/:id/status` (vérifie
  `subOrder.supplierId !== user.id → 403`) sont les deux seuls points
  utilisés par les deux pages — aucun n'est exclusif à Order Requests,
  tous deux restent utilisés par `/orders` et par d'autres pages.
- Aucune table `order_requests` dans `shared/schema.ts` — uniquement
  `orders`/`sub_orders`, les mêmes que `/orders` lit. « Order Requests »
  n'était qu'un filtre d'affichage côté client (`status === "PENDING"`)
  sur les mêmes lignes.
- Permissions identiques des deux côtés : même filtrage
  `supplierId = user.id` côté lecture, même garde `403` côté écriture —
  aucun chemin d'autorisation séparé.
- **Conclusion de l'audit** : rien côté backend/schéma/hooks ne deviendrait
  du code mort — seule la page frontend et sa route/entrée de navigation
  sont concernées par la suppression.

## 2. Implémentation

### 2.1 Suppression de l'onglet et de la page

- Entrée « Order Requests » retirée de `app-sidebar.tsx` (groupe
  « ORDERS »), import `ClipboardCheck` devenu inutile retiré avec elle.
- `client/src/pages/supplier/order-requests-page.tsx` supprimé (vérifié
  par grep qu'aucun autre fichier ne l'importait avant suppression).
- La route `/supplier/order-requests` est conservée mais ne rend plus la
  page retirée : un nouveau composant `SupplierOrderRequestsRedirect`
  (`App.tsx`) redirige vers `/orders`. Il est rendu par `ProtectedRoute`
  avec les mêmes `allowedRoles={["SUPPLIER"]}`/`requireApproved` qu'avant —
  un utilisateur non autorisé est donc toujours redirigé vers `/` par
  `ProtectedRoute` lui-même, avant même d'atteindre le composant de
  redirection ; impossible de contourner l'authentification ou les
  restrictions d'accès fournisseur via cette route retirée.

### 2.2 Capacités migrées vers `/orders` (`pages/shared/orders-page.tsx`)

- Ajout d'un filtre de priorité (`priorityFilter`, state + `<Select>`
  Toute priorité/Normale/Haute/Urgente) dans la barre de filtres, intégré
  à `filtered`/`clearFilters`/`hasFilters`/réinitialisation de pagination —
  exactement le même traitement que les filtres déjà existants, sans
  nouvelle architecture.
- La recherche par nom de café (`cafeSearch`), auparavant réservée à
  `isAdmin`, est désormais aussi visible pour `isSupplier` (recherche
  fournisseur par nom reste réservée à l'Admin, inchangée — un fournisseur
  n'a pas besoin de chercher par son propre nom).
- Commentaire du mécanisme `?focus=<orderId>` mis à jour pour ne plus
  nommer la page retirée (le mécanisme lui-même est un motif générique déjà
  réutilisé ailleurs dans l'app — `/driver/deliveries`,
  `/delivery/my-deliveries` — donc conservé tel quel, sans modification de
  comportement).
- Aucune autre partie de `/orders` modifiée : cartes, statuts, pagination,
  tri, recherche produit, actions Admin (suppression), workflow de
  livraison — tous inchangés.

## 3. Garde-fous respectés

- Aucune donnée ni table de commande supprimée ou modifiée ; `GET
  /api/orders` et `PATCH /api/suborders/:id/status` sont restés
  totalement intacts (aucun fichier serveur touché, confirmé par
  `git status`).
- `/orders` n'a pas été redessiné — uniquement deux filtres ajoutés dans
  la même barre de filtres existante, selon le même style que les filtres
  déjà présents.
- Les rôles Admin, Coffee Owner (page dédiée inchangée), Driver et
  Delivery Company ne sont pas affectés — seules les lignes concernant le
  Fournisseur dans le filtre de recherche café ont changé de condition de
  garde (`isAdmin` → `isAdmin || isSupplier`).
- `/supplier/orders` (troisième page orpheline, non reliée à la navigation)
  explicitement laissée inchangée — hors périmètre de cette tâche.
- Les permissions d'accès aux commandes (lecture et écriture) n'ont subi
  aucune modification — uniquement des champs/filtres d'affichage ajoutés
  côté client sur des données déjà correctement scoping.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès (client + serveur) ; taille du bundle
  légèrement réduite (un module de moins).
- Grep final : zéro référence restante à `order-requests-page`/
  `OrderRequestsPage` dans tout le dépôt (client + serveur).
- Redémarrage du serveur de dev ; `GET /api/orders` répond toujours (401
  attendu sans authentification, confirmant que la route existe toujours
  et n'a pas été supprimée par erreur).
- Script temporaire (`scratch-test-orders.ts`, supprimé après usage)
  appelant directement `storage.getOrders({ supplierId: 9 })` : confirme
  que la couche de données partagée (incluant les statuts de
  sous-commande) reste pleinement fonctionnelle après le retrait de la
  page Order Requests.
- `git status --short` final : uniquement `App.tsx`,
  `app-sidebar.tsx`, `orders-page.tsx` modifiés et
  `order-requests-page.tsx` supprimé — aucun fichier serveur, schéma, ou
  rôle non lié touché.

## 5. Résumé des livrables

1. **Navigation/page supprimées** : entrée « Order Requests » dans
   `app-sidebar.tsx` ; fichier `pages/supplier/order-requests-page.tsx` ;
   import correspondant dans `App.tsx`. La route reste présente mais
   redirige désormais vers `/orders` (`SupplierOrderRequestsRedirect`),
   protégée par les mêmes contrôles de rôle/approbation qu'avant.
2. **Fonctionnalités migrées vers `/orders`** : filtre de priorité
   (NORMAL/HIGH/URGENT) et recherche par nom de café désormais disponible
   pour le rôle Fournisseur (déjà disponible pour Admin) — Accepter/Refuser
   une commande PENDING restait déjà possible via la modale de détails de
   `/orders`, aucune migration nécessaire pour cette action.
3. **APIs/dépendances backend conservées** : `GET /api/orders`, `PATCH
   /api/suborders/:id/status`, `storage.getOrders`/`storage` associé,
   `client/src/hooks/use-orders.ts`, `SupplierOrderDetailsModal` — tous
   partagés avec `/orders` et d'autres pages, aucun n'était exclusif à
   Order Requests, aucun supprimé.
4. **Hors périmètre, signalé sans être modifié** : `/supplier/orders`
   (troisième page, non reliée à la navigation) et le routage des
   notifications fournisseur vers cette même page orpheline — un détail
   préexistant, indépendant de cette tâche, relevé par l'audit mais non
   traité ici (aucune instruction ne le demandait, et le traiter aurait
   dépassé le périmètre strict de consolidation demandé).

## 6. Limites connues

- Aucun navigateur réel disponible pour vérifier visuellement la
  redirection de `/supplier/order-requests` ou le nouveau filtre de
  priorité/recherche café dans l'UI réelle de `/orders` ; vérifié par
  lecture de code, type-checking strict, build de production réussi, et
  test fonctionnel direct de la couche de données partagée. Une
  vérification visuelle manuelle (navigation fournisseur, actions
  Accepter/Refuser depuis la modale) reste recommandée avant mise en
  production.

---

# Analyse — Unify Supplier Delivery Management

## 1. Audit préalable

### 1.1 Navigation

- `client/src/App.tsx:396-398` : `/supplier/delivery-status` → `DeliveryStatusPage`
  directement, `allowedRoles=["SUPPLIER"]`.
- `client/src/App.tsx:858-860` (avant modification) : `/delivery/my-deliveries` →
  `MyDeliveriesRoute`, `allowedRoles=["DELIVERY_COMPANY","SUPPLIER"]` — route
  **partagée**, branchée par rôle à l'exécution : `SUPPLIER` →
  `SupplierMyDeliveriesPage` (la page à retirer) ; tout autre rôle (en
  pratique `DELIVERY_COMPANY`) → redirection vers
  `/delivery/business?tab=my-deliveries`, qui rend un fichier **totalement
  différent** (`pages/delivery/my-deliveries-page.tsx`, rôle Entreprise de
  livraison) — fichier non concerné par cette tâche, non touché.
- `client/src/components/delivery/supplier-delivery-tabs.tsx` : switcher à 4
  onglets partagé par les 4 pages fournisseur de livraison (Delivery
  Status/My Deliveries/Drivers/Véhicules) — seule l'entrée « My Deliveries »
  retirée, le composant lui-même conservé (toujours utilisé par Drivers et
  Véhicules).
- `client/src/pages/supplier/delivery-status-page.tsx` (avant modification),
  ligne ~494-503 : seul lien restant vers My Deliveries — un bouton
  « Suivant » sur toute carte `deliveryMode === "SUPPLIER"` non annulée,
  menant à `/delivery/my-deliveries?focus={orderId}`.
- Aucune entrée de sidebar, aucune navigation de notification, aucun widget
  de dashboard ne pointait vers My Deliveries — confirmé par recherche
  exhaustive dans le client.

### 1.2 Comparaison des deux pages

- `/supplier/delivery-status` (avant modification) : récupère **toutes**
  les livraisons du fournisseur via `useDeliveries()`, affiche déjà chaque
  carte avec son mode (« Chauffeurs du fournisseur » / « Entreprise de
  livraison », champ `deliveryMode` lu tel qu'enregistré en base, jamais
  déduit côté client), le chauffeur assigné s'il existe
  (`Chauffeur: {d.driver.name}`), et déjà deux actions : « Dispatcher »
  (status PENDING) et « Changer de chauffeur » (status ASSIGNED, **toute
  mode confondu** — rouvre déjà le même `DispatchDialog` complet, incluant
  la ré-sélection « Mes chauffeurs »).
- `/delivery/my-deliveries` (Fournisseur, avant suppression) : sous-
  ensemble strict des mêmes données (`deliveryMode === "SUPPLIER"`
  uniquement), avec `AssignDriverControl` (Select chauffeur +
  bouton « Assigner », status ACCEPTED) et un bouton « Réassigner » (status
  ASSIGNED) qui ouvrait **déjà** le même `DispatchDialog` importé de
  Delivery Status — confirmé par le commentaire du fichier lui-même : l'
  ancien contrôle de réassignation dédié avait déjà été remplacé par ce
  `DispatchDialog` partagé.
- **Conclusion** : la seule capacité réellement absente de Delivery Status
  était `AssignDriverControl` (status ACCEPTED) — la réassignation était
  déjà unifiée des deux côtés.

### 1.3 Traçage assignation/réassignation (frontend → backend)

- `useAssignDriver()`/`useDispatchDelivery()`/`useSupplierDrivers`
  (`client/src/hooks/use-deliveries.ts`) → `PATCH /api/deliveries/:id/assign`
  / `PATCH /api/deliveries/:id/dispatch` / `GET /api/supplier/drivers` —
  tous partagés avec la page Delivery Company équivalente
  (`pages/delivery/my-deliveries-page.tsx`), aucun n'est exclusif au
  Fournisseur.
- `useReassignDriver()` (`use-delivery-ecosystem.ts`) →
  `PATCH /api/deliveries/:id/reassign` — confirmé **non utilisé** par
  l'UI Fournisseur actuelle (le bouton « Réassigner » ouvre `DispatchDialog`
  à la place) mais toujours utilisé par la page Delivery Company — route et
  méthode `storage.reassignDriver` à conserver intactes malgré ce non-usage
  côté Fournisseur.
- `server/storage.ts` : `dispatchDelivery` (mise à jour atomique
  `WHERE (id, supplierId, status)`, transaction unique, void des entrées de
  ledger `CALCULATED` en cas de redispatch), `assignDriver` (vérifie la
  propriété du chauffeur par le fournisseur, compatibilité véhicule,
  sécurité météo, mise à jour atomique `WHERE status='ACCEPTED'`, écrit les
  entrées financières dans la même transaction, clé d'idempotence basée sur
  `assignmentSequence`), `reassignDriver` (garde `status==='ASSIGNED'`
  uniquement, no-op explicite sur le ledger si le chauffeur ne change pas
  réellement) — **aucune de ces méthodes n'a été modifiée** par cette
  tâche (confirmé par `git status`, zéro fichier serveur touché).

### 1.4 Dépendances partagées à préserver vs. exclusives à My Deliveries

- À préserver (utilisées ailleurs) : `useDeliveries`, `useAssignDriver`,
  `useDispatchDelivery`, `useSupplierDrivers`, `useReassignDriver`,
  `DispatchDialog`/`CompanyBrowseView` (restent définis et utilisés dans
  `delivery-status-page.tsx`), `DeliveryDetails`/`DELIVERY_STATUS_META`/
  `DELIVERY_MODE_LABEL`, `SupplierDeliveryTabs` (composant conservé, seule
  son entrée éditée), toutes les routes/méthodes backend d'assignation et
  le code de ledger financier.
- Exclusif à My Deliveries (candidats réels à la suppression) :
  `client/src/pages/supplier/my-deliveries-page.tsx` (fichier entier),
  l'instance de `AssignDriverControl` qui y était définie (migrée, pas
  dupliquée), la branche `SUPPLIER` de `MyDeliveriesRoute`, l'entrée « My
  Deliveries » du switcher, le bouton « Suivant » de Delivery Status qui y
  menait.

## 2. Implémentation

### 2.1 Migration de l'assignation sur les cartes Delivery Status

- `client/src/pages/supplier/delivery-status-page.tsx` : `AssignDriverControl`
  migré tel quel (mêmes hooks `useSupplierDrivers`/`useAssignDriver`, même
  mutation `PATCH /api/deliveries/:id/assign`) depuis l'ancienne page, rendu
  désormais directement sur la carte quand `d.status === "ACCEPTED" &&
  d.deliveryMode === "SUPPLIER"` — condition vérifiée sur des données
  réelles en base (voir §4) couvrant exactement les livraisons
  précédemment affichées sur My Deliveries dans cet état.
- Le contrôle est enveloppé dans un `<div onClick={(e) =>
  e.stopPropagation()}>` pour empêcher l'ouverture de la modale de détails
  (ajoutée récemment sur cette page, absente de l'ancienne) quand on
  interagit avec le sélecteur/bouton — même technique que les boutons
  existants (`e.stopPropagation()` dans leurs handlers).
- Affichage du nom du chauffeur assigné : **déjà présent** sur Delivery
  Status (`Chauffeur: {d.driver.name}`), aucune modification nécessaire.
- Réassignation : **déjà unifiée** avant cette tâche (les deux pages
  ouvraient déjà le même `DispatchDialog`) — le bouton existant « Changer
  de chauffeur » (status ASSIGNED) a été conservé sans renommage ni
  changement de comportement, pour rester la plus petite modification
  sûre possible (même action, déjà fonctionnelle, déjà correctement
  habilitée indépendamment du mode).
- Le bouton « Suivant » qui renvoyait vers My Deliveries a été retiré (plus
  de page de destination) ; l'import `ArrowRight` (devenu inutile) retiré
  avec lui.

### 2.2 Retrait de My Deliveries (Partie 4)

- `client/src/pages/supplier/my-deliveries-page.tsx` supprimé (vérifié par
  grep qu'aucun autre fichier ne l'importait avant suppression, hors
  commentaires).
- `client/src/App.tsx` : import retiré ; `MyDeliveriesRoute` modifié pour
  que la branche `SUPPLIER` redirige désormais vers
  `/supplier/delivery-status` au lieu de rendre la page retirée — la
  branche `DELIVERY_COMPANY` (redirection vers
  `/delivery/business?tab=my-deliveries`) reste inchangée. La route
  `/delivery/my-deliveries` elle-même reste enregistrée avec les mêmes
  `allowedRoles={["DELIVERY_COMPANY","SUPPLIER"]}`/`requireApproved` via
  `ProtectedRoute`, donc un utilisateur non autorisé est toujours redirigé
  vers `/` avant même d'atteindre la redirection — impossible de contourner
  l'authentification ou les restrictions d'accès via cette route retirée.
- `client/src/components/delivery/supplier-delivery-tabs.tsx` : entrée
  « My Deliveries » retirée du tableau `TABS` ; composant lui-même
  conservé (toujours utilisé par Drivers/Véhicules).

## 3. Garde-fous respectés

- **Aucun fichier serveur touché** (`git status` confirme zéro diff sous
  `server/`) : `storage.assignDriver`/`reassignDriver`/`dispatchDelivery`,
  les routes `PATCH /api/deliveries/:id/{assign,reassign,dispatch}`, les
  vérifications de propriété chauffeur/livraison, les transitions d'état,
  les écritures de ledger financier et les clés d'idempotence sont restés
  strictement inchangés — l'intégrité financière est garantie par
  construction, pas seulement par test.
- Aucun enregistrement de livraison dupliqué : l'assignation migrée appelle
  exactement la même mutation `useAssignDriver` sur le même `delivery.id`.
- Aucune permission affaiblie : la page reste protégée par le même
  `ProtectedRoute allowedRoles={["SUPPLIER"]}` qu'avant ; les vérifications
  de propriété chauffeur/livraison restent côté serveur, jamais dupliquées
  côté client.
- Distinction Chauffeurs du fournisseur / Entreprise de livraison
  entièrement préservée : la nouvelle condition d'affichage teste
  explicitement `d.deliveryMode === "SUPPLIER"`, jamais inférée du badge de
  statut affiché — aucune action d'assignation fournisseur n'apparaît sur
  une livraison `DELIVERY_COMPANY` (vérifié sur données réelles, §4).
- Rôles Driver/Delivery Company/Admin non affectés : `pages/delivery/my-
  deliveries-page.tsx` (Entreprise de livraison, fichier différent) non
  touché ; ses propres hooks (`useReassignDriver`, `useDeliveryCompanyDrivers`)
  non modifiés.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès (client + serveur).
- `git status --short` final : uniquement `App.tsx`,
  `supplier-delivery-tabs.tsx`, `delivery-status-page.tsx` modifiés et
  `my-deliveries-page.tsx` (Fournisseur) supprimé — **zéro fichier serveur,
  schéma, ou page Delivery Company/Driver touché**.
- Grep final : zéro référence restante à `SupplierMyDeliveriesPage`/
  `supplier/my-deliveries-page` en dehors de commentaires explicatifs ;
  toutes les autres occurrences de « My Deliveries »/`my-deliveries-page`
  restantes dans le dépôt pointent vers le fichier distinct de l'Entreprise
  de livraison (`pages/delivery/my-deliveries-page.tsx`), confirmé non
  concerné par cette tâche.
- Redémarrage du serveur de dev ; `GET /api/deliveries` répond toujours
  (401 attendu sans authentification, confirmant que la route existe
  toujours).
- **Vérification sur données réelles** (lecture seule, via
  `storage.getDeliveries(2, "SUPPLIER")`, script temporaire supprimé après
  usage) : confirmé que les 46 livraisons réelles du fournisseur #2
  produisent exactement le comportement attendu avec la nouvelle
  condition —
  - Livraisons #44/#45 (`ACCEPTED`, `SUPPLIER`, aucun chauffeur) →
    `AssignDriverControl` s'affiche, comme sur l'ancienne page My
    Deliveries.
  - Livraison #53 (`ACCEPTED`, `DELIVERY_COMPANY`) → aucune action
    d'assignation fournisseur affichée (correct — ce n'est pas au
    fournisseur d'assigner un chauffeur pour une livraison gérée par une
    entreprise externe).
  - Livraisons #17/#10 (`ASSIGNED`, `SUPPLIER`, chauffeur « Ahmed ») →
    nom du chauffeur affiché + bouton « Changer de chauffeur » disponible.
  - Toutes les livraisons `ASSIGNED` en mode `DELIVERY_COMPANY` → bouton
    « Changer de chauffeur » toujours disponible, comportement inchangé.
  - Aucune requête d'écriture exécutée pendant cette vérification —
    lecture seule, aucune donnée réelle modifiée.

## 5. Résumé des livrables

1. **Fichiers modifiés** : `client/src/App.tsx`,
   `client/src/components/delivery/supplier-delivery-tabs.tsx`,
   `client/src/pages/supplier/delivery-status-page.tsx`. **Fichier
   supprimé** : `client/src/pages/supplier/my-deliveries-page.tsx`.
2. **Intégration assignation/réassignation** : `AssignDriverControl` migré
   sur les cartes Delivery Status (condition `ACCEPTED` + mode
   `SUPPLIER`) ; la réassignation (« Changer de chauffeur ») était déjà
   unifiée entre les deux pages avant cette tâche et reste inchangée.
3. **Retrait de My Deliveries** : page supprimée, route
   `/delivery/my-deliveries` conservée mais redirige désormais la branche
   Fournisseur vers `/supplier/delivery-status` (via `ProtectedRoute`,
   mêmes contrôles de rôle/approbation qu'avant) ; entrée de switcher
   retirée ; bouton « Suivant » obsolète retiré.
4. **APIs/dépendances backend conservées** : `PATCH
   /api/deliveries/:id/{assign,reassign,dispatch}`, `storage.assignDriver`/
   `reassignDriver`/`dispatchDelivery`, tout le code de ledger financier et
   d'idempotence, `useReassignDriver` (toujours utilisé par la page
   Entreprise de livraison) — aucun fichier serveur modifié.
5. **Tests financiers/autorisation** : confirmés par construction (zéro
   diff serveur) plutôt que par mutation de données réelles — aucune
   écriture de test effectuée sur `assignDriver`/`reassignDriver`/ledger
   pour ne jamais risquer de données financières réelles ; la couverture
   fonctionnelle a porté sur la lecture de données réelles (§4) pour
   confirmer la logique d'affichage des cartes.

## 6. Limites connues

- Aucun navigateur réel disponible pour cliquer effectivement sur
  « Assigner »/« Changer de chauffeur » dans l'UI ; vérifié par lecture de
  code, type-checking strict, build de production réussi, et lecture
  directe de données réelles confirmant que chaque état de livraison
  existant produit la bonne action sur la carte. Une vérification
  manuelle en conditions réelles (assignation effective, retour
  utilisateur, absence d'erreurs console) reste recommandée avant mise en
  production.
- Aucune écriture de test effectuée sur les mutations d'assignation elles-
  mêmes (délibéré, pour ne pas risquer de créer de vraies entrées de
  ledger/notifications sur des comptes réels) — la garantie d'intégrité
  financière repose sur le fait qu'aucun fichier serveur n'a été modifié,
  pas sur un test d'exécution de la mutation.

---

# Analyse — Update Supplier Delivery Reassignment Actions

## 1. Audit préalable

### 1.1 État actuel de la carte (avant modification)

- Fichier concerné : `client/src/pages/supplier/delivery-status-page.tsx`,
  fonction `renderDeliveryCard`.
- Libellés de statut (`DELIVERY_STATUS_META`,
  `components/delivery/delivery-details.tsx:15-17`) :
  `AVAILABLE` → « Disponible », `ACCEPTED` → « Acceptée », `ASSIGNED` →
  « Assignée ».
- Avant cette tâche, la zone d'actions ne s'affichait que pour :
  `PENDING` (bouton Dispatcher), `ASSIGNED` (bouton « Changer de
  chauffeur », ouvre `DispatchDialog`), et `ACCEPTED` **uniquement** en
  mode `SUPPLIER` (contrôle `AssignDriverControl`, migré lors de la tâche
  précédente). **Aucune action n'existait pour `AVAILABLE`, ni pour
  `ACCEPTED` en mode `DELIVERY_COMPANY`.**

### 1.2 Cause du vide fonctionnel — `storage.dispatchDelivery`

- `server/storage.ts:1527-1531` (avant modification) : la garde de statut
  n'acceptait que `['PENDING', 'ASSIGNED']`. Appeler cette méthode depuis
  `AVAILABLE` ou `ACCEPTED` aurait donc levé l'erreur « Delivery is not
  awaiting dispatch, or does not belong to you » — il n'existe **aucun
  autre** mécanisme de réassignation vers une entreprise de livraison
  externe ailleurs dans le code (confirmé par recherche exhaustive de
  `reassign` dans `server/routes.ts` : la seule route `/reassign`
  existante, `PATCH /api/deliveries/:id/reassign`, appelle
  `storage.reassignDriver`, qui ne gère que le changement de **chauffeur**
  sur une livraison déjà `ASSIGNED`, jamais le changement d'entreprise de
  livraison).
- Conclusion : le bouton « Réassigner » demandé pour `Disponible`/
  `Acceptée` (entreprise de livraison) ne pouvait fonctionner qu'en
  réutilisant le même `DispatchDialog`/`dispatchDelivery` déjà utilisé pour
  `PENDING`/`ASSIGNED`, ce qui nécessite d'élargir la garde de statut de
  cette méthode — changement backend minimal mais réel, nécessaire pour
  que le bouton demandé soit fonctionnel plutôt qu'une simple façade
  renvoyant une erreur à chaque clic.

### 1.3 Pourquoi ce changement est sûr financièrement

- `isRedispatch` (ligne `const isRedispatch = current.status === 'ASSIGNED'`)
  reste **inchangé** — seul `status === 'ASSIGNED'` déclenche le
  nettoyage du ledger (`updateLedgerEntriesStatus(..., 'CALCULATED',
  'VOID', tx)`) et la réinitialisation des champs de prix/paiement figés.
  Pour `AVAILABLE`/`ACCEPTED`, aucun chauffeur n'a jamais été assigné à ce
  stade (`assignDriver` ne s'exécute qu'après `ACCEPTED`), donc aucune
  entrée de ledger n'existe encore pour cette livraison — rien à annuler,
  rien à réinitialiser. Le chemin « nouvelle dispatch » (sans réinitialiser
  les champs de prix) s'applique simplement une seconde fois, exactement
  comme pour une livraison `PENDING` qui n'a jamais été dispatchée.
- Le contrôle de propriété (`current.supplierId !== supplierId`) et la
  mise à jour atomique par comparaison-et-échange
  (`WHERE (id, supplierId, status=current.status)`) restent identiques et
  s'appliquent de la même manière, quel que soit le statut de départ.

## 2. Implémentation

### 2.1 Backend (`server/storage.ts`, `server/routes.ts`)

- `storage.dispatchDelivery` : garde de statut élargie de
  `['PENDING', 'ASSIGNED']` à `['PENDING', 'AVAILABLE', 'ACCEPTED',
  'ASSIGNED']`. Aucune autre ligne de la méthode modifiée — `isRedispatch`,
  la transaction, la mise à jour atomique, et toute la logique de
  réinitialisation restent exactement comme avant.
- Docstring de la méthode (`server/storage.ts`, juste au-dessus) et
  commentaire de la route `PATCH /api/deliveries/:id/dispatch`
  (`server/routes.ts`) mis à jour pour documenter les deux nouveaux états
  d'entrée.
- Aucune autre route, aucun autre endpoint, aucune logique de ledger/
  notification modifiée.

### 2.2 Frontend (`client/src/pages/supplier/delivery-status-page.tsx`)

- Condition d'affichage de la zone d'actions élargie pour inclure
  `ACCEPTED` (tout mode) et `AVAILABLE` + mode `DELIVERY_COMPANY`.
- Nouveau bouton « Réassigner » (`data-testid="button-reassign-available-
  ${d.id}"`) pour `status === "AVAILABLE" && deliveryMode ===
  "DELIVERY_COMPANY"` — appelle `setDispatchTarget(d)`, exactement le même
  handler que les boutons Dispatcher/Changer de chauffeur existants, ouvre
  le même `DispatchDialog` partagé.
- Nouveau bouton « Réassigner » (`data-testid="button-reassign-accepted-
  ${d.id}"`) pour `status === "ACCEPTED" && deliveryMode ===
  "DELIVERY_COMPANY"` — même mécanisme. Le cas `ACCEPTED && deliveryMode
  === "SUPPLIER"` (déjà `AssignDriverControl`, tâche précédente) reste
  totalement inchangé et distinct — les deux branches ne peuvent jamais
  se chevaucher puisque `deliveryMode` ne prend qu'une seule valeur par
  livraison.
- Bouton existant `ASSIGNED` : libellé changé de « Changer de chauffeur »
  à « Réassigner » — aucune autre modification (même `onClick`, même
  `data-testid`, même position/style).
- Aucun autre élément de la page (filtres, compteurs, pagination, détails,
  navigation) modifié.

## 3. Garde-fous respectés

- Aucune donnée ni table de livraison supprimée ; aucun historique modifié.
- Aucun enregistrement dupliqué : le bouton « Réassigner » agit toujours
  sur `d.id`, la même ligne `deliveries`.
- Aucune permission affaiblie : le contrôle de propriété
  (`current.supplierId !== supplierId`) et `requireApprovedSupplier` sur la
  route restent inchangés.
- Distinction Chauffeurs du fournisseur / Entreprise de livraison
  préservée : les nouveaux boutons ne s'affichent que pour
  `deliveryMode === "DELIVERY_COMPANY"`, jamais pour les livraisons
  gérées par les propres chauffeurs du fournisseur à ces statuts
  (`ACCEPTED && SUPPLIER` garde son propre contrôle `AssignDriverControl`,
  distinct et inchangé).
- Aucun changement de tarification, de frais, de paiement chauffeur, ni
  d'entrée de ledger (voir §1.3) — confirmé par lecture de code ET par
  test fonctionnel réversible (voir §4).

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès (client + serveur).
- Redémarrage du serveur de dev ; aucune erreur dans les logs serveur
  après redémarrage.
- **Test fonctionnel réversible sur donnée réelle** (livraison #53,
  fournisseur #2, `status=ACCEPTED`, `deliveryMode=DELIVERY_COMPANY`,
  `deliveryCompanyId=29`) :
  1. Capture de l'état exact de la ligne avant modification.
  2. Appel direct de `storage.dispatchDelivery(53, 2, "DELIVERY_COMPANY")`
     (sans cible précise — équivalent du choix « Entreprise de livraison »
     du dialogue) depuis le statut `ACCEPTED` — **confirmé réussi** (ne
     levait plus d'erreur comme avant le changement) : la ligne passe à
     `status="AVAILABLE"`, `deliveryCompanyId=null`, exactement le
     comportement attendu du bouton « Réassigner ».
  3. Ligne restaurée explicitement à son état exact d'origine
     (`status`, `deliveryMode`, `deliveryCompanyId`, `acceptedAt`) via une
     requête SQL ciblée sur les 4 colonnes modifiées, confirmée par la
     clause `RETURNING` de la requête elle-même.
  4. Aucune entrée de ledger créée ou modifiée pendant ce test (confirmé
     par construction : `isRedispatch` est resté `false` sur ce chemin,
     donc `updateLedgerEntriesStatus` n'a jamais été appelée).
- Le cas `AVAILABLE` n'a pas été testé séparément en écriture (même chemin
  de code exact que `ACCEPTED`, seule la valeur testée dans le même
  tableau de statuts autorisés change) — jugé redondant par rapport au
  test ci-dessus pour un risque équivalent sur des données réelles ;
  confirmé uniquement par lecture de code et par la présence de
  livraisons réelles `AVAILABLE`/`DELIVERY_COMPANY` en base (fournisseur
  #2, 2 lignes, constaté lors de l'audit de la tâche précédente).
- `git status --short` final : uniquement `server/storage.ts`,
  `server/routes.ts` (commentaires + garde de statut élargie) et
  `client/src/pages/supplier/delivery-status-page.tsx` modifiés.

## 5. Résumé des livrables

1. **Fichiers modifiés** : `server/storage.ts` (garde de statut de
   `dispatchDelivery` élargie, docstring mise à jour),
   `server/routes.ts` (commentaire de route mis à jour),
   `client/src/pages/supplier/delivery-status-page.tsx` (deux nouveaux
   boutons « Réassigner », un libellé renommé).
2. **Changement backend nécessaire** : la garde de statut de
   `storage.dispatchDelivery` a dû être élargie de
   `['PENDING','ASSIGNED']` à `['PENDING','AVAILABLE','ACCEPTED','ASSIGNED']`
   — sans cela, les boutons demandés auraient échoué à chaque clic. Aucune
   autre logique (ledger, notifications, transactions, contrôle de
   propriété) modifiée.
3. **Réutilisation** : les trois boutons « Réassigner » (Disponible/
   Acceptée pour entreprise externe, Assignée pour chauffeur) ouvrent tous
   le même `DispatchDialog` déjà existant — aucun second système de
   réassignation créé.
4. **Tests financiers/autorisation** : vérifiés par lecture de code (zéro
   changement du chemin ledger) et par un test fonctionnel réversible en
   base réelle, restauré explicitement à l'identique après coup.

## 6. Limites connues

- Aucun navigateur réel disponible pour cliquer effectivement sur les
  nouveaux boutons dans l'UI ; vérifié par lecture de code, type-checking
  strict, build de production réussi, et test fonctionnel direct
  (réversible) de la méthode backend concernée.
- Le cas `AVAILABLE` a été vérifié uniquement par lecture de code et
  données réelles existantes, pas par une mutation réversible dédiée
  (voir §4) — risque jugé négligeable étant le même chemin de code que le
  cas `ACCEPTED` testé.

---

# Analyse — Admin Services Hero Personalization Reorganization

## 1. Audit préalable

### 1.1 Les deux composants actuels

- `HeroActionsSection` (`client/src/pages/admin/system-management-page.tsx:356-433`) :
  carte indépendante listant les 6 services (`HERO_SERVICES`), chacun avec
  2 switches (Recherche rapide / Signaler). Persistance : table
  `heroActionSettings` (une ligne par service, `shared/schema.ts`), lue via
  `GET /api/hero-actions` (`useHeroActionSettings()`,
  `client/src/hooks/use-hero-actions.ts`), écrite via
  `PATCH /api/admin/hero-actions/:service` (`requireAdmin`). Application
  **immédiate** à chaque bascule de switch (pas de brouillon/Enregistrer —
  `updateMutation.mutate` part dès `onCheckedChange`).
- `ServiceHeroCustomizationSection` (lignes 461-856 avant modification) :
  carte séparée avec sélecteur des 6 services, puis pour le service
  sélectionné : brouillon local (`draft`, distinct de la valeur enregistrée
  `saved`) couvrant arrière-plan (images/rotation/calque), dégradé,
  sous-titre (texte/visibilité/couleurs clair-sombre), hauteur/position,
  ligne d'info, plus un aperçu en direct et des boutons Enregistrer/
  Réinitialiser explicites. Persistance : table `serviceHeroConfigs`
  (`GET /api/service-hero-config`, `PATCH
  /api/admin/service-hero-config/:service`) — **table et route
  entièrement distinctes** de celles de `HeroActionsSection`.
- **Les deux composants sont déjà rendus à la suite dans l'onglet
  « Services »** (`<HeroActionsSection /><ServiceHeroCustomizationSection
  />`, ~ligne 2528-2529) — doublon d'interface explicitement visé par
  cette tâche, pas de doublon de données (les deux tables restent
  distinctes et nécessaires).

### 1.2 Mécanique de persistance — ce qui doit rester séparé

- Les deux tables (`heroActionSettings` et `serviceHeroConfigs`) sont
  **volontairement distinctes** dans l'implémentation existante (commentaire
  explicite dans `shared/schema.ts` : « Separate table/key set again (same
  reasoning as heroActionSettings above) »). Aucune preuve que les fusionner
  apporterait un bénéfice ; la tâche demande explicitement de ne pas
  renommer/supprimer de champs sans nécessité prouvée. **Décision : fusion
  de l'interface uniquement, les deux tables/routes/hooks backend restent
  inchangés.**
- Conséquence directe : Recherche rapide/Signaler continuent de
  s'appliquer **immédiatement** au clic (comme avant), indépendamment du
  brouillon/bouton Enregistrer du reste du hero (arrière-plan/sous-titre/
  position) — ce sont deux mécanismes de sauvegarde différents, rendus
  dans la même carte mais gardant chacun son propre comportement existant.
  Mélanger les deux dans un seul brouillon aurait changé le comportement
  observable (un admin pourrait s'attendre à ce que Recherche rapide se
  sauvegarde immédiatement, comme aujourd'hui) — risque explicitement à
  éviter par la tâche (« preserve existing behavior »).

### 1.3 Partage entre services

- Aucun champ n'est partagé entre services : chaque ligne des deux tables
  est scoping par `service` (clé unique), et chaque composant ne lit/écrit
  jamais qu'un seul service à la fois (`selected`). Changer de service
  dans le sélecteur ne fait que changer quelle ligne est lue/affichée —
  aucune fuite de configuration entre services possible par construction
  (confirmé par le test de la tâche "Unify Supplier Delivery Management"
  et par simple lecture : `draft`/`local` sont toujours réinitialisés
  depuis la valeur serveur du service nouvellement sélectionné).

### 1.4 Aperçu — fidélité actuelle

- `ServiceHeroCustomizationSection`'s preview utilise déjà le même
  composant partagé `ServiceHeroShell`/`ServiceHeroBackground` que les 6
  vraies pages (pas de logique de rendu dupliquée) — arrière-plan/calque/
  dégradé/sous-titre/couleur/ligne d'info déjà fidèles au brouillon en
  cours d'édition.
- **Absent avant cette tâche** : aucune représentation des actions Hero
  (Recherche rapide/Signaler) dans l'aperçu — logique, puisque ces
  réglages vivaient dans un composant séparé, sans lien avec `draft`.

### 1.5 Risques identifiés

- Risque de régression de persistance si les 2 switches sont absorbés
  dans le `draft`/`saveMutation` existant (nécessiterait un appel API
  combiné, inexistant, ou deux appels dont un seul serait fiable) — évité
  en gardant leur mutation immédiate indépendante (§1.2).
  Risque de confusion si la carte entière devient trop longue sur mobile —
  traité en §2 (disposition en une seule colonne empilée, aperçu avant les
  réglages).
- Risque de faux sentiment de fonctionnement si l'aperçu affichait des
  icônes cliquables pour Recherche rapide/Signaler — traité en rendant ces
  icônes purement visuelles (`<div>`, pas `<button>`, aucun gestionnaire
  de clic).
- Aucun risque de compatibilité arrière identifié : aucune table, route,
  champ ni valeur par défaut n'est modifiée par cette tâche — uniquement
  la disposition et l'emplacement des contrôles dans l'interface Admin.

## 2. Implémentation

### 2.1 Fusion de l'interface

- `HeroActionsSection` (fonction entière, lignes 356-433) supprimée après
  migration de sa logique dans `ServiceHeroCustomizationSection` : mêmes
  hooks (`useHeroActionSettings`), même mutation
  (`PATCH /api/admin/hero-actions/:service`), même pattern de state local
  optimiste (`local`/`value`) — recopié à l'identique, simplement reciblé
  sur le service actuellement sélectionné (`selected`) au lieu d'itérer
  les 6 services dans sa propre carte.
- Les deux switches (Recherche rapide/Signaler) rendus dans une nouvelle
  sous-section « Actions Hero » clairement séparée (`border
  border-border/50 rounded-xl p-4`, même style que les autres blocs),
  placée dans la colonne de gauche sous Arrière-plan/Dégradé.
- Appel `<HeroActionsSection />` retiré de l'onglet Services.

### 2.2 Nouvelle disposition

- Structure reconstruite dans l'ordre exact demandé : titre (inchangé,
  description complétée pour mentionner les actions) → sélecteur de
  service (inchangé, pleine largeur) → **aperçu pleine largeur avec
  boutons Enregistrer/Réinitialiser juste en dessous** (déplacé hors de la
  grille à deux colonnes) → grille à deux colonnes :
  - **Colonne gauche** : Images d'arrière-plan (+ rotation + calque),
    Dégradé personnalisé, puis Actions Hero (Recherche rapide/Signaler).
  - **Colonne droite** : Sous-titre (texte/défaut/visibilité/couleurs
    clair-sombre), Hauteur & Position, Ligne d'info.
- Sur mobile (`grid-cols-1` hérité, aucune classe ajoutée en dessous de
  `lg:`), l'ordre source place déjà l'aperçu avant les deux colonnes de
  réglages, qui s'empilent verticalement — satisfait "preview before
  configuration controls" sans code responsive supplémentaire.
- Aperçu enrichi : nouveau `controlsRow` (prop déjà supportée par
  `ServiceHeroShell`, utilisée par les vraies pages) affichant une icône
  Recherche rapide/Signaler **uniquement si activée** pour le service
  sélectionné — rendu en `<div>` simples (jamais `<button>`), sans
  `onClick`, pour qu'une interaction ne déclenche jamais d'action réelle.

## 3. Garde-fous respectés

- Aucune table, route, ou champ backend modifié — `heroActionSettings`
  et `serviceHeroConfigs` restent deux mécanismes de persistance distincts
  et inchangés (vérifié par `git status`, zéro fichier serveur touché).
- Aucune configuration existante réinitialisée : chaque service continue
  de charger sa propre ligne dans chacune des deux tables, exactement
  comme avant.
- Aucune synchronisation involontaire entre services : la mutation des
  actions Hero cible explicitement `selected`, jamais une boucle sur les 6
  services.
- Comportement de sauvegarde préservé à l'identique : Recherche rapide/
  Signaler restent à application immédiate (pas de brouillon), le reste du
  hero reste à brouillon + Enregistrer explicite — aucun changement de
  comportement observable pour un admin déjà familier avec l'un ou
  l'autre mécanisme.
- Authentification/autorisation inchangées : mêmes routes
  `requireAdmin`/`PATCH .../:service` qu'avant.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès (client + serveur).
- `git status --short` final : **un seul fichier applicatif modifié**
  (`client/src/pages/admin/system-management-page.tsx`) + `analyse.md` —
  aucun fichier serveur, schéma, route ou hook touché, confirmant que la
  persistance des deux fonctionnalités (`heroActionSettings` et
  `serviceHeroConfigs`) est restée strictement inchangée.
- Redémarrage du serveur de dev ; `GET /api/hero-actions` et
  `GET /api/service-hero-config` répondent tous les deux avec leurs
  données réelles existantes (ex. SHOP affiche toujours ses images
  d'arrière-plan et son `infoRowEnabled: false` déjà enregistrés par une
  tâche précédente), confirmant qu'aucune configuration existante n'a été
  réinitialisée ou perdue par la réorganisation de l'interface.
- Grep final : zéro référence restante à `HeroActionsSection` en dehors
  des commentaires explicatifs mis à jour ; `HERO_SERVICES`, `Zap`,
  `Search`, `Flag` et les autres identifiants partagés confirmés toujours
  utilisés ailleurs dans le fichier (aucun import désormais mort).
- Relecture manuelle de la nouvelle structure JSX : titre → sélecteur
  (pleine largeur) → aperçu pleine largeur + boutons Enregistrer/
  Réinitialiser → grille à deux colonnes (gauche : Arrière-plan, Dégradé,
  Actions Hero ; droite : Sous-titre, Hauteur & Position, Ligne d'info) —
  conforme à la hiérarchie demandée. Sur mobile, l'absence de classes
  `lg:` sur les wrappers fait retomber l'ensemble en une seule colonne
  dans l'ordre source (aperçu avant les réglages), sans code responsive
  dédié supplémentaire.
- Revue des gestionnaires d'aperçu : les icônes Recherche rapide/Signaler
  de l'aperçu sont des `<div>` sans `onClick` — confirmé par relecture
  qu'aucune interaction ne peut déclencher la vraie mutation ou une action
  de service réelle.

## 5. Résumé des livrables

1. **Fichier modifié** : `client/src/pages/admin/system-management-page.tsx`
   uniquement. Aucun fichier serveur, schéma, route ou hook touché.
2. **Fusion réalisée** : les switches Recherche rapide/Signaler de
   l'ancienne carte « Actions Hero Services » sont désormais dans une
   sous-section « Actions Hero » à l'intérieur de « Personnalisation des
   Hero Services » (colonne gauche), scopée au service actuellement
   sélectionné. La carte séparée et sa fonction `HeroActionsSection` ont
   été supprimées une fois la migration vérifiée.
3. **Persistance inchangée** : `heroActionSettings`/`GET+PATCH
   /api/(admin/)hero-actions` (Recherche rapide/Signaler, application
   immédiate) et `serviceHeroConfigs`/`GET+PATCH
   /api/(admin/)service-hero-config` (le reste, brouillon + Enregistrer)
   restent deux mécanismes totalement distincts et inchangés — confirmé
   par l'absence de tout diff serveur.
4. **Nouvelle disposition** : titre → sélecteur pleine largeur → aperçu
   pleine largeur (avec Enregistrer/Réinitialiser) → deux colonnes de
   réglages, conforme point par point à la hiérarchie demandée dans la
   tâche.
5. **Aperçu enrichi** : reflète désormais aussi l'état Recherche
   rapide/Signaler du service sélectionné, sans jamais pouvoir déclencher
   une action réelle (icônes non interactives).

## 6. Risques restants / limites connues

- Aucun navigateur réel disponible pour valider visuellement la
  disposition responsive exacte (colonnes/empilement mobile) ; vérifié
  par lecture de code (classes Tailwind `grid-cols-1 lg:grid-cols-2`
  déjà utilisées ailleurs dans ce même fichier pour un résultat
  identique) et par build de production réussi.
- Léger changement de timing non fonctionnel : les switches Recherche
  rapide/Signaler attendent désormais le même état de chargement
  (`isLoading`) que le reste du hero (puisqu'ils sont rendus dans le même
  bloc conditionnel) au lieu d'avoir leur propre état de chargement
  indépendant comme avant. Les deux requêtes sont rapides et mises en
  cache ; aucun impact fonctionnel constaté, mais signalé par exhaustivité
  puisque ce n'est pas un comportement strictement identique au pixel/
  milliseconde près.

---

# Analyse — Hero Personalization UI Reorganization and Theme Consistency

## 1. Audit préalable

### 1.1 Le toggle clair/sombre réel du Coffee Owner

- `client/src/components/cafe/marketplace-layout.tsx` (navbar réelle,
  ~ligne 3231-3243) : bouton unique, pas deux boutons séparés —
  `onClick={() => toggle()}` (store global), `aria-label="Toggle theme"`,
  classes `w-8 h-8 rounded-full flex items-center justify-center
  transition-colors shrink-0`, fond `bg-gray-800 hover:bg-gray-700` (sombre)
  / `bg-gray-100 hover:bg-gray-200` (clair), icône `Sun` `text-amber-400`
  quand sombre actif / `Moon` `text-gray-500` quand clair actif.
- `client/src/store/theme-store.ts` : **store Zustand global unique**,
  explicitement documenté comme partagé par « l'ensemble de l'application
  Coffee Owner ». **Risque identifié** : appeler `toggle()` directement
  depuis l'aperçu Admin modifierait ce même état global partagé — exactement
  le risque que la tâche interdit explicitement (« must not unexpectedly
  change... the coffee owner's saved theme preference »). **Décision** :
  réutiliser l'icône/les classes exactes du bouton réel, mais le câbler sur
  l'état local `previewDark` déjà existant dans le composant Admin, jamais
  sur `useThemeStore`/`toggle()`.

### 1.2 Icônes réelles des actions Hero (Recherche rapide / Signaler)

Vérifié directement dans les 5 pages réelles qui les affichent déjà
(Maintenance/Barista/Academy/Print/Marketing — SHOP n'en a pas encore,
voir §1.4) :

- **Signaler** (`reportEnabled`) → icône `Ban`, uniforme sur les 5
  services : `w-8 h-8 rounded-full flex items-center justify-center
  transition-all`, sombre = `bg-gray-800 hover:bg-gray-700 text-red-400`,
  clair = `bg-white/20 hover:bg-white/30 text-white`.
- **Recherche rapide** (`fastSearchEnabled`) → icône `Zap`, même fond,
  couleur d'accent **spécifique à chaque service en mode sombre** (blanc
  uniforme en mode clair) : Maintenance=`orange-400`, Barista=`green-400`,
  Academy=`indigo-400`, Print=`blue-400`, Marketing=`purple-400`.
- L'ancien composant utilisait des icônes génériques (`Search`/`Flag`),
  sans rapport avec les vraies icônes (`Zap`/`Ban`) — écart identifié et
  corrigé (voir §2).

### 1.3 Comment le vrai hero applique les thèmes — éléments vérifiés un par un

- **Icône de service** (boîte arrondie) : sombre = `bg-gray-800/80 border
  border-gray-700` + icône `text-amber-400` ; clair = `bg-white/20` + icône
  `text-white`. L'aperçu codait en dur le traitement clair, sans jamais
  basculer avec `previewDark` — corrigé.
- **Titre** : "BigBoss" toujours `text-white` (confirmé identique sur les
  6 services) ; le nom du service (span) suit `text-amber-400`
  (sombre)/`text-amber-200` (clair), uniforme sur les 6 — l'aperçu codait
  en dur `text-amber-200` sans branchement — corrigé.
- **Sous-titre et ligne d'info (couleur par défaut)** : sombre = `text-
  white` sur les 6 services (vérifié par grep direct) ; clair = une teinte
  pastel **spécifique à chaque service** (`amber-100` Shop, `orange-100`
  Maintenance, `green-100` Barista, `indigo-100` Academy, `blue-100`
  Print, `purple-100` Marketing) — l'aperçu codait en dur `text-amber-
  50/90`/`text-amber-50/80` indépendamment du service et du thème —
  corrigé via une nouvelle table `SERVICE_LIGHT_TEXT`.
- **Arrière-plan par défaut (quand aucune image/dégradé personnalisé
  n'est configuré)** : radicalement différent par service — Shop et
  Maintenance utilisent un dégradé CSS pur (couleurs différentes entre
  eux) ; Barista et Academy partagent la même image réelle
  (`baristaHeroImg`) avec un calque de couleur différent (vert vs indigo) ;
  Print et Marketing utilisent chacun leur propre image
  (`printBannerImg`/`marketingHeroImg`). **L'aperçu utilisait un dégradé
  gris/ambre générique identique pour les 6 services, sans aucun rapport
  avec le vrai arrière-plan par défaut de chacun** — écart majeur, corrigé
  en réimportant les mêmes fichiers image que les vraies pages et en
  reproduisant exactement chaque branche JSX (voir §2).
- **Calque transparent, dégradé personnalisé, rotation d'images** : déjà
  fidèles avant cette tâche — l'aperçu utilise déjà le composant partagé
  réel `ServiceHeroBackground`/`ServiceHeroShell` pour tout ce qui est
  **configuré par l'admin** ; seul le **repli par défaut** (`
  defaultBackground`, utilisé quand rien n'est configuré) était un
  générique non fidèle.

### 1.4 Cas particulier : Shop

- SHOP n'a aujourd'hui aucune icône Recherche rapide/Signaler réelle sur
  sa page (commentaire existant dans `HERO_SERVICES` : « SHOP has no Fast
  Search/Report icons yet »). Son seul bouton d'action réel est « Flash
  Mode » (`Zap` rempli `text-amber-400 fill-amber-400`, non branché par
  thème). En l'absence d'équivalent réel pour Recherche rapide/Signaler,
  la table `SERVICE_FASTSEARCH_ACCENT_DARK`/`SERVICE_LIGHT_TEXT` utilise
  `amber` pour Shop — la couleur déjà établie et réellement utilisée par
  Shop ailleurs sur sa propre page, plutôt qu'une couleur inventée.

### 1.5 Risques identifiés avant implémentation

- Risque de fuite du thème global si le bouton d'aperçu appelait
  `useThemeStore`/`toggle()` — évité en gardant `previewDark` strictement
  local au composant (§1.1).
- Risque de classes Tailwind non générées si des noms de classes étaient
  construits dynamiquement par interpolation de chaîne (ex.
  `` `to-${accent}-950/90` ``) — évité en écrivant chaque branche par
  service en JSX explicite et littéral, copié verbatim depuis le fichier
  réel correspondant, plutôt qu'en templating les noms de classes.
- Aucun risque de régression de données : aucune table, route, champ ou
  comportement de sauvegarde n'est concerné par cette tâche — uniquement
  la fidélité visuelle de l'aperçu et l'ordre d'affichage des panneaux de
  configuration.

## 2. Implémentation

### 2.1 Réorganisation de la colonne droite

- `client/src/pages/admin/system-management-page.tsx` : la section
  « Actions Hero » déplacée de la colonne gauche vers la colonne droite,
  nouvel ordre exact dans la colonne droite : **Actions Hero → Hauteur &
  Position → Sous-titre → Ligne d'info sous le sous-titre**. Colonne
  gauche inchangée dans son contenu (Images d'arrière-plan, Rotation,
  Calque transparent, Couleur/Opacité du calque, Dégradé personnalisé) —
  seule son commentaire a été mis à jour pour ne plus mentionner Actions
  Hero.
- Aucun réglage supprimé, renommé ou dont le comportement a changé —
  uniquement leur position dans le DOM/la grille.

### 2.2 Remplacement des boutons Clair/Sombre

- Les deux `Button` « Clair »/« Sombre » remplacés par un bouton unique
  reproduisant exactement le markup/les classes du vrai toggle de la
  navbar Coffee Owner (`marketplace-layout.tsx`), câblé sur l'état local
  `previewDark` existant (jamais sur `useThemeStore`). `aria-label` et
  `title` distincts de ceux du vrai bouton (« Aperçu — basculer... » / «
  Aperçu uniquement — n'affecte pas le thème réel ») pour que
  l'utilisateur comprenne sans ambiguïté qu'il s'agit d'un contrôle
  d'aperçu, pas du vrai sélecteur de thème de l'application.
- Conservé à son emplacement d'origine (ligne d'en-tête au-dessus de la
  boîte d'aperçu, à côté du libellé « Aperçu — {service} ») — satisfait
  « dans la zone d'aperçu du hero », « ne doit pas perturber la
  disposition existante de l'aperçu », et reste trivialement « facile à
  trouver sur desktop et mobile » puisqu'aucune nouvelle position/
  mécanique de superposition n'a été introduite.

### 2.3 Icônes des actions Hero — panneau de configuration et aperçu

- Dans le panneau de configuration « Actions Hero » (colonne droite) :
  icônes des libellés remplacées par `Zap` (Recherche rapide, au lieu de
  `Search`) et `Ban` (Signaler, au lieu de `Flag`) — mêmes couleurs
  `text-muted-foreground` qu'avant pour une icône de libellé de formulaire
  (traitement de bouton circulaire complet réservé à l'aperçu, voir
  ci-dessous).
- Dans l'aperçu (`controlsRow` du `ServiceHeroShell`) : icônes remplacées
  par les boutons circulaires `w-8 h-8 rounded-full` exacts du vrai hero —
  `Ban` rouge-400 (sombre)/blanc (clair) pour Signaler, `Zap` avec l'accent
  du service sélectionné (sombre)/blanc (clair) pour Recherche rapide —
  toujours rendus en `<div>` sans `onClick`, jamais en élément interactif.

### 2.4 Fidélité complète de l'aperçu au vrai hero (Partie 5)

- `defaultBackground` : nouveau composant `PreviewDefaultBackground({
  service, isDark })` reproduisant exactement la branche par défaut de
  chacune des 6 vraies pages (dégradés CSS pour Shop/Maintenance, images
  réelles réimportées pour Barista/Academy/Print/Marketing) — remplace le
  dégradé générique gris/ambre précédent.
- Boîte d'icône du service : branchée sur `previewDark` (`bg-gray-800/80
  border border-gray-700` + icône ambre en sombre, `bg-white/20` + icône
  blanche en clair) au lieu du traitement clair codé en dur.
- Span coloré du nom de service dans le titre : branché
  `previewDark ? "text-amber-400" : "text-amber-200"` au lieu de la
  valeur fixe précédente.
- Couleur par défaut du sous-titre et de la ligne d'info : désormais
  `previewDark ? "text-white" : SERVICE_LIGHT_TEXT[selected]` (nouvelle
  table par service) au lieu d'une teinte ambre générique fixe — la
  surcharge de couleur personnalisée (`getHeroSubtitleColorStyle`) reste
  strictement inchangée et continue de primer quand une couleur valide
  est enregistrée pour le thème actif.
- Calque transparent, dégradé personnalisé, rotation d'images : déjà
  fidèles (§1.3), aucun changement de code nécessaire au-delà du nouveau
  `defaultBackground` ci-dessus.

## 3. Garde-fous respectés

- Aucun fichier serveur, route, schéma ou hook touché (confirmé par
  `git status`) — uniquement `system-management-page.tsx`.
- Aucune configuration existante réinitialisée, aucune valeur par défaut
  modifiée au niveau des données — uniquement la fidélité visuelle de
  l'aperçu et l'ordre d'affichage des panneaux.
- `useThemeStore`/`toggle()` jamais appelé depuis l'aperçu — confirmé par
  lecture de code : `previewDark` reste un `useState` local au composant,
  totalement isolé du store global et de toute préférence réelle
  sauvegardée.
- Aucune icône dupliquée ni changement d'icône ailleurs dans
  l'application : `Zap`/`Ban`/`Sun`/`Moon` sont les icônes déjà utilisées
  par les vraies pages — seules leurs occurrences génériques
  (`Search`/`Flag`, boutons Clair/Sombre) dans ce composant Admin ont été
  remplacées ; aucun fichier de page réelle n'a été modifié.
- Comportement de sauvegarde/réinitialisation entièrement inchangé
  (aucune ligne touchée dans `saveMutation`/`resetMutation`).

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès ; taille du CSS légèrement réduite (185.47 Ko
  contre 186.02 Ko avant), cohérent avec la suppression de classes
  désormais inutiles plutôt qu'un ajout net.
- Vérifié que les 6 couleurs d'accent dynamiquement référencées
  (`text-amber-400`, `text-green-400`, `text-indigo-400`,
  `text-orange-400`, `text-blue-400`, `text-purple-400`) apparaissent
  chacune déjà comme chaîne littérale dans au moins un fichier réel déjà
  scanné par Tailwind (confirmé par les greps du §1.2/1.3) — aucune classe
  manquante au moment du build.
- `git status --short` final : uniquement
  `client/src/pages/admin/system-management-page.tsx` + `analyse.md`.
- Grep final : zéro référence restante aux icônes `Search`/`Flag` dans ce
  fichier en dehors de commentaires.
- Redémarrage du serveur de dev ; aucune erreur dans les logs serveur
  après redémarrage.

## 5. Limites connues

- Aucun navigateur réel disponible pour valider visuellement le rendu
  pixel-exact (positionnement du nouveau bouton toggle, rendu des 6
  arrière-plans par défaut, couleurs des icônes) ; vérifié par lecture de
  code comparant chaque classe/valeur à son équivalent exact dans la page
  réelle correspondante, type-checking strict, et build de production
  réussi.
- La taille/les proportions de l'aperçu restent délibérément plus
  compactes que le vrai hero (contrainte `max-h-72` existante, non
  modifiée par cette tâche) — seules les couleurs/traitements visuels ont
  été alignés, pas les dimensions absolues, conformément au périmètre
  demandé (cohérence visuelle, pas réplique pixel-perfect de la taille).

---

# Analyse — SHOP Filters: Category Names, Subcategory Icons, and French Localization

## 1. Audit préalable

### 1.1 Pourquoi certains noms de catégories apparaissaient tronqués

- `client/src/pages/cafe/browse-products.tsx` — composant `CategoryStrip`
  (défini dans ce même fichier), nom de catégorie rendu via
  `<span className="max-w-[72px] truncate">{cat.name}</span>`. **Confirmé
  par lecture de code et vérification directe en base** : `cat.name`
  provient tel quel de la table `categories` (`shared/schema.ts`), aucune
  troncature ni substitution côté JS — uniquement une largeur fixe de
  72px + ellipsis CSS. Requête SQL directe sur la table `categories` :
  les noms réels correspondent exactement aux exemples cités par la
  tâche (`CAFE`, `مشروبات`, `العاب`, `شيشا`, `النظافة`, `Dairy &
  Alternatives`, `BeIN`, `آلات`, `ديكور`, `Syrups & Flavors`, `Tea &
  Herbal`, `Snacks & Food`) — la donnée est déjà complète et correcte,
  seul l'affichage la coupait.

### 1.2 Pourquoi les icônes de sous-catégories étaient absentes

- `categories`/`subCategories` (`shared/schema.ts`) ont bien chacune leur
  propre colonne `icon: text("icon")`. `GET /api/categories` et
  `GET /api/subcategories` renvoient déjà cette colonne intégralement
  (vérifié en base : plusieurs sous-catégories réelles ont un `icon`
  configuré, ex. `Arabica Beans` → `☕`, `Gazouz` → `🥤`, `Cleaning` →
  `🧹`).
- Mais `browse-products.tsx` ne charge **jamais** `/api/subcategories` —
  sa liste de sous-catégories est entièrement dérivée de
  `product.subCategoryLabel` (venant de `/api/marketplace`), qui ne
  contient que `{ id, name }` : `server/storage.ts`, fonction
  `enrichProduct`, construit volontairement ce label réduit (type
  `TaxonomyLabel`, `shared/schema.ts`, qui n'a pas de champ `icon`) —
  l'icône est donc perdue à cette étape serveur précise, avant même
  d'atteindre le client. **Ce n'est pas un bug de mapping (mauvaise clé,
  icône de catégorie réutilisée par erreur) — l'icône n'arrive
  simplement jamais côté client pour les sous-catégories.** Le
  `SelectItem` de sous-catégorie (`browse-products.tsx`) ne rendait donc
  que `{sc.name}`, aucune icône.
- `client/src/pages/cafe/store-detail-page.tsx` (page sœur) résout déjà
  ses propres icônes de **catégorie** exactement de cette façon : une
  requête séparée vers `/api/categories` réduite en `Map<number,
  string>` (`categoryIconMap`, lignes 644-648), appliquée ensuite à sa
  liste de catégories dérivée des produits. **Aucun mapping équivalent
  n'existe pour les sous-catégories nulle part dans le code** — ni dans
  ce fichier, ni dans `store-detail-page.tsx`, ni dans `client/src/lib`
  (seuls des mappings PRINT/Marketing spécifiques existent là, sans
  rapport avec SHOP).
- **Décision** : reproduire exactement le même motif que
  `store-detail-page.tsx` utilise déjà pour les catégories, appliqué aux
  sous-catégories — une requête `GET /api/subcategories` (déjà publique,
  déjà complète) réduite en `Map<number, string>`, sans toucher au
  serveur ni au type `TaxonomyLabel` (qui reste utilisé ailleurs pour
  catégories/marques/saveurs/tailles — y ajouter un champ aurait un rayon
  d'impact plus large qu'une requête client supplémentaire, strictement
  additive et sans risque).

### 1.3 Inventaire de l'anglais dans la zone de filtres SHOP

Relevé exhaustif (fourni en détail par l'audit, avec références
fichier:ligne) : `"All"` (pilule catégorie), `aria-label="Search"`,
`"Search products…"`, `"Sub-Category"`/`"All Sub-Categories"`,
`"Brand"`/`"All Brands"`, `"Flavor"`/`"All Flavors"`,
`"Size"`/`"All Sizes"`, `"Sort by"`, `"Recommended"`, `"Price: Low to
High"`, `"Price: High to Low"`, `"Most Suppliers"`, `"Nearest First"`,
`"Reset"`, et dans la zone de résultats immédiatement adjacente (même
section de filtrage produit) : `"All Products"`/`"Products"` (titre),
`"{n} product(s) available"`, `"No products found"`, `"Try adjusting
your filters."`, `"Suppliers haven't listed any products yet."`,
`"Clear all filters"`.

### 1.4 Confirmation : aucun impact sur la logique de filtrage

- Le clic sur une catégorie utilise `cat.id` (numérique), jamais
  `cat.name` — `categoryId` filtre ensuite par comparaison d'id strict
  (`String(p.categoryId) === categoryId`). Relâcher la classe CSS de
  troncature ne peut donc pas changer ce qui est filtré.
- Le `value` de chaque `SelectItem` de sous-catégorie reste `sc.id`,
  inchangé ; ajouter une icône décorative à côté du texte n'affecte en
  rien `filters.subCategoryId` ni la comparaison d'id qui filtre
  `allProducts`. Confirmé par lecture complète des deux `useMemo` de
  filtrage (`categoryFiltered`/`filtered`) : aucun ne dépend de `name`
  ni `icon`.

## 2. Implémentation

### 2.1 Noms de catégories complets

- `CategoryStrip` : `max-w-[72px] truncate` remplacé par `max-w-[110px]
  whitespace-normal break-words leading-tight text-left`, autorisant le
  nom à s'enrouler sur 2 lignes au lieu d'être coupé avec une ellipse.
  Icône (`cat.icon || "📦"`) marquée `shrink-0` pour rester alignée
  verticalement même quand le libellé passe sur 2 lignes. Aucune donnée
  modifiée — uniquement l'affichage.

### 2.2 Icônes de sous-catégories

- Nouvelle requête `useQuery<SubCategoryWithDetails[]>(["/api/subcategories"])`
  dans le composant principal de `browse-products.tsx`, réduite en
  `subCategoryIconMap: Map<number, string>` via `useMemo` — motif
  identique à `categoryIconMap` de `store-detail-page.tsx`.
  `FilterBar` reçoit cette map en prop ; son `useMemo` `subCategories`
  attache désormais `icon: subCategoryIconMap.get(Number(id)) ?? null`
  à chaque entrée.
- Chaque `SelectItem` de sous-catégorie affiche maintenant
  `{sc.icon || "📦"} {sc.name}` — icône admin-configurée quand elle
  existe, repli générique `"📦"` sinon (même repli que `CategoryStrip`,
  pas un second système d'icônes).
- Zéro changement serveur, zéro changement de `TaxonomyLabel`, zéro
  changement aux identifiants/relations catégorie↔sous-catégorie —
  uniquement une requête client supplémentaire et un rendu d'icône en
  plus dans le `SelectItem` existant.

### 2.3 Traduction française complète

Tous les textes listés en §1.3 traduits dans
`client/src/pages/cafe/browse-products.tsx` (`CategoryStrip` et
`FilterBar`, plus la zone de résultats adjacente) :
`Tout`, `Rechercher`, `Rechercher des produits…`, `Sous-catégorie`/
`Toutes les sous-catégories`, `Marque`/`Toutes les marques`, `Saveur`/
`Toutes les saveurs`, `Taille`/`Toutes les tailles`, `Trier par`,
`Recommandé`, `Prix croissant`, `Prix décroissant`, `Plus de
fournisseurs`, `Les plus proches`, `Réinitialiser`, `Tous les
produits`/`Produits`, `{n} produit(s) disponible(s)` (accord pluriel
correct sur le nom ET l'adjectif), `Aucun produit trouvé`, `Essayez
d'ajuster vos filtres.`, `Aucun fournisseur n'a encore publié de
produits.`, `Effacer tous les filtres`. Aucune valeur de données
(nom de catégorie/sous-catégorie/marque/produit) traduite — uniquement
les libellés d'interface statiques de ce composant.

## 3. Garde-fous respectés

- Aucune donnée modifiée en base : vérifié en lisant directement les
  tables `categories`/`sub_categories` avant et après implémentation —
  aucune écriture effectuée par cette tâche.
- Aucun identifiant de filtre changé : `categoryId`,
  `filters.subCategoryId`, `brandId`, `flavorId`, `sizeId` restent tous
  comparés par id numérique, jamais par nom ou icône (confirmé §1.4).
- Aucune route serveur, schéma ou règle de visibilité/approbation
  fournisseur touchée — `git status` confirme zéro fichier serveur
  modifié.
- Aucun second système de mapping d'icônes créé : le même repli
  générique (`"📦"`) et le même motif de requête (`Map<id, icon>` dérivée
  d'un fetch séparé) que `CategoryStrip`/`store-detail-page.tsx`
  utilisent déjà pour les catégories sont réutilisés à l'identique pour
  les sous-catégories.
- Texte arabe préservé exactement tel qu'enregistré (`مشروبات`, `العاب`,
  `شيشا`, `النظافة`, `آلات`, `ديكور`) — jamais traduit, jamais modifié.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès (client + serveur).
- Vérification en base réelle (lecture seule) : les 12 catégories
  actives retournées par `GET /api/categories` correspondent exactement,
  caractère pour caractère, aux exemples cités par la tâche — confirme
  que la donnée était déjà complète avant toute modification.
- Vérification en base réelle (lecture seule) : `GET /api/subcategories`
  retourne bien la colonne `icon` peuplée pour plusieurs sous-catégories
  réelles (`Arabica Beans`→`☕`, `Gazouz`→`🥤`, `Cleaning`→`🧹`,
  `Tableaux`→`T`, `Rami`→`R`) — confirme que la nouvelle requête client
  recevra des icônes réelles, pas seulement des `null`.
- Redémarrage du serveur de dev ; `GET /api/categories` et
  `GET /api/subcategories` répondent tous les deux correctement, aucune
  erreur dans les logs serveur après redémarrage.
- Grep final : zéro occurrence restante des chaînes anglaises ciblées
  (`"Search"`, `"All Sub-Categories"`, `"All Brands"`, `"All Flavors"`,
  `"All Sizes"`, `"Recommended"`, `"Sub-Category"`, `"Brand"`, `"Flavor"`,
  `"Size"`, `"Sort by"`, `"Reset"`, `"All Products"`, `"No products
  found"`, `"Clear all filters"`) dans `browse-products.tsx`.
- `git status --short` final : uniquement
  `client/src/pages/cafe/browse-products.tsx`.

## 5. Limites connues

- Aucun navigateur réel disponible pour vérifier visuellement
  l'enroulement sur 2 lignes des noms longs, l'alignement de l'icône sur
  les pilules à texte multi-ligne, ou le rendu RTL potentiel du texte
  arabe dans ce contexte précis ; vérifié par lecture de code et
  confirmation que les données réelles (noms/icônes) sont correctement
  transmises jusqu'au composant. Une vérification visuelle manuelle
  (desktop + mobile, catégories à noms longs et texte arabe) reste
  recommandée avant mise en production.
- Plusieurs sous-catégories réelles ont un `icon` configuré comme une
  simple lettre (ex. `"T"`, `"R"`, `"C"`) plutôt qu'un emoji — ce n'est
  pas corrigé par cette tâche (il s'agit de données saisies par l'admin,
  affichées telles quelles conformément à la consigne « use those
  configured icons consistently », pas une erreur de mapping côté
  Shop).

---

# Analyse — Modal Close Button Consistency and Hero Theme Toggle Cleanup

## 1. Audit préalable

### 1.1 Référence — modale Pack Details

`client/src/components/pack-quick-view-modal.tsx` : `DialogContent` avec
`[&>button:last-child]:hidden`, en-tête dans l'ordre **Favori → titre →
bascule thème → Fermer** — le bouton Fermer est toujours le **dernier**
élément de la rangée (`w-8 h-8 rounded-full`, icône `X` `w-4 h-4`,
`t.iconBtn` = `bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white`
(sombre) / `bg-gray-100 hover:bg-gray-200 text-gray-500` (clair)).

### 1.2 Constat — presque toutes les autres modales inversent l'ordre

Vérification directe de chaque modale listée par la tâche :

- **My Favorites**, **My Account** (`marketplace-layout.tsx`) : ordre
  actuel `[Fermer, Titre, Bascule thème]` — Fermer **premier**, inversé
  par rapport à Pack Details.
- **Order Details** (`order-details-modal.tsx`) : même inversion
  (`[Fermer, Titre, Bascule]`), avec en plus `aria-label="Fermer"` au
  lieu de `"Close"`.
- **Product Detail** (`product-detail-content.tsx`, `ModalHeader` local) :
  même inversion (`[Fermer, Nom produit, Bascule]`).
- **PRINT/Marketing/Academy — détails** (dialogues inline dans
  `marketplace-layout.tsx`, ouverts depuis My Account → Réservations) :
  **aucun bouton Fermer personnalisé du tout** — uniquement le bouton par
  défaut Radix (`absolute right-4 top-4`, non stylé, aucune gestion
  clair/sombre).
- **Offres/Missions Baristas** (`job-management-modal.tsx`) et
  **Interventions Maintenance** (`maintenance-job-management-modal.tsx`) :
  même constat — bouton Radix par défaut uniquement, juste une teinte de
  couleur en mode sombre (`[&>button]:text-gray-400`), pas de bouton
  personnalisé.
- **Modales imbriquées plus profondément** (ouvertes depuis Order
  Details/Job Management) : `CancelSubOrderModal`,
  `JobPostFormModal`/`MaintenanceJobPostFormModal` — bouton Radix par
  défaut uniquement ; `OrderInvoiceModal`/`PayoutInfoModal`/
  `SelfPickupModal` — bouton personnalisé déjà présent mais positionné en
  **premier** (même inversion que My Account/My Favorites).
- **AddressDetailsModal (Localisation)** : déjà positionnée à droite, pas
  de bouton de bascule à côté pour comparer — considérée déjà conforme,
  non modifiée.
- **Aucun composant `ModalCloseButton` partagé n'existe** dans le code —
  chaque modale duplique le même balisage inline. Pas de second système
  créé pour cette tâche : le même balisage exact (classes, icône) continue
  d'être dupliqué, uniquement réordonné/ajouté, conformément à « do not
  introduce a new modal system ».

### 1.3 Audit de la bascule thème dupliquée dans les heros

- Les 4 pages de **découverte** citées littéralement par la tâche
  (`/products` [Shop], `/academy`, `/print`, `/marketing`) **n'ont déjà
  plus** de bascule dans leur hero — confirmé par grep direct (aucune
  icône `Sun`/`Moon`), avec un commentaire existant confirmant qu'un
  nettoyage antérieur l'avait déjà retirée de ces pages précises.
- La bascule dupliquée existe en réalité sur un **niveau de page
  différent** : la page de détail d'**un fournisseur/prestataire
  individuel** pour chacun des 4 services — `store-detail-page.tsx`
  (Shop), `academy-store-detail-page.tsx`, `print-store-detail-page.tsx`,
  `marketing-store-detail-page.tsx`. Les 4 utilisent le bouton **identique**
  (`w-9 h-9 bg-black/40 backdrop-blur-sm rounded-full`, icône `Sun`/`Moon`),
  chacun appelant `useThemeStore((s) => s.isDark)`/`useThemeStore((s) =>
  s.toggle)` — **le même store Zustand global que la navbar**.
- Confirmé : aucun état local propre à ce bouton — c'est un doublon pur
  d'interface. Le retirer ne peut affecter ni le store global, ni la
  préférence sauvegardée, puisque le bouton de la navbar
  (`marketplace-layout.tsx`, ligne ~3231-3243) lit/écrit exactement le
  même état et reste totalement intact.

## 2. Implémentation

### 2.1 Standardisation des boutons Fermer

Pour chaque modale listée, Fermer déplacé à la position la plus à droite
(ou ajouté, stylé à l'identique de Pack Details, là où il manquait) :

- **My Favorites**, **My Account** (`marketplace-layout.tsx`) : ordre
  inversé en `[Bascule thème, Titre, Fermer]` — mêmes deux boutons, mêmes
  gestionnaires `onClick`, position uniquement.
- **Order Details** (`order-details-modal.tsx`) : même inversion
  `[Bascule, Numéro de commande, Fermer]`.
- **Product Detail** (`product-detail-content.tsx`) : même inversion
  `[Bascule, Nom produit, Fermer]`.
- **PRINT/Marketing/Academy — détails** (`marketplace-layout.tsx`) :
  `DialogContent` reçoit `hideClose` ; chaque titre enveloppé dans une
  rangée `flex justify-between` avec un nouveau bouton Fermer circulaire
  identique à Pack Details, à droite.
- **Offres/Missions Baristas**, **Interventions Maintenance**
  (`job-management-modal.tsx`, `maintenance-job-management-modal.tsx`) :
  `hideClose` ajouté ; bouton Fermer ajouté dans les **trois** états de
  rendu (liste principale, écran de chargement du deep-link, vue détail
  d'une offre/intervention) — un nouveau prop `onClose` ajouté à
  `JobDetailView` pour le distinguer de `onBack` (« Retour à la liste »,
  qui reste une navigation interne à la modale, pas une fermeture).
- **CancelSubOrderModal** (`order-details-modal.tsx`),
  **JobPostFormModal**/**MaintenanceJobPostFormModal** : `hideClose`
  ajouté + bouton Fermer personnalisé ajouté ; pour les deux formulaires,
  le clic respecte la même garde `!isPending` déjà utilisée par la
  fermeture automatique de la modale (`onOpenChange`), pour ne jamais
  fermer pendant un enregistrement en cours.
- **OrderInvoiceModal**, **PayoutInfoModal**, **SelfPickupModal**
  (`client/src/components/financial/`, `client/src/components/order/`) :
  ordre inversé (le bouton Imprimer, ou l'espaceur invisible qui centrait
  le titre, passe en premier ; Fermer passe en dernier) — layout/centrage
  du titre inchangé.
- **AddressDetailsModal** : non modifiée (déjà conforme, voir §1.2).

### 2.2 Retrait de la bascule thème dupliquée (4 pages de détail fournisseur)

- `store-detail-page.tsx`, `academy-store-detail-page.tsx`,
  `print-store-detail-page.tsx`, `marketing-store-detail-page.tsx` :
  bouton de bascule retiré du cluster haut-droite du hero (Favori/Flash/
  autres boutons du même cluster conservés tels quels) ; la destructuration
  `toggle`/`toggleTheme` devenue inutilisée retirée avec lui (confirmé par
  grep qu'elle n'était plus appelée nulle part ailleurs dans chaque
  fichier) ; imports `Sun`/`Moon` retirés des 3 fichiers où ils devenaient
  inutilisés (conservés dans `store-detail-page.tsx`, où ils restent
  utilisés par la bascule légitime de sa propre modale « Horaires
  d'ouverture », hors périmètre de cette tâche).

## 3. Garde-fous respectés

- Aucun comportement de fermeture modifié : chaque bouton déplacé/ajouté
  appelle exactement le même gestionnaire `onClose`/équivalent qu'avant —
  uniquement la position et, pour les modales qui n'en avaient pas, le
  style du bouton.
- Aucune logique de formulaire, de validation ou de soumission touchée
  (`JobPostFormModal`/`MaintenanceJobPostFormModal` : seule la zone d'en-
  tête a été modifiée, le `<form>` et tous ses champs restent identiques).
- Navbar non modifiée : son propre bouton de bascule
  (`marketplace-layout.tsx`, ~ligne 3231-3243) reste la seule source
  intacte, non touchée par cette tâche.
- Retrait de la bascule dupliquée strictement limité à 4 fichiers précis
  (pages de détail fournisseur), jamais aux 4 pages de découverte
  (`/products`, `/academy`, `/print`, `/marketing`) qui n'en avaient déjà
  plus — confirmé par l'audit avant toute modification.
- Aucune table, route, ou donnée de thème persistée modifiée — le store
  `useThemeStore` lui-même (`client/src/store/theme-store.ts`) n'a reçu
  aucune modification.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès (client + serveur).
- Redémarrage du serveur de dev ; aucune erreur dans les logs serveur
  après redémarrage.
- Grep final : confirmé qu'aucune des 4 pages de détail fournisseur ne
  contient plus d'icône `Sun`/`Moon` à l'exception de
  `store-detail-page.tsx` (dont les 2 occurrences restantes appartiennent
  à sa modale « Horaires d'ouverture », distincte et hors périmètre) ;
  confirmé qu'aucune des destructurations `toggle`/`toggleTheme` retirées
  n'était plus référencée ailleurs dans chacun des 4 fichiers avant
  suppression.
- `git status --short` final : 14 fichiers modifiés, tous explicitement
  dans le périmètre de la tâche (modales listées + modales imbriquées
  identifiées par l'audit + les 4 pages de détail fournisseur) — aucun
  fichier serveur, schéma, route ou page sans rapport touché.

## 5. Limites connues

- Aucun navigateur réel disponible pour vérifier visuellement
  l'alignement exact des boutons réordonnés, l'absence de chevauchement
  avec le titre, ou le comportement au clic dans chacune des 14 modales/
  pages ; vérifié par lecture de code comparant chaque modale au balisage
  exact de la référence Pack Details, type-checking strict, et build de
  production réussi. Une vérification manuelle (desktop + mobile, chaque
  modale listée, les 4 pages de détail fournisseur en clair et en sombre)
  reste recommandée avant mise en production.
- Portée volontairement étendue au-delà de la liste littérale de la tâche
  pour couvrir les modales imbriquées à un niveau de profondeur
  supplémentaire (`CancelSubOrderModal`, `JobPostFormModal`,
  `MaintenanceJobPostFormModal`, `OrderInvoiceModal`, `PayoutInfoModal`,
  `SelfPickupModal`), conformément à l'insistance explicite de la tâche
  sur l'exhaustivité des modales imbriquées — signalé ici par transparence
  puisque ce n'était pas nommé explicitement dans la liste initiale.
- Aucun composant `ModalCloseButton` partagé n'a été créé pour factoriser
  le balisage désormais dupliqué dans ~14 endroits — l'audit avait
  recommandé cette extraction, mais la créer aurait dépassé le périmètre
  « changements minimaux » de cette tâche (qui demande de réutiliser
  l'existant, pas de refactoriser l'architecture des modales). Signalé
  comme amélioration future possible, non traitée ici.

---

# Analyse — Complete Store Page Filters and French Localization

## 1. Audit préalable

### 1.1 Page de référence déjà complète

`client/src/pages/cafe/browse-products.tsx` (`/products`, SHOP) possède
déjà, depuis une tâche précédente de cette session, un `FilterBar`
complet et entièrement français : recherche (« Rechercher des produits… »),
sous-catégorie, marque, saveur, taille, tri (« Recommandé » + options prix/
fournisseurs/proximité). C'est la référence explicite de cette tâche.

### 1.2 Quatre pages concernées — pas les pages de découverte

Les « store pages » visées par la tâche sont les pages de détail d'**un
seul fournisseur/prestataire** (route `/.../stores/:id`), pas les pages de
découverte multi-fournisseurs (`/academy`, `/print`, `/marketing`
eux-mêmes, déjà traités dans des tâches antérieures) :

1. `client/src/pages/cafe/store-detail-page.tsx` (Shop)
2. `client/src/pages/cafe/barista/academy-store-detail-page.tsx`
3. `client/src/pages/cafe/print/print-store-detail-page.tsx`
4. `client/src/pages/cafe/marketing/marketing-store-detail-page.tsx`

### 1.3 Constat clé — les facettes disponibles diffèrent réellement par service

Vérification directe des tables `shared/schema.ts` et des types retournés
par chaque hook de données (pas une supposition) :

- **Shop** (`store-detail-page.tsx`) : les produits sont des
  `ProductWithTaxonomy`, avec les **mêmes champs** `categoryLabel`/
  `subCategoryLabel`/`brandLabel`/`flavorLabels`/`sizeLabels` que la page
  de référence. Recherche/sous-catégorie/marque existaient déjà (en
  anglais) ; **saveur, taille et tri étaient absents**, pas parce que la
  donnée manque, mais parce que ces deux blocs n'avaient simplement jamais
  été ajoutés sur cette page précise — un vrai écart par rapport à la
  référence, pas une limite de données.
- **Academy** (`academy-store-detail-page.tsx`) : `academyCourses`
  (`shared/schema.ts:1984-2008`) n'a **aucune** colonne marque/saveur/
  taille/sous-catégorie — uniquement `title`, `description`, `level`
  (déjà filtré via les pastilles existantes), `category` (texte libre,
  affiché sur chaque carte mais jamais filtré), `priceInCents`. Aucune
  recherche n'existait du tout.
- **Print** (`print-store-detail-page.tsx`) : `printCatalogItems`
  (`shared/schema.ts:2819-2841`) a `category` (déjà filtré) et
  `subCategory` (texte libre, valeur unique, colonne réelle avec données
  réelles — vérifié en base) mais **aucune** colonne marque/saveur/taille.
  Aucune recherche n'existait.
- **Marketing** (`marketing-store-detail-page.tsx`) : `marketingServices`
  (`shared/schema.ts:2688-2718`) a `category` (déjà filtré) et
  `subCategories` (tableau texte **multi-valeur** — un service peut
  appartenir à plusieurs sous-catégories à la fois, structurellement
  différent du `subCategory` à valeur unique de Print/Shop) mais aucune
  colonne marque/saveur/taille. Aucune recherche n'existait.

**Conclusion directement actionnable** : marque/saveur/taille sont des
concepts propres aux produits Shop (`TaxonomyLabel` sur `brandLabel`/
`flavorLabels`/`sizeLabels`), sans équivalent sur `academyCourses`,
`printCatalogItems` ou `marketingServices` — les ajouter ailleurs aurait
fabriqué une interface sans donnée réelle derrière, explicitement interdit
par la tâche. La facette manquante réellement exploitable est différente
par service : saveur/taille pour Shop, rien pour Academy (seule la
recherche s'applique), sous-catégorie pour Print (sélection simple) et
Marketing (sélection multiple, calquée sur le motif existant de sa page de
découverte).

### 1.4 Tri — choix du périmètre

Aucune des 3 pages non-Shop n'avait de tri existant. Un tri par prix
(`priceInCents`/`startingPriceInCents`, colonnes réelles sur les 3) a été
ajouté par cohérence avec la facette « Tri » explicitement demandée par la
tâche « partout où applicable ». Les options « Plus de fournisseurs » et
« Les plus proches » de la page de référence ont été délibérément omises
sur les 4 pages de détail fournisseur : chaque page liste les éléments
d'un **seul** fournisseur/prestataire, donc ces deux tris ne
distingueraient rien (même fournisseur, même distance pour chaque ligne).

### 1.5 Libellé de recherche — choix de cohérence littérale

Le tableau de la tâche prescrit explicitement `"Rechercher des produits…"`
comme libellé de recherche à utiliser « de manière cohérente » sur les
4 pages — malgré le fait que les pages sœurs existantes (`/academy`,
`/print`, `/marketing`) utilisent des libellés contextuels (« Rechercher
une formation... », « Rechercher un service... »). Décision : suivre la
consigne explicite et répétée de la tâche à la lettre plutôt que
d'improviser un libellé "plus juste" — `"Rechercher des produits…"` est
utilisé mot pour mot sur les 4 pages de détail fournisseur.

## 2. Implémentation

### 2.1 Shop (`store-detail-page.tsx`)

- Traduction des libellés déjà existants : "All"→"Tout", "Search"→
  "Rechercher", "Search products…"→"Rechercher des produits…",
  "Sub-Category"/"All Sub-Categories"→"Sous-catégorie"/"Toutes les
  sous-catégories", "Brand"/"All Brands"→"Marque"/"Toutes les marques",
  "Reset"→"Réinitialiser", "Products"→"Produits", "{n} product(s)
  available"→"{n} produit(s) disponible(s)", "No products found"→"Aucun
  produit trouvé", messages vides et "Clear all filters"→"Effacer tous
  les filtres".
- `FilterState` étendu avec `flavorId`/`sizeId`/`sortBy` ; nouveaux
  `useMemo` `flavors`/`sizes` dérivés de `categoryFiltered` exactement
  comme `subCategories`/`brands` existants ; `filtered` étendu pour
  appliquer ces filtres + le tri prix, mêmes prédicats que la page de
  référence (`browse-products.tsx`).
- Nouveaux `Select` Saveur/Taille/Trier par ajoutés dans la barre, même
  style/`data-testid` convention que les filtres existants de cette même
  page.
- Bonus de cohérence (déjà flagué comme écart connu par un audit
  antérieur) : la troncature `max-w-[72px] truncate` du nom de catégorie
  remplacée par le même enroulement sur 2 lignes déjà appliqué à
  `/products` dans une tâche précédente.

### 2.2 Academy (`academy-store-detail-page.tsx`)

- Ajout d'un champ de recherche (titre/description) et d'un tri prix —
  seules facettes réellement applicables (voir §1.3). Aucune
  sous-catégorie/marque/saveur/taille ajoutée (aucune colonne
  correspondante n'existe). Le filtre par niveau existant reste
  totalement inchangé.
- Jetons `inputBg`/`selectTrigger` ajoutés au helper `useTheme` local du
  fichier (absents auparavant, nécessaires pour les nouveaux contrôles).
- Page déjà 100 % française avant cette tâche (confirmé par l'audit) —
  aucune traduction nécessaire, uniquement de la complétion.

### 2.3 Print (`print-store-detail-page.tsx`)

- Ajout d'un champ de recherche (nom/description) et d'un filtre
  sous-catégorie (sélection simple, valeurs réelles dérivées de
  `service.subCategory`, vérifiées non vides en base) et d'un tri prix.
  Libellés « Sous-catégorie »/« Sous-catégories » repris mot pour mot de
  la page sœur `/print` pour cohérence totale avec le reste de
  l'application.
- Sélection d'une catégorie réinitialise désormais la sous-catégorie
  (cohérent avec le motif déjà utilisé sur `/products` et
  `store-detail-page.tsx` : changer de catégorie ne doit pas laisser une
  sous-catégorie orpheline sélectionnée).
- Page déjà 100 % française avant cette tâche — uniquement de la
  complétion.

### 2.4 Marketing (`marketing-store-detail-page.tsx`)

- Ajout d'un champ de recherche (titre/catégorie/description) et d'un
  tri prix. Sous-catégorie ajoutée en **sélection multiple**
  (`DropdownMenu`/`DropdownMenuCheckboxItem`, pas un `Select` simple) —
  calqué sur le motif déjà utilisé par la page sœur `/marketing`, parce
  que `marketingServices.subCategories` est un tableau multi-valeur réel
  (un service peut appartenir à plusieurs sous-catégories), pas une
  valeur unique comme Print — utiliser un `Select` simple aurait caché
  cette nuance de données réelle.
- Options de sous-catégories dérivées directement des services déjà
  chargés sur cette page (pas une requête supplémentaire vers la table de
  taxonomie admin complète, pour rester minimal).
- Page déjà 100 % française avant cette tâche — uniquement de la
  complétion.

## 3. Garde-fous respectés

- Aucune table, route ou API modifiée — toutes les nouvelles facettes
  utilisent des données déjà chargées par chaque page (aucune nouvelle
  requête réseau, sauf les `useMemo` de dérivation côté client).
- Aucune facette fabriquée : vérifié en base réelle que `print_catalog_
  items.sub_category`, `marketing_services.sub_categories`,
  `academy_courses.category`, `flavors`, et `sizes` contiennent toutes
  des données réelles non vides avant d'ajouter leurs filtres respectifs.
- Combinaison de filtres préservée : chaque nouveau filtre s'ajoute à la
  chaîne de `useMemo` existante sans remplacer les prédicats déjà en
  place (catégorie, niveau, marque, etc.) — vérifié par relecture de
  chaque fichier modifié.
- Effacer un filtre n'efface que ce filtre : les nouveaux contrôles
  (saveur/taille/tri/sous-catégorie) ont chacun leur propre setter d'état
  ; seul le bouton « Réinitialiser »/« Effacer tous les filtres » remet
  tout à zéro, comportement identique à l'existant.
- Aucune règle de visibilité produit, d'approbation fournisseur, de prix
  ou d'accès modifiée — uniquement des filtres d'affichage côté client
  sur des données déjà exposées par les endpoints existants.
- Navigation vers le détail produit/service, panier et favoris
  totalement inchangés (aucune ligne de ce code touchée).

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès (client + serveur).
- Vérification en base réelle (lecture seule) : sous-catégories Print
  avec données réelles (« Gobelets en carton », « Flyers », etc.),
  services Marketing avec tableaux de sous-catégories réels (« Montage
  vidéo », « Google Ads », etc.), catégories Academy avec données
  réelles (« Espresso », « COMPTOIRIST »), et 18 saveurs / 19 tailles
  réelles en base pour Shop — confirme que chaque nouveau filtre aura de
  vraies options à afficher, pas des listes vides.
- Redémarrage du serveur de dev ; aucune erreur dans les logs serveur
  après redémarrage.
- Grep final sur les 4 fichiers : zéro chaîne anglaise restante parmi les
  libellés de filtre ciblés ("All", "Search", "Sub-Category", "All
  Sub-Categories", "Brand", "All Brands", "Reset", "Products", "No
  products found", "Clear all filters").
- `git status --short` final : uniquement les 4 pages de détail
  fournisseur modifiées (+ `analyse.md`) — aucun fichier serveur, schéma,
  ou route touché.

## 5. Limites connues

- Aucun navigateur réel disponible pour vérifier visuellement
  l'alignement des nouveaux contrôles (Saveur/Taille/Tri sur Shop,
  recherche/tri sur Academy, sous-catégorie simple sur Print, menu
  déroulant à cases sur Marketing) sur desktop et mobile, ni le
  comportement exact du menu à cases à cocher Marketing au clic ;
  vérifié par lecture de code comparant chaque nouvel ajout au motif
  exact déjà utilisé par la page de référence ou la page sœur
  correspondante, type-checking strict, build de production réussi, et
  vérification des données réelles en base. Une vérification manuelle
  (desktop + mobile, chacune des 4 pages, combinaisons de filtres) reste
  recommandée avant mise en production.
- Le filtre par catégorie d'Academy (donnée réelle existante,
  `academyCourses.category`, déjà affichée sur chaque carte mais jamais
  filtrable) n'a pas été ajouté : la tâche ne le nommait pas explicitement
  parmi ses 6 facettes de référence, et l'ajouter aurait dépassé le
  périmètre « changements ciblés » — signalé ici comme amélioration
  possible, non traitée.

---

# Tâche : Academy, Print & Marketing — Cohérence des filtres (page principale ↔ page boutique)

## 1. Audit préalable

- Confirmé que les 3 pages principales (`/academy`, `/print`,
  `/marketing`) possédaient déjà toutes leurs facettes de filtre sauf un
  tri « Recommandé » — absent des 3.
- Confirmé que la page boutique Academy (`/academy/stores/:id`)
  utilisait encore une rangée de pastilles de niveau séparée
  (Tout/Expert/Avancé/Débutant), distincte du filtre « Niveau » déjà
  présent sur `/academy`, créant deux façons différentes de filtrer par
  niveau entre les deux pages.
- Confirmé que les pages boutique Print (`/print/stores/:id`) et
  Marketing (`/marketing/stores/:id`) n'avaient pas encore les facettes
  Sociétés/Matières/Livraisons (Print) ni Types/Notes/Villes (Marketing)
  présentes sur leurs pages principales respectives.
- Confirmé, lecture directe de `shared/schema.ts` et des hooks
  `use-marketing.ts`, que les champs sources de ces nouvelles facettes
  existent réellement :
  - `academyCourses.hasCertification` (déjà utilisé par `/academy` via
    son filtre « Certification »).
  - `printCatalogItems.materials: text[]` et
    `.productionTimeDays: integer` (déjà utilisés par `/print` via un
    regroupement fixe à 3 paliers ≤3/4-7/8+ jours) + le nom du
    fournisseur (identité de la carte, pas une colonne séparée).
  - `marketingProfiles.profileType` / `.rating` + l'adresse de
    localisation du compte (déjà utilisés par `/marketing` via ses
    filtres Types/Notes/Villes).
- Vérifié en base réelle (lecture seule) que ces champs sont bien
  renseignés et non vides pour les comptes de test cités dans la tâche :
  cours Academy avec `has_certification = true` (ids 1, 2, 3) ; articles
  du catalogue de l'imprimeur `contact@coffeeprintstudio.tn`
  (`printer_id = 53`) avec matières réelles (« Coton », « Toile »,
  « Carton », etc.) et délais couvrant les 3 paliers (3, 4, 7 jours) ;
  profil Marketing `user_id = 19` avec `profile_type = 'Agency'`,
  `rating = 50` (4.5+/4.7+ non atteint mais filtre fonctionnel) et une
  adresse de localisation réelle.
- Confirmé que la page boutique Print utilisait déjà une table de
  correspondance icône-sous-catégorie restreinte (icône base de données
  uniquement, sans repli) alors que le helper exporté
  `printSubCategoryIcon` (avec repli) existe déjà dans
  `print-category-icons.ts` — retenu ce helper plutôt qu'une
  duplication de la logique plus étroite de la page principale, pour
  une couverture d'icônes égale ou meilleure tout en réutilisant un
  mapping déjà existant (pas un nouveau).
- Repéré la cause exacte du bug de contraste en mode sombre du menu
  « Sous-catégories » de la page boutique Marketing : son
  `DropdownMenuContent` fixait un fond sombre (`bg-gray-800`) sans
  jamais surcharger la couleur de texte, qui retombe alors sur la
  variable CSS par défaut de Radix (texte sombre sur fond sombre). La
  page principale `/marketing`, elle, utilise déjà un jeton
  `t.selectContent` qui fixe explicitement un texte clair en mode
  sombre — absent du `useTheme()` local de la page boutique.

## 2. Implémentation

**Pages principales — ajout du tri « Recommandé » (3 fichiers) :**
- `barista-academy-page.tsx` : nouvel état `trainingSortBy`, tri
  client sur `priceInCents` appliqué après le chargement/filtrage
  serveur existant, nouveau `Select` (Recommandé / Prix croissant /
  Prix décroissant) juste avant le bouton de réinitialisation, dont le
  gestionnaire a été étendu pour aussi réinitialiser le tri.
- `print-page.tsx` : `PrintFilters` étendu avec `sortBy`, tri appliqué
  en fin de la chaîne de filtrage client existante, nouveau `Select`
  juste avant le bouton de réinitialisation ; la réinitialisation par
  la bande de catégories (qui préserve volontairement la recherche)
  préserve désormais aussi le tri, tandis que le bouton Réinitialiser
  complet efface les deux.
- `marketing-page.tsx` : nouvel état `sortBy`, tri sur
  `startingPriceInCents`, nouveau `Select` juste après le filtre
  « Villes ».

**Page boutique Academy — remplacement des pastilles de niveau :**
- Suppression de la rangée de pastilles Tout/Expert/Avancé/Débutant et
  du `useMemo` `availableLevels` associé, devenu inutile.
- Ajout d'un état `certFilter` et de son application dans le filtrage.
- Remplacement par la même rangée de filtres que `/academy` : recherche
  → `Select` Niveau (Niveaux/Débutant/Avancé/Expert) → `Select`
  Certification (Formations/Avec certification/Sans certification) →
  `Select` Recommandé → bouton Réinitialiser (icône `RotateCcw` ajoutée
  pour cohérence visuelle, libellé inchangé).
- Placeholder de recherche corrigé en « Rechercher une formation... »
  pour correspondre exactement à la page principale.

**Page boutique Print — ajout des 3 facettes manquantes :**
- Ajout des états `brandId`/`material`/`deliveryTime` (le tri et la
  recherche existaient déjà depuis la tâche précédente).
- Nouveaux `useMemo` : `printers` (identité du fournisseur de cette
  page), `materials` (union des matières des articles déjà chargés),
  `deliveryBuckets` (sous-ensemble des 3 paliers fixes de `/print`
  réellement présents parmi les articles de ce fournisseur).
- Ajout des 3 `Select` correspondants (Sociétés/Matières/Livraisons)
  dans le même ordre et avec les mêmes classes que `/print`, juste
  après le `Select` Sous-catégorie existant.
- Le `Select` Sous-catégorie utilise désormais le helper exporté
  `printSubCategoryIcon` (import ajouté) au lieu d'un nom brut, en
  réutilisant la même table de sous-catégories déjà chargée par
  `/api/print/taxonomy` (élargie pour inclure `subcategories`, sans
  requête réseau supplémentaire).
- Placeholder de recherche corrigé en « Rechercher un service... ».

**Page boutique Marketing — ajout des 3 facettes manquantes + correctif
contraste sombre :**
- Ajout des états `filterType`/`filterRating`/`filterLocation`.
- Ces champs étant au niveau du prestataire (identiques pour tous les
  services de cette page), chacun agit comme un filtre « tout ou rien »
  sur la liste entière plutôt qu'un prédicat par service — toujours une
  donnée réelle, simplement à une seule valeur à l'échelle d'une page
  boutique.
- Ajout des 3 `Select` (Types/Notes/Villes) dans le même ordre et avec
  les mêmes libellés/valeurs que `/marketing`, juste après le menu
  Sous-catégories existant et avant le tri Recommandé.
- Import de `useMarketingSubCategoryTaxonomy` et
  `resolveMarketingSubCategoryIcon` ; le menu Sous-catégories affiche
  désormais l'icône résolue via ce helper partagé (au lieu du nom brut
  seul), exactement comme `/marketing`.
- **Correctif contraste mode sombre** : ajout d'un jeton
  `selectContent` au `useTheme()` local de cette page, identique à
  celui de `/marketing` (texte clair + survol sur fond sombre, texte
  sombre + fond clair en mode clair), puis application de ce jeton au
  `DropdownMenuContent` des Sous-catégories (qui n'avait auparavant
  aucune surcharge de couleur de texte) et aux 3 nouveaux `Select`. Le
  `Select` de tri, qui fixait déjà une couleur de texte explicite par
  élément, n'a pas été touché (déjà fonctionnel, hors périmètre du
  correctif).
- Placeholder de recherche corrigé en « Rechercher un prestataire... ».

**Bouton Réinitialiser (transversal, 6 pages) :** chaque gestionnaire de
réinitialisation déjà existant a été étendu pour effacer également les
nouveaux filtres ajoutés par cette tâche (tri sur les 3 pages
principales ; niveau/certification/tri sur la page boutique Academy ;
société/matière/livraison sur la page boutique Print ;
type/note/ville sur la page boutique Marketing) — aucun libellé ni
aucune icône de bouton existant n'a été renommé, le texte « Réinitialiser »
de la tâche désignant ce bouton de façon descriptive, pas une consigne
de renommage (les 3 pages principales disent toujours « Reset », les 4
pages boutique disent toujours « Réinitialiser », comme avant cette
tâche).

## 3. Garde-fous respectés

- Aucune nouvelle colonne, migration, ni table ajoutée — toutes les
  nouvelles facettes utilisent des champs déjà existants en base.
- Aucune donnée inventée : chaque nouvelle option de filtre (certification,
  matière, délai, société, type, note, ville) a été vérifiée en base
  réelle avant implémentation (section 1).
- Aucun mélange entre les données Academy/Print/Marketing : chaque page
  reste alimentée par son propre hook/sa propre requête existante.
- Aucune API, schéma, route, permission, navigation ou page de détail
  modifiée.
- Réutilisation des mappings d'icônes déjà exportés
  (`printSubCategoryIcon`, `resolveMarketingSubCategoryIcon`) plutôt
  que duplication d'une seconde table de correspondance.
- Le correctif de contraste Marketing ne force aucun thème unique et ne
  fixe aucune couleur codée en dur qui entrerait en conflit avec le
  système de thème existant — il reprend exactement le jeton déjà
  utilisé par la page principale correspondante.

## 4. Tests exécutés

- `npx tsc --noEmit` sur l'ensemble du projet → 0 erreur.
- `npm run build` → succès (client + serveur).
- Vérification en base réelle (lecture seule, voir section 1) : chaque
  nouvelle facette dispose d'au moins une valeur réelle et non vide
  pour les comptes de test cités par la tâche (cours Academy certifiés,
  articles de l'imprimeur `contact@coffeeprintstudio.tn` avec matières/
  délais variés, profil Marketing `user_id = 19` avec type/note/adresse
  renseignés).
- `git status --short` final : les 6 fichiers attendus par cette tâche
  (`barista-academy-page.tsx`, `print-page.tsx`, `marketing-page.tsx`,
  `academy-store-detail-page.tsx`, `print-store-detail-page.tsx`,
  `marketing-store-detail-page.tsx`) sont les seuls fichiers de code
  modifiés pour cette tâche (les autres fichiers listés par `git
  status` proviennent de tâches précédentes déjà en cours, non commitées,
  et restent intacts).
- Vérification manuelle du serveur de développement déjà actif
  (`http://localhost:5000`) : réponses normales des endpoints
  `/api/print/marketplace` et `/api/marketing/profile/:id` (401
  attendu sans session pour ce second, confirmant qu'il est bien protégé
  et répond normalement).

## 5. Limites connues

- Aucun navigateur réel disponible pour confirmer visuellement le
  correctif de contraste du menu Sous-catégories Marketing en mode
  sombre, ni l'alignement des nouveaux `Select` sur les 6 pages
  (desktop + mobile) — vérifié par lecture de code comparant chaque
  ajout au jeton/motif exact déjà utilisé par la page de référence,
  type-checking strict et build de production réussi. Une vérification
  visuelle manuelle reste recommandée avant mise en production.
- Sur la page boutique Print, le filtre « Sociétés » n'a par
  construction qu'une seule option possible (le fournisseur de cette
  page) — fonctionnel mais peu utile à cette échelle ; conservé car
  explicitement demandé par la tâche pour la parité des facettes avec
  `/print`.
- Sur la page boutique Marketing, les filtres Types/Notes/Villes
  n'ont également qu'une seule option possible chacun (le prestataire
  de cette page) — même raisonnement, parité des facettes demandée
  explicitement par la tâche.

---

# Tâche : Shop — Icônes des sous-catégories sur la page boutique alignées sur `/products`

## 1. Audit préalable

- `/products` (`browse-products.tsx`) résout l'icône de chaque
  sous-catégorie via une requête dédiée `/api/subcategories` (données
  admin complètes, l'icône étant retirée côté serveur des objets
  produit eux-mêmes), réduite à une `Map<number, string>` id→icône
  (`subCategoryIconMap`), puis affichée dans le `SelectItem` du filtre
  `Sous-catégories` sous la forme `<span>{icon || "📦"}</span>{name}`
  (repli générique « 📦 » uniquement si la sous-catégorie n'a pas
  encore d'icône configurée côté admin).
- `/stores/:storeId` (`store-detail-page.tsx`) construit déjà la même
  logique pour ses **catégories** (`categoryIconMap`, à partir de
  `/api/categories`), mais son `useMemo` `subCategories` ne récupérait
  que `{id, name}` depuis `p.subCategoryLabel` — aucune résolution
  d'icône — et son `SelectItem` affichait uniquement `{sc.name}`, sans
  aucun span d'icône. Résultat : le filtre Sous-catégories de la page
  boutique n'affichait jamais d'icône, contrairement à `/products`.
- Confirmé qu'aucun second mapping d'icônes n'existe : la seule source
  réelle est la table admin des sous-catégories, déjà exposée par
  `/api/subcategories` et déjà consommée par `/products` exactement
  selon le même motif que celui utilisé par `store-detail-page.tsx`
  pour ses propres icônes de catégorie — il suffisait de dupliquer ce
  motif existant pour les sous-catégories.
- Vérifié en base réelle/API live que le cas n'est pas théorique : la
  sous-catégorie id 25 (« Gazouz ») a une icône réelle 🥤 dans
  `/api/subcategories`, et le store #9 (« FANTA ») a des produits
  réels appartenant à cette même sous-catégorie 25 — donc avant le
  correctif, cette icône n'apparaissait jamais sur `/stores/9` alors
  qu'elle apparaît déjà sur `/products`.

## 2. Implémentation

Dans `client/src/pages/cafe/store-detail-page.tsx` :
- Ajout de l'import du type `SubCategoryWithDetails` (déjà exporté par
  `@shared/schema`, déjà utilisé par `/products`).
- Ajout d'une requête `useQuery<SubCategoryWithDetails[]>({ queryKey:
  ["/api/subcategories"] })` et d'un `subCategoryIconMap` (id→icône),
  copie exacte du motif déjà en place sur cette même page pour
  `categoryIconMap`/`allCategories`.
- `subCategories` (le `useMemo` qui alimente le filtre) inclut
  désormais `icon: subCategoryIconMap.get(Number(id)) ?? null` pour
  chaque entrée.
- Le `SelectItem` du filtre Sous-catégories affiche désormais
  `<span className="mr-1.5">{sc.icon || "📦"}</span>{sc.name}` — motif
  identique à celui de `/products`, y compris le même repli « 📦 ».

Aucun autre filtre (recherche, marque, saveur, taille, tri), aucune
donnée de produit, aucune API, et aucune relation catégorie/
sous-catégorie n'a été modifiée.

## 3. Garde-fous respectés

- Aucune nouvelle table, colonne ni migration — réutilisation exacte
  de `/api/subcategories`, déjà appelée par `/products` pour le même
  besoin.
- Aucun second mapping d'icônes introduit : une seule source
  (`/api/subcategories`), un seul motif de résolution, copié tel quel
  depuis `/products` (et depuis le `categoryIconMap` déjà présent sur
  cette page pour les catégories).
- Noms, identifiants, ordre et relations parent-catégorie des
  sous-catégories inchangés — seul l'affichage de l'icône a été
  ajouté.
- Filtrage par sous-catégorie, résultats produits, et toutes les
  autres facettes (marque, saveur, taille, tri) laissés intacts (aucune
  ligne de leur logique n'a été touchée).
- Les classes de thème clair/sombre existantes du `SelectItem`
  (`t.dk ? "text-gray-200 ..." : ""`) sont conservées sans changement ;
  seul un `<span>` a été inséré à l'intérieur.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès (client + serveur).
- Vérification via l'API réelle du serveur de développement déjà actif
  (`http://localhost:5000`) : `/api/subcategories` renvoie bien
  `{id: 25, name: "Gazouz", icon: "🥤"}`, et `/api/stores/9` renvoie des
  produits réels dont `subCategoryLabel = {id: 25, name: "Gazouz"}` —
  confirme que la même icône que `/products` s'affichera désormais pour
  la même sous-catégorie sur `/stores/9`.
- `git status --short` final : seul `store-detail-page.tsx` a été
  modifié par cette tâche (en plus de `analyse.md`) ; les autres
  fichiers listés proviennent de tâches précédentes déjà en cours, non
  commitées, et restent intacts.

## 5. Limites connues

- Aucun navigateur réel disponible pour confirmer visuellement le
  rendu du span d'icône (alignement, espacement) en mode clair/sombre
  et sur mobile — vérifié par lecture de code comparant le JSX ajouté
  au motif exact déjà utilisé par `/products`, et par les données
  réelles ci-dessus confirmant qu'une icône non vide sera bien
  affichée pour au moins un cas réel (sous-catégorie 25 du store #9).
  Une vérification visuelle manuelle reste recommandée avant mise en
  production.
- La plupart des sous-catégories n'ont pas encore d'icône configurée
  côté admin (`icon: null` en base pour la majorité des lignes
  observées) — ces entrées afficheront le repli « 📦 », exactement
  comme sur `/products` ; ce n'est pas une régression du correctif,
  seulement un reflet fidèle du même état de configuration admin déjà
  visible sur la page de référence.

---

# Tâche : Uniformiser le comportement de défilement des filtres sur les pages boutique

## 1. Audit préalable

- Référence (`browse-products.tsx`, `FilterBar`, ligne ~872-876) : la
  rangée de filtres (recherche + Sous-catégorie + Marque + Saveur +
  Taille + Tri + Réinitialiser) est enveloppée dans un conteneur
  `flex items-center gap-2 flex-nowrap overflow-x-auto sm:flex-wrap
  sm:overflow-x-visible [&::-webkit-scrollbar]:hidden`, avec
  `style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}`.
  Comportement réel : sur mobile (`< sm`), les filtres ne passent jamais
  à la ligne — ils défilent horizontalement avec une scrollbar masquée
  et un défilement tactile natif (`-webkit-overflow-scrolling: touch`) ;
  à partir de `sm:` (tablette/desktop), ils passent au contraire à la
  ligne (`flex-wrap`) et le défilement horizontal est désactivé
  (`overflow-x-visible`) — aucun défilement n'est donc nécessaire sur
  grand écran, seulement sur mobile.
- Un second widget, la bande de pastilles de catégorie (`CategoryStrip`,
  ligne 78-109, et son équivalent sur chaque page boutique), utilise
  délibérément un motif différent et plus simple :
  `flex gap-1.5 overflow-x-auto py-3` (toujours en défilement
  horizontal, sans variante `sm:flex-wrap`) — déjà strictement
  identique entre `/products` et les 4 pages boutique. Ce widget n'est
  pas concerné par cette tâche, aucune incohérence n'y a été trouvée.
- Les 4 pages boutique (`store-detail-page.tsx`, `academy-store-
  detail-page.tsx`, `print-store-detail-page.tsx`, `marketing-store-
  detail-page.tsx`) partagent toutes la même implémentation séparée de
  leur rangée de filtres (pas de composant `FilterBar` partagé avec
  `/products` — chaque page a sa propre copie, confirmé par les audits
  précédents de cette session), et les 4 utilisaient exactement le même
  conteneur fautif : `flex items-center gap-2 flex-wrap py-2` — aucun
  `overflow-x-auto`, aucune scrollbar masquée, aucun style de
  défilement tactile. Résultat : sur mobile, les filtres passaient
  directement à la ligne (plusieurs rangées) au lieu de défiler
  horizontalement comme sur `/products`, cassant la cohérence demandée
  par la tâche.
- Les 4 rangées de filtres fautives sont déjà imbriquées dans un
  conteneur parent `<div className="max-w-7xl mx-auto px-4">` (identique
  à la référence), donc aucun ajustement de ce parent n'était
  nécessaire — seul le conteneur interne de la rangée de filtres devait
  changer.
- Note sur le routage : la tâche désigne la page boutique Marketing par
  `/stores/19`, mais cette URL correspond en réalité à la page boutique
  Shop (`/stores/:storeId`, voir `App.tsx` ligne 363). La page boutique
  Marketing existe à la route `/marketing/stores/:agencyId` (`App.tsx`
  ligne 729). Traité comme une coquille dans l'énoncé de la tâche (le
  même id "19" avait déjà été utilisé dans une tâche précédente de cette
  session pour désigner l'agence Marketing #19) — la correction a donc
  bien été appliquée à `marketing-store-detail-page.tsx`.

## 2. Implémentation

Dans les 4 fichiers (`store-detail-page.tsx`,
`academy-store-detail-page.tsx`, `print-store-detail-page.tsx`,
`marketing-store-detail-page.tsx`), remplacement identique du
conteneur de la rangée de filtres :

```tsx
// Avant
<div className="flex items-center gap-2 flex-wrap py-2">

// Après
<div
  className="flex items-center gap-2 flex-nowrap overflow-x-auto sm:flex-wrap sm:overflow-x-visible [&::-webkit-scrollbar]:hidden py-2"
  style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
>
```

Copie exacte de la classe/du style déjà utilisés par `/products`
(`t.dk`/thème non concerné ici, car ce conteneur ne porte aucune
couleur). Aucun filtre, aucune icône, aucune logique de tri, de
réinitialisation ou de sélection n'a été touché — seul le conteneur qui
les enveloppe a changé.

## 3. Garde-fous respectés

- Aucun filtre supprimé, réordonné ou renommé sur aucune des 4 pages.
- Aucune logique de filtrage, de tri ou de réinitialisation modifiée —
  seule la classe CSS/le style inline du conteneur a changé.
- Les menus déroulants (`Select` sur Shop/Academy/Print, `DropdownMenu`
  à cases sur Marketing) sont rendus par Radix dans un portail attaché
  à `document.body`, donc non affectés par le `overflow-x-auto` de leur
  conteneur parent — ouverture/fermeture inchangée, aucun risque de
  troncature visuelle.
- Le défilement horizontal de la rangée ne peut pas sélectionner une
  option, effacer un filtre ni soumettre un formulaire — c'est un
  simple défilement de conteneur (`overflow-x-auto`), sans geste ni
  gestionnaire d'événement ajouté.
- Le mode clair/sombre n'est pas affecté : aucune classe de couleur
  n'a été touchée, uniquement les classes de disposition/défilement.
- La bande de pastilles de catégorie (déjà cohérente, voir section 1)
  n'a pas été modifiée.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur.
- `npm run build` → succès (client + serveur).
- `git diff --stat` sur les 4 fichiers : diff strictement identique et
  minimal (10 insertions / 4 suppressions nettes par fichier — un seul
  conteneur remplacé), confirmant qu'aucun autre changement n'a été
  introduit par erreur.

## 5. Limites connues

- Aucun navigateur réel disponible pour confirmer visuellement le
  défilement tactile sur mobile/tablette, le masquage effectif de la
  scrollbar sur chaque moteur de rendu, ni l'absence de défilement de
  page involontaire — vérifié par comparaison de code strictement
  identique à la classe/au style déjà en production sur `/products`
  (`browse-products.tsx`), qui produit ce comportement avec succès
  aujourd'hui. Une vérification manuelle (desktop, tablette, mobile,
  sur les 4 routes `/stores/9`, `/academy/stores/55`,
  `/print/stores/53`, `/marketing/stores/19`) reste recommandée avant
  mise en production.

---

# Tâche : Refonte Admin Category Management — Cartes, drag-and-drop, pagination, scrollbars de modale

## 1. Audit préalable

**Page auditée** : `client/src/pages/admin/categories-page.tsx` (1722 lignes),
onglets « Categories » (`CategoriesTab`), « Sub-categories » (`SubCategoriesTab`),
« Flavors »/« Sizes »/« Brands » (tous les trois partagent un seul composant
générique `TaxonomyCrudTab`, paramétré par `apiPath`/`queryKey`/`extraFields`).
Les onglets « Category Requests » et « Supplier Categories » (sections distinctes,
pas des `TabsTrigger` de ce `Tabs`) utilisent toujours leurs propres tableaux et
n'étaient pas dans le périmètre de la tâche — non touchés.

**Référence Admin Stores** (`client/src/pages/admin/stores-page.tsx`) :
- Cartes glissables en HTML5 natif (`draggable` + `onDragStart`/`onDragOver`/`onDrop`),
  aucune librairie de drag-and-drop externe — juste un état local `orderedIds`
  (override optimiste après un drop) + une `ref` `dragIdRef` pour mémoriser l'id en
  cours de glissement.
- Le drop calcule `from`/`to` à partir du tableau **complet** et non filtré/paginé
  (`sortedStores`), donc l'ordre reste cohérent même avec un filtre actif ou en
  changeant de page — seules les cartes de la page courante sont réellement
  glissables, mais les indices utilisés pour la réorganisation restent globaux.
- Persistance via un unique PATCH `bulk-order` (`{ orders: [{id, displayOrder}] }`),
  recalculant un `displayOrder` 0..n-1 pour TOUTE la liste à chaque drop — pas de
  swap pair-à-pair comme l'ancien système de flèches haut/bas des Catégories.
- Pagination déjà fournie par le composant partagé
  `client/src/components/ui/data-pagination.tsx` (`usePagination`/`DataPagination`),
  déjà utilisé par plus de 60 pages Admin/Supplier/etc. Préréglages de taille de
  page déjà fixés à `[12, 24, 48, 96]` (+ option « Custom… ») — exactement les
  valeurs demandées par la tâche, aucune nouvelle configuration introduite.
- Scrollbar de référence : `StoreDetailDialog`'s `DialogContent` porte
  `max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:w-1
  [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full
  [&::-webkit-scrollbar-thumb]:bg-gray-700 hover:[&::-webkit-scrollbar-thumb]:bg-gray-600` —
  reproduite telle quelle.

**État initial de chaque onglet Category Management** :
- **Categories** (`CategoriesTab`) : tableau, colonne « Order » avec flèches
  haut/bas (`moveCategory`, swap de `displayOrder` entre 2 lignes adjacentes via 2
  PATCH individuels), boutons Edit/Delete séparés par ligne, pagination déjà
  présente (`usePagination`/`DataPagination`), `categories.displayOrder` existait
  déjà en base (colonne déjà utilisée).
- **Sub-categories** (`SubCategoriesTab`) : tableau, aucune colonne d'ordre,
  aucun champ `displayOrder` en base, boutons Edit/Delete séparés, **aucune
  pagination**.
- **Flavors/Sizes/Brands** (`TaxonomyCrudTab`) : tableau, aucune colonne d'ordre,
  aucun champ `displayOrder` en base pour aucune des 3 tables, boutons
  Edit/Delete séparés, **aucune pagination**. Tri actuel = ordre d'insertion
  renvoyé tel quel par la requête SQL (aucun `ORDER BY` explicite).

**Schéma (`shared/schema.ts`)** : `categories.displayOrder` existait déjà ;
`sub_categories`, `flavors`, `sizes`, `brands` n'avaient **aucune** colonne
d'ordre — confirmé par lecture directe des 4 définitions `pgTable`. C'est le cas
explicitement anticipé par la tâche (« If persistent ordering is missing […]
implement the smallest safe extension required ») : ajout additif d'une seule
colonne `display_order integer not null default 0` à chacune des 4 tables.

**API existante** (`server/routes.ts`) : `GET/POST/PATCH/DELETE` déjà présents
pour les 5 entités ; aucune route `bulk-order` n'existait pour elles (seule
`/api/admin/stores/bulk-order` et les 5 routes `/api/admin/<service>/accounts/bulk-order`
existaient, toutes suivant exactement le même motif). Un commentaire existant
dans le code avertit explicitement que la route `bulk-order` doit être déclarée
**avant** la route `:id`, sinon Express matche `"bulk-order"` comme une valeur de
`:id` (→ `NaN` → échec silencieux) — appliqué pour les 5 nouvelles routes.

## 2. Implémentation

### Schéma + migration (additive, aucune perte de données)

Ajout de `displayOrder: integer("display_order").notNull().default(0)` à
`subCategories`, `flavors`, `sizes`, `brands` (`shared/schema.ts`). Appliqué via
`npx drizzle-kit push` (mécanisme de migration déjà utilisé dans ce projet,
confirmé par `package.json`'s `db:push`) — confirmé par lecture directe du
schéma PostgreSQL que les 4 colonnes existent désormais, chaque ligne existante
récupérant `display_order = 0` par défaut (comptages de lignes inchangés avant/
après : categories 13, sub_categories 30, flavors 19, sizes 19, brands 30).

### Backend (`server/storage.ts`, `server/routes.ts`)

- `getSubCategories`/`getFlavors`/`getSizes`/`getBrands` trient désormais
  explicitement par `(displayOrder, id)` avant de renvoyer les résultats (tri
  stable, les lignes existantes à `displayOrder = 0` restent dans leur ordre
  d'insertion jusqu'à un premier glissement) — `getCategories` triait déjà ainsi.
- 5 nouvelles méthodes `bulkUpdateCategoryOrder`/`bulkUpdateSubCategoryOrder`/
  `bulkUpdateFlavorOrder`/`bulkUpdateSizeOrder`/`bulkUpdateBrandOrder`, copie
  exacte du motif `bulkUpdateStoreOrder` (`Promise.all` de PATCH indépendants
  par ligne) — chaque taxonomie garde son propre ordre indépendant, aucune
  méthode partagée entre entités.
- 5 nouvelles routes `PATCH /api/categories|subcategories|flavors|sizes|brands/bulk-order`
  (`requireAdmin`), chacune déclarée **avant** sa route `:id` correspondante,
  `broadcast("taxonomy_updated", {})` sur succès (même événement déjà utilisé par
  toutes les autres routes de ces 5 entités).

### Frontend (`client/src/pages/admin/categories-page.tsx`)

- **Hook partagé `useDragReorder<T>`** (nouveau, factorisé une seule fois car les
  3 onglets en ont besoin) : reproduit exactement l'état `orderedIds`/`dragIdRef`
  + les handlers `handleDragStart`/`handleDragOver`/`handleDrop` d'Admin Stores,
  paramétré par la liste d'items et un callback `onReorder`. `sorted` reflète
  toujours la liste **complète**, jamais seulement la page courante — donc le
  glisser-déposer reste cohérent avec la pagination et les filtres actifs,
  exactement comme la référence.
- **Constante partagée `MODAL_SCROLLBAR`** : les classes de scrollbar fines
  exactes de `StoreDetailDialog`, réutilisées sur les 3 modales (Category,
  Sub-category, Flavor/Size/Brand).
- **`CategoriesTab`** : table → grille de cartes responsive
  (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`), chaque carte
  affichant icône/nom/description/compteurs (sous-catégories, produits)/statut/
  créateur ; carte cliquable → ouvre la modale d'édition ; glissée via
  `useDragReorder` (remplace `moveCategory`/les flèches haut/bas, colonne
  « Order » supprimée) ; bouton Delete déplacé dans la modale d'édition
  (visible seulement en mode édition, ferme aussi la modale après suppression
  réussie) ; pagination déjà présente, conservée à l'identique (mêmes
  préréglages, même comportement de reset).
- **`SubCategoriesTab`** : même refonte (cartes + DnD + delete-in-modal) +
  **ajout de la pagination** (absente avant) ; le filtre par catégorie parente
  s'applique **après** le tri global par `displayOrder`, donc l'ordre global
  reste cohérent même catégorie filtrée.
- **`TaxonomyCrudTab`** (sert Flavors/Sizes/Brands) : même refonte + **ajout de
  la pagination** pour les 3 — un seul changement dans le composant générique
  couvre les 3 onglets à la fois (pas de triplication) ; les filtres
  catégorie/sous-catégorie s'appliquent après le tri global, même raisonnement
  que Sub-categories.
- Dans les 3 composants, un `<div onClick={(e) => e.stopPropagation()}>`
  enveloppe le toggle Actif/Inactif à l'intérieur de chaque carte — sans cela,
  cliquer sur le toggle aurait aussi déclenché l'ouverture de la modale d'édition
  (le clic bouillonnant jusqu'au `onClick` de la carte).
- Import ajouté : `GripVertical` (icône de poignée de glisser, déjà utilisée par
  Admin Stores).

## 3. Garde-fous respectés

- Aucune donnée réelle supprimée, dupliquée ou réinitialisée — migration
  strictement additive (nouvelle colonne, valeur par défaut 0, aucune ligne
  modifiée par la migration elle-même).
- Chaque taxonomie garde son ordre strictement indépendant — 5 méthodes/5 routes
  bulk-order séparées, aucun couplage entre Categories/Sub-categories/Flavors/
  Sizes/Brands ni avec l'ordre des Stores.
- API existantes (`GET/POST/PATCH/DELETE` par entité) totalement inchangées —
  seules des routes **additionnelles** (`bulk-order`) ont été ajoutées.
- Permissions inchangées : les 5 nouvelles routes utilisent le même middleware
  `requireAdmin` que toutes les routes de taxonomie existantes.
- Category Requests / Supplier Categories / compteurs de résumé / recherche
  globale (en haut de la page) non touchés.
- Mode clair/sombre non modifié : les cartes réutilisent les classes
  `bg-card`/`border`/`text-muted-foreground` déjà thémées globalement par le
  design system Admin (mêmes tokens que les cartes de Stores), aucune couleur
  codée en dur ajoutée.
- Glisser une carte ne peut pas sélectionner un filtre, soumettre un formulaire
  ni supprimer un enregistrement — seul le clic (distinct du glisser en HTML5
  natif) ouvre la modale d'édition, et Delete est un bouton explicite à
  l'intérieur de cette modale.
- Aucune nouvelle dépendance npm ajoutée — le drag-and-drop réutilise l'API HTML5
  native déjà utilisée par Admin Stores, pas de librairie tierce.

## 4. Tests exécutés

- `npx tsc --noEmit` → 0 erreur, à chaque étape (schéma, backend, puis après
  chacun des 3 composants réécrits).
- `npm run build` → succès (client + serveur) après l'ensemble des changements.
- `npx drizzle-kit push` → confirmé par lecture directe du schéma PostgreSQL que
  `display_order` existe désormais sur les 4 tables, comptages de lignes
  inchangés (13/30/19/19/30).
- Redémarrage du serveur de dev (le process Node existant ne rechargeait pas
  automatiquement les changements serveur — `tsx` sans `--watch`) pour charger
  les nouvelles routes.
- **Vérification bout-en-bout en conditions réelles d'authentification** : création
  d'un compte Admin de test jetable (`qa.taxonomy.test@local.test`, mot de passe
  hashé via `bcryptjs`, même mécanisme que les comptes réels), connexion via
  `/api/auth/login`, puis :
  - Confirmé que `displayOrder` apparaît bien dans les réponses des 5 `GET`.
  - `PATCH /api/subcategories/bulk-order` avec un échange réel (sous-catégories
    #1/#2) → `{ok:true}`, re-fetch confirme le nouvel ordre appliqué, puis
    restauré à l'état d'origine.
  - `PATCH /api/flavors|sizes|brands|categories/bulk-order` (no-op) → `{ok:true}`
    sur les 4.
  - Confirmé que `PATCH /api/categories/1` (route `:id` normale) fonctionne
    toujours correctement après l'ajout de la route `bulk-order` juste avant
    elle (aucun conflit de routage Express).
  - Cycle de vie complet sur un enregistrement de test (`POST` création →
    `PATCH` édition → `DELETE` suppression) sur Flavors → confirmé supprimé.
  - Compte Admin de test et tout enregistrement de test supprimés après
    vérification ; comptages finaux des 5 tables identiques à l'état initial.

## 5. Limites connues

- Aucun navigateur réel disponible pour confirmer visuellement le glisser-
  déposer tactile/souris sur les nouvelles cartes, l'apparence exacte de la
  grille responsive (desktop/tablette/mobile), ni le rendu de la scrollbar fine
  dans les 3 modales — vérifié par comparaison de code strictement identique
  aux motifs déjà en production sur Admin Stores (cartes, drag-and-drop,
  scrollbar), par le cycle de vie CRUD + bulk-order réel en base ci-dessus, et
  par `tsc`/`build` stricts. Une vérification manuelle (glisser une carte sur
  desktop et sur mobile, changer de page pendant un glissement, ouvrir/fermer
  les 3 modales en mode sombre) reste recommandée avant mise en production.
- Le filtre « Category Requests » / « Supplier Categories » reste sur son
  design en tableau d'origine (hors périmètre explicite de la tâche — seuls les
  5 onglets Categories/Sub-categories/Flavors/Sizes/Brands étaient visés).
- Comme pour Admin Stores (motif réutilisé à l'identique), si un filtre actif
  masque certaines cartes pendant un glissement, la nouvelle position est
  calculée sur l'ordre global (pas seulement les cartes visibles) — un
  glissement entre deux cartes visuellement proches mais globalement éloignées
  (à cause du filtre) peut déplacer l'élément au-delà d'éléments non visibles à
  l'écran. Ce comportement existe déjà à l'identique sur Admin Stores ; aucune
  régression introduite, juste un héritage assumé du motif réutilisé.
