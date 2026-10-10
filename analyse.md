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
