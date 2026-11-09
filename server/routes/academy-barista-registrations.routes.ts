import { requireAdmin } from "./shared/middleware";
import { isValidRegistrationPassword, registrationPasswordMessage } from "./shared/helpers";
import { storage } from "../storage";
import { broadcast } from "../ws";
import { notify } from "../notify";
import { z } from "zod";
import type { Express } from "express";

// ── Academy-initiated barista registration & admin approval workflow ───────────────────
// Same architecture as cafe-registrations.routes.ts (Supplier café registrations): an
// Academy (role BARISTA_ACADEMY) submits a candidate barista via Business → Barista (no
// account is created yet — see shared/schema.ts academyBaristaRegistrations). An Admin
// reviews it under Utilisateurs → "Academy utilisateurs" and either approves it (creating a
// real BARISTA_MARKETPLACE account, atomically — see storage.approveAcademyBaristaRegistration)
// or rejects it.

const registrationCreateSchema = z.object({
  baristaName: z.string().min(1),
  contactName: z.string().min(1),
  email: z.string().email(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
});

const approveSchema = z.object({
  baristaName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  isWhatsapp: z.boolean().optional(),
  profileImageUrl: z.string().optional().nullable(),
  password: z.string().min(1),
  address: z.string().optional().nullable(),
  locationLat: z.union([z.string(), z.number()]).optional().nullable(),
  locationLng: z.union([z.string(), z.number()]).optional().nullable(),
  locationPlaceId: z.string().optional().nullable(),
  locationDetails: z.any().optional().nullable(),
});

const rejectSchema = z.object({
  reason: z.string().optional().nullable(),
});

// Same inline role-check convention already used throughout academy.routes.ts for every
// Academy-owner action (courses, sessions, profile) — no dedicated "requireApprovedAcademy"
// middleware exists there, and none of those actions gate on account status either.
async function requireBaristaAcademy(req: any, res: any, next: any) {
  if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
  const user = await storage.getUser(req.session.userId);
  if (!user || user.role !== "BARISTA_ACADEMY") return res.status(403).json({ message: "Barista Academy access required" });
  next();
}

export function registerAcademyBaristaRegistrationRoutes(app: Express): void {
  // ── Academy side ───────────────────────────────────────────────────────────

  app.get('/api/academy/barista-registrations', requireBaristaAcademy, async (req: any, res) => {
    try {
      res.json(await storage.getAcademyBaristaRegistrationsForAcademy(req.session.userId));
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? 'Error fetching registrations' });
    }
  });

  app.post('/api/academy/barista-registrations', requireBaristaAcademy, async (req: any, res) => {
    try {
      const data = registrationCreateSchema.parse(req.body);
      const registration = await storage.createAcademyBaristaRegistration(req.session.userId, data);
      broadcast('admin_user_directory_changed');
      res.status(201).json(registration);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(400).json({ message: err.message ?? 'Error creating registration' });
    }
  });

  // ── Admin side ─────────────────────────────────────────────────────────────

  app.get('/api/admin/academy-barista-registrations', requireAdmin, async (req, res) => {
    try {
      res.json(await storage.getAdminAcademyBaristaRegistrations());
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? 'Error fetching registrations' });
    }
  });

  app.patch('/api/admin/academy-barista-registrations/:id/approve', requireAdmin, async (req, res) => {
    try {
      const data = approveSchema.parse(req.body);
      const { passwordMinLength } = await storage.getLoginSecuritySettings();
      if (!isValidRegistrationPassword(data.password, passwordMinLength)) {
        return res.status(400).json({ message: registrationPasswordMessage(passwordMinLength) });
      }
      const id = parseInt(req.params.id);
      const { registration, user } = await storage.approveAcademyBaristaRegistration(id, req.session.userId!, {
        baristaName: data.baristaName,
        email: data.email,
        phone: data.phone ?? null,
        isWhatsapp: !!data.isWhatsapp,
        profileImageUrl: data.profileImageUrl?.trim() || null,
        password: data.password,
        address: data.address ?? null,
        locationLat: data.locationLat != null ? String(data.locationLat) : null,
        locationLng: data.locationLng != null ? String(data.locationLng) : null,
        locationPlaceId: data.locationPlaceId ?? null,
        locationDetails: data.locationDetails ?? null,
      });
      broadcast('admin_user_directory_changed');
      await notify({
        userId: registration.academyId,
        service: "ADMIN", type: "academy_barista_registration_approved", priority: "SUCCESS",
        title: "Inscription approuvée",
        message: `L'inscription de "${registration.baristaName}" a été approuvée.`,
        entityType: "academy_barista_registration", entityId: registration.id,
      });
      res.json({ registration, user });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(400).json({ message: err.message ?? 'Error approving registration' });
    }
  });

  app.patch('/api/admin/academy-barista-registrations/:id/reject', requireAdmin, async (req, res) => {
    try {
      const { reason } = rejectSchema.parse(req.body);
      const id = parseInt(req.params.id);
      const registration = await storage.rejectAcademyBaristaRegistration(id, req.session.userId!, reason ?? null);
      broadcast('admin_user_directory_changed');
      await notify({
        userId: registration.academyId,
        service: "ADMIN", type: "academy_barista_registration_rejected", priority: "URGENT",
        title: "Inscription refusée",
        message: reason
          ? `L'inscription de "${registration.baristaName}" a été refusée : ${reason}`
          : `L'inscription de "${registration.baristaName}" a été refusée.`,
        entityType: "academy_barista_registration", entityId: registration.id,
      });
      res.json(registration);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(400).json({ message: err.message ?? 'Error rejecting registration' });
    }
  });
}
