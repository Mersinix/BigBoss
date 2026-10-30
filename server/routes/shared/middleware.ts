// Shared auth/role/approval-gate middleware (Stage 1 routes.ts refactor).
//
// These were previously closures defined inside `registerRoutes(...)` in
// server/routes.ts, with implicit closure access to `storage`. Every domain
// route module now needs them, so they are hoisted here as plain exported
// functions with an explicit `storage` import — the logic of every function
// below is unchanged byte-for-byte from the original closures; only the
// binding mechanism (closure -> import) changed.
import { storage } from "../../storage";

export const requireAuth = (req: any, res: any, next: any) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Unauthorized' });
  next();
};

export const requireAdmin = async (req: any, res: any, next: any) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Unauthorized' });
  const user = await storage.getUser(req.session.userId);
  if (!user || !['SUPER_ADMIN', 'ADMIN'].includes(user.role)) return res.status(403).json({ message: 'Forbidden' });
  next();
};

export const requireApprovedCafeOwner = async (req: any, res: any, next: any) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Unauthorized' });
  const user = await storage.getUser(req.session.userId);
  if (!user || user.role !== 'CAFE_OWNER' || user.status !== 'approved') {
    return res.status(403).json({ message: 'Only approved cafe owners can perform this action' });
  }
  next();
};

// Academy registrations accept two participant types on the same shared
// model — an approved Coffee Owner or an approved Barista Marketplace
// professional (Espace Barista Marketplace → Academy). See the
// participantType note on academyRegistrations in shared/schema.ts.
export const requireApprovedAcademyRegistrant = async (req: any, res: any, next: any) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Unauthorized' });
  const user = await storage.getUser(req.session.userId);
  if (!user || !['CAFE_OWNER', 'BARISTA_MARKETPLACE'].includes(user.role) || user.status !== 'approved') {
    return res.status(403).json({ message: 'Only approved Coffee Owners or Baristas can perform this action' });
  }
  next();
};

export const requireApprovedSupplier = async (req: any, res: any, next: any) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Unauthorized' });
  const user = await storage.getUser(req.session.userId);
  if (!user || user.role !== 'SUPPLIER' || user.status !== 'approved') {
    return res.status(403).json({ message: 'Only approved suppliers can perform this action' });
  }
  next();
};

export const requireApprovedDeliveryCompany = async (req: any, res: any, next: any) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Unauthorized' });
  const user = await storage.getUser(req.session.userId);
  if (!user || user.role !== 'DELIVERY_COMPANY' || user.status !== 'approved') {
    return res.status(403).json({ message: 'Only approved delivery companies can perform this action' });
  }
  (req as any).deliveryCompany = user;
  next();
};

export const requireDriver = async (req: any, res: any, next: any) => {
  if (!req.session.userId) return res.status(401).json({ message: 'Unauthorized' });
  const user = await storage.getUser(req.session.userId);
  if (!user || user.role !== 'DRIVER' || user.status !== 'approved') {
    return res.status(403).json({ message: 'Only drivers can perform this action' });
  }
  (req as any).driver = user;
  next();
};
