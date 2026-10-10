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
