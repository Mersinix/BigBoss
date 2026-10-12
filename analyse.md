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
