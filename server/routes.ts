import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { registerOAuthRoutes } from "./oauth";
import { sessionMiddleware } from "./session";
import { registerNotificationsRoutes } from "./routes/notifications.routes";
import { registerAuthRoutes } from "./routes/auth.routes";
import { registerProspectingRoutes } from "./routes/prospecting.routes";
import { registerReviewsRoutes } from "./routes/reviews.routes";
import { registerUsersRoutes } from "./routes/users.routes";
import { registerPlatformSettingsRoutes } from "./routes/platform-settings.routes";
import { registerCommunicationRoutes } from "./routes/communication.routes";
import { registerOrdersRoutes } from "./routes/orders.routes";
import { registerAcademyRoutes } from "./routes/academy.routes";
import { registerPrintRoutes } from "./routes/print.routes";
import { registerMaintenanceRoutes } from "./routes/maintenance.routes";
import { registerMarketingRoutes } from "./routes/marketing.routes";
import { registerBaristaRoutes } from "./routes/barista.routes";
import { registerSupplierRoutes } from "./routes/supplier.routes";
import { registerCafeRegistrationRoutes } from "./routes/cafe-registrations.routes";
import { registerAcademyBaristaRegistrationRoutes } from "./routes/academy-barista-registrations.routes";
import { registerShopCatalogRoutes } from "./routes/shop-catalog.routes";
import { registerDeliveryRoutes } from "./routes/delivery.routes";

declare module "express-session" {
  interface SessionData { userId: number; }
}


export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.use(sessionMiddleware);

  // Session inactivity timeout (task: "Expand Global Authentication & Security
  // Settings") — only applied to already-authenticated requests, and only when
  // the admin has configured a value (null/unset preserves today's exact
  // behavior: no maxAge at all, i.e. a browser-session cookie). Setting
  // req.session.cookie.maxAge on every authenticated request keeps extending
  // the cookie's expiry forward from "now" (rolling), so the session actually
  // expires N seconds after the user's LAST request, not a fixed absolute time
  // — enforced server-side, dynamically reconfigurable without a restart since
  // it's read fresh from the DB on every request. Never confused with a
  // separate "remember me"/refresh token — this app has none; it only ever
  // controls this one session cookie's lifetime.
  app.use(async (req: any, _res, next) => {
    if (req.session?.userId) {
      try {
        const { sessionInactivityTimeoutSeconds } = await storage.getLoginSecuritySettings();
        if (sessionInactivityTimeoutSeconds != null) {
          req.session.cookie.maxAge = sessionInactivityTimeoutSeconds * 1000;
        }
      } catch {
        // Fail open — never break an authenticated request over a settings-read
        // hiccup; the session simply keeps whatever maxAge it already had.
      }
    }
    next();
  });

  registerOAuthRoutes(app);

  registerNotificationsRoutes(app);
  registerAuthRoutes(app);
  registerProspectingRoutes(app);
  registerReviewsRoutes(app);
  registerUsersRoutes(app);
  registerPlatformSettingsRoutes(app);
  registerCommunicationRoutes(app);
  registerOrdersRoutes(app);
  registerAcademyRoutes(app);
  registerPrintRoutes(app);
  registerMaintenanceRoutes(app);
  registerMarketingRoutes(app);
  registerBaristaRoutes(app);
  registerSupplierRoutes(app);
  registerCafeRegistrationRoutes(app);
  registerAcademyBaristaRegistrationRoutes(app);
  registerShopCatalogRoutes(app);
  registerDeliveryRoutes(app);

  return httpServer;
}

