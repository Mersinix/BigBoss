import { db } from "../../db";
import { eq } from "drizzle-orm";
import {
  landingConfig, type LandingConfig,
  platformServices, messagingSettings, DEFAULT_SERVICE_ORDER,
  type ServiceStatesMap, type ServiceKey, type ServiceState, type MarketplaceServiceId,
  heroActionSettings, type HeroService, type HeroActionSettingsMap,
  serviceHeroConfigs, type ServiceHeroConfig, type ServiceHeroConfigMap, type ServiceHeroHeight, type ServiceHeroHAlign, type ServiceHeroVAlign,
  accountDarkModeSettings, type DarkModeAccount, type AccountDarkModeSettingsMap, type AccountThemeMode,
} from "@shared/schema";

// Stage 2 — Batch 20 business-domain consolidation. Merges Landing Config
// (Batch 6) and Platform Services (Batch 7) into one PlatformSettingsStorage
// class — both had the exact same sole external consumer,
// server/routes/platform-settings.routes.ts (verified via a whole-repository
// consumer search before merging; getMessagingSettings is additionally used
// by server/routes/communication.routes.ts, unaffected by this merge).
//
// This merge also eliminates PlatformServicesStorage's `facade:
// DatabaseStorage` constructor parameter: its only two uses
// (getServiceOrder/setServiceOrder calling
// this.facade.getLandingConfig()/updateLandingConfig()) are now plain
// same-class `this.*` calls, since both methods live in the same class now.
//
// Auth Provider Settings and Login Security Settings were deliberately NOT
// merged here, despite also living under the "platform settings" admin page
// — see server/STORAGE_ARCHITECTURE.md ("Stage 2 — Batch 20"): both have
// real consumers outside the settings page itself (server/oauth.ts's login
// flow; server/routes.ts's global session-inactivity middleware plus
// auth.routes.ts/users.routes.ts), marking them as a separate Auth/Security
// business domain, not administrative display configuration.
//
// Batch 36 — Hero Settings (getHeroActionSettings/setHeroActionSettings,
// getServiceHeroConfigs/setServiceHeroConfig/defaultServiceHeroConfig) and
// Dark Mode Settings (getAccountDarkModeSettings/setAccountDarkModeSetting)
// were added to this same class. All three clusters (Hero actions, Service
// hero visual configs, Account dark-mode policy) were physically filed
// inside server/storage.ts's old "PRINT admin" section — an adjacency trap
// first flagged in Batch 31's own report, since reading their bodies shows
// they govern EVERY service account (SHOP/BARISTA/ACADEMY/MAINTENANCE/
// PRINT/MARKETING for the first two; 9 accounts including ADMIN/SUPPLIER/
// DRIVER for the third), never anything Print-specific. Their sole external
// consumer is server/routes/platform-settings.routes.ts — the exact same
// single consumer already cited above for Landing Config/Platform
// Services/Messaging Settings, confirmed via a whole-repository search
// before merging. No facade dependency was needed: all four internal
// `this.*` calls among these six methods were already same-class calls
// before the move (defaultServiceHeroConfig/getHeroActionSettings/
// getServiceHeroConfigs/getAccountDarkModeSettings), and remain so here.
//
// Every method body below is unchanged from its original file — this is a
// pure move/merge, not a rewrite.
export class PlatformSettingsStorage {
  // ── Landing Config ───────────────────────────────────────────────────────
  async getLandingConfig(): Promise<LandingConfig> {
    const rows = await db.select().from(landingConfig).limit(1);
    if (rows.length > 0) return rows[0];
    // Auto-create default row
    const [created] = await db.insert(landingConfig).values({}).returning();
    return created;
  }

  async updateLandingConfig(data: Partial<Omit<LandingConfig, "id" | "updatedAt">>): Promise<LandingConfig> {
    const existing = await this.getLandingConfig();
    const [updated] = await db
      .update(landingConfig)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(landingConfig.id, existing.id))
      .returning();
    return updated;
  }

  async getCurrency(): Promise<string> {
    const config = await this.getLandingConfig();
    return config.currency ?? 'DT';
  }

  async setCurrency(symbol: string): Promise<string> {
    await this.updateLandingConfig({ currency: symbol });
    return symbol;
  }

  // ── Platform Services ────────────────────────────────────────────────────
  async getServiceStates(): Promise<ServiceStatesMap> {
    const ALL_SERVICES: ServiceKey[] = ['PRINTING', 'MARKETING', 'BARISTA_ACADEMY', 'BARISTA_MARKETPLACE', 'MAINTENANCE'];
    const rows = await db.select().from(platformServices);
    const map: ServiceStatesMap = { PRINTING: 'VISIBLE', MARKETING: 'VISIBLE', BARISTA_ACADEMY: 'VISIBLE', BARISTA_MARKETPLACE: 'VISIBLE', MAINTENANCE: 'VISIBLE' };
    for (const row of rows) {
      map[row.service as ServiceKey] = row.state as ServiceState;
    }
    const missing = ALL_SERVICES.filter((s) => !rows.some((r) => r.service === s));
    if (missing.length) {
      for (const service of missing) {
        await db.insert(platformServices).values({ service, state: 'VISIBLE' }).onConflictDoNothing();
      }
    }
    return map;
  }

  async setServiceState(service: ServiceKey, state: ServiceState): Promise<ServiceStatesMap> {
    const existing = await db.select().from(platformServices).where(eq(platformServices.service, service));
    if (existing.length) {
      await db.update(platformServices).set({ state, updatedAt: new Date() }).where(eq(platformServices.service, service));
    } else {
      await db.insert(platformServices).values({ service, state });
    }
    return this.getServiceStates();
  }

  async getMessagingSettings() {
    const [row] = await db.select().from(messagingSettings).limit(1);
    if (row) {
      return {
        globalVisible: row.globalVisible,
        supplierMessagingEnabled: row.supplierMessagingEnabled,
        maintenanceMessagingEnabled: row.maintenanceMessagingEnabled,
        baristaMessagingEnabled: row.baristaMessagingEnabled,
        academyMessagingEnabled: row.academyMessagingEnabled,
        broadcastsEnabled: row.broadcastsEnabled,
        gracePeriodMinutes: row.gracePeriodMinutes,
      };
    }
    const [created] = await db.insert(messagingSettings).values({}).returning();
    return {
      globalVisible: created.globalVisible,
      supplierMessagingEnabled: created.supplierMessagingEnabled,
      maintenanceMessagingEnabled: created.maintenanceMessagingEnabled,
      baristaMessagingEnabled: created.baristaMessagingEnabled,
      academyMessagingEnabled: created.academyMessagingEnabled,
      broadcastsEnabled: created.broadcastsEnabled,
      gracePeriodMinutes: created.gracePeriodMinutes,
    };
  }

  async updateMessagingSettings(updates: Partial<{
    globalVisible: boolean;
    supplierMessagingEnabled: boolean;
    maintenanceMessagingEnabled: boolean;
    baristaMessagingEnabled: boolean;
    academyMessagingEnabled: boolean;
    broadcastsEnabled: boolean;
    gracePeriodMinutes: number;
  }>) {
    const current = await this.getMessagingSettings();
    const next = {
      ...current,
      ...updates,
      gracePeriodMinutes: Math.max(1, Math.min(240, Math.round(updates.gracePeriodMinutes ?? current.gracePeriodMinutes))),
    };
    const [row] = await db.select({ id: messagingSettings.id }).from(messagingSettings).limit(1);
    if (row) {
      await db.update(messagingSettings).set({ ...next, updatedAt: new Date() }).where(eq(messagingSettings.id, row.id));
    } else {
      await db.insert(messagingSettings).values(next);
    }
    return next;
  }

  // getServiceOrder/setServiceOrder originally reached Landing Config via a
  // `facade: DatabaseStorage` constructor parameter (this.facade.getLandingConfig()/
  // updateLandingConfig()). Now that Landing Config lives in this same class,
  // these are plain same-class calls — the facade reference is gone,
  // eliminating that cross-domain dependency entirely (see this file's own
  // header comment and server/STORAGE_ARCHITECTURE.md, Batch 20).
  async getServiceOrder(): Promise<MarketplaceServiceId[]> {
    const config = await this.getLandingConfig();
    const configured = Array.isArray(config.serviceOrder) ? config.serviceOrder : [];
    const valid = configured.filter((id): id is MarketplaceServiceId =>
      (DEFAULT_SERVICE_ORDER as readonly string[]).includes(id),
    );
    const uniqueValid = Array.from(new Set(valid));
    return [...uniqueValid, ...DEFAULT_SERVICE_ORDER.filter((id) => !uniqueValid.includes(id))];
  }

  async setServiceOrder(order: MarketplaceServiceId[]): Promise<MarketplaceServiceId[]> {
    const valid = order.length === DEFAULT_SERVICE_ORDER.length
      && new Set(order).size === DEFAULT_SERVICE_ORDER.length
      && order.every((id) => (DEFAULT_SERVICE_ORDER as readonly string[]).includes(id));
    if (!valid) throw new Error("Invalid service order");
    await this.updateLandingConfig({ serviceOrder: order });
    return order;
  }

  // ── Hero Settings ────────────────────────────────────────────────────────
  // Admin-controlled per-service Coffee-Owner hero "Fast Search"/"Report" icon
  // visibility — mirrors getServiceStates/setServiceState exactly (auto-seeds
  // missing rows, defaults preserve today's behavior: enabled everywhere).
  async getHeroActionSettings(): Promise<HeroActionSettingsMap> {
    const ALL_SERVICES: HeroService[] = ['SHOP', 'BARISTA', 'ACADEMY', 'MAINTENANCE', 'PRINT', 'MARKETING'];
    const rows = await db.select().from(heroActionSettings);
    const map = {} as HeroActionSettingsMap;
    for (const service of ALL_SERVICES) map[service] = { fastSearchEnabled: true, reportEnabled: true };
    for (const row of rows) {
      map[row.service as HeroService] = { fastSearchEnabled: row.fastSearchEnabled, reportEnabled: row.reportEnabled };
    }
    const missing = ALL_SERVICES.filter((s) => !rows.some((r) => r.service === s));
    if (missing.length) {
      for (const service of missing) {
        await db.insert(heroActionSettings).values({ service }).onConflictDoNothing();
      }
    }
    return map;
  }

  async setHeroActionSettings(service: HeroService, updates: Partial<{ fastSearchEnabled: boolean; reportEnabled: boolean }>): Promise<HeroActionSettingsMap> {
    const existing = await db.select().from(heroActionSettings).where(eq(heroActionSettings.service, service));
    if (existing.length) {
      await db.update(heroActionSettings).set({ ...updates, updatedAt: new Date() }).where(eq(heroActionSettings.service, service));
    } else {
      await db.insert(heroActionSettings).values({ service, ...updates });
    }
    return this.getHeroActionSettings();
  }

  // Admin-controlled visual customization of each Coffee-Owner-facing
  // service hero (background/gradient, subtitle override, height, content
  // alignment, info-row toggle) — mirrors getHeroActionSettings exactly.
  private defaultServiceHeroConfig(): ServiceHeroConfig {
    return {
      backgroundImages: [],
      rotationIntervalSeconds: 6,
      gradientEnabled: false,
      gradientFrom: "",
      gradientVia: "",
      gradientTo: "",
      gradientDirection: "to bottom right",
      subtitle: null,
      subtitleEnabled: true,
      subtitleColorLight: "",
      subtitleColorDark: "",
      height: "medium",
      horizontalAlign: "center",
      verticalAlign: "center",
      infoRowEnabled: true,
      overlayEnabled: true,
      overlayColor: "#000000",
      overlayOpacity: 30,
    };
  }

  async getServiceHeroConfigs(): Promise<ServiceHeroConfigMap> {
    const ALL_SERVICES: HeroService[] = ['SHOP', 'BARISTA', 'ACADEMY', 'MAINTENANCE', 'PRINT', 'MARKETING'];
    const rows = await db.select().from(serviceHeroConfigs);
    const map = {} as ServiceHeroConfigMap;
    for (const service of ALL_SERVICES) map[service] = this.defaultServiceHeroConfig();
    for (const row of rows) {
      map[row.service as HeroService] = {
        backgroundImages: row.backgroundImages ?? [],
        rotationIntervalSeconds: row.rotationIntervalSeconds,
        gradientEnabled: row.gradientEnabled,
        gradientFrom: row.gradientFrom,
        gradientVia: row.gradientVia,
        gradientTo: row.gradientTo,
        gradientDirection: row.gradientDirection,
        subtitle: row.subtitle,
        subtitleEnabled: row.subtitleEnabled,
        subtitleColorLight: row.subtitleColorLight,
        subtitleColorDark: row.subtitleColorDark,
        height: row.height as ServiceHeroHeight,
        horizontalAlign: row.horizontalAlign as ServiceHeroHAlign,
        verticalAlign: row.verticalAlign as ServiceHeroVAlign,
        infoRowEnabled: row.infoRowEnabled,
        overlayEnabled: row.overlayEnabled,
        overlayColor: row.overlayColor,
        overlayOpacity: row.overlayOpacity,
      };
    }
    const missing = ALL_SERVICES.filter((s) => !rows.some((r) => r.service === s));
    for (const service of missing) {
      await db.insert(serviceHeroConfigs).values({ service }).onConflictDoNothing();
    }
    return map;
  }

  async setServiceHeroConfig(service: HeroService, updates: Partial<ServiceHeroConfig>): Promise<ServiceHeroConfigMap> {
    const existing = await db.select().from(serviceHeroConfigs).where(eq(serviceHeroConfigs.service, service));
    if (existing.length) {
      await db.update(serviceHeroConfigs).set({ ...updates, updatedAt: new Date() }).where(eq(serviceHeroConfigs.service, service));
    } else {
      await db.insert(serviceHeroConfigs).values({ service, ...updates });
    }
    return this.getServiceHeroConfigs();
  }

  // ── Dark Mode Settings ───────────────────────────────────────────────────
  // Admin-controlled theme POLICY for the 7 non-Coffee-Owner service
  // accounts — mirrors getHeroActionSettings/setHeroActionSettings exactly
  // (auto-seeds missing rows, default BOTH so introducing this control
  // doesn't restrict the dark mode capability the accounts are getting in
  // the same change).
  async getAccountDarkModeSettings(): Promise<AccountDarkModeSettingsMap> {
    const ALL_ACCOUNTS: DarkModeAccount[] = ['BARISTA_ACADEMY', 'BARISTA_MARKETPLACE', 'DELIVERY_COMPANY', 'DRIVER', 'PRINTER', 'MAINTENANCE', 'MARKETING', 'SUPPLIER', 'ADMIN'];
    const rows = await db.select().from(accountDarkModeSettings);
    const map = {} as AccountDarkModeSettingsMap;
    for (const account of ALL_ACCOUNTS) map[account] = 'BOTH';
    for (const row of rows) map[row.account as DarkModeAccount] = row.mode;
    const missing = ALL_ACCOUNTS.filter((a) => !rows.some((r) => r.account === a));
    if (missing.length) {
      for (const account of missing) {
        await db.insert(accountDarkModeSettings).values({ account }).onConflictDoNothing();
      }
    }
    return map;
  }

  async setAccountDarkModeSetting(account: DarkModeAccount, mode: AccountThemeMode): Promise<AccountDarkModeSettingsMap> {
    const existing = await db.select().from(accountDarkModeSettings).where(eq(accountDarkModeSettings.account, account));
    if (existing.length) {
      await db.update(accountDarkModeSettings).set({ mode, updatedAt: new Date() }).where(eq(accountDarkModeSettings.account, account));
    } else {
      await db.insert(accountDarkModeSettings).values({ account, mode });
    }
    return this.getAccountDarkModeSettings();
  }
}
