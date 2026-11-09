import { requireAdmin, requireApprovedSupplier } from "./shared/middleware";
import { isValidRegistrationPassword, registrationPasswordMessage } from "./shared/helpers";
import { storage } from "../storage";
import { broadcast } from "../ws";
import { notify } from "../notify";
import { z } from "zod";
import type { Express } from "express";

// ── Supplier-initiated café registration & admin approval workflow ──────────────────────
// A Supplier submits a new café via Supplier → Cafés → "Inscriptions" (no account is
// created yet — see shared/schema.ts supplierCafeRegistrations). An Admin reviews it under
// Utilisateurs → "Supplier utilisateurs" and either approves it (creating a real CAFE_OWNER
// account, atomically — see storage.approveCafeRegistration) or rejects it. Replaces the old
// createCafeForSupplier instant-approval path.

const registrationCreateSchema = z.object({
  cafeName: z.string().min(1),
  contactName: z.string().min(1),
  email: z.string().email(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
});

const approveSchema = z.object({
  contactName: z.string().min(1),
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

export function registerCafeRegistrationRoutes(app: Express): void {
  // ── Supplier side ──────────────────────────────────────────────────────────

  app.get('/api/supplier/cafe-registrations', requireApprovedSupplier, async (req, res) => {
    try {
      res.json(await storage.getSupplierCafeRegistrations(req.session.userId!));
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? 'Error fetching registrations' });
    }
  });

  app.post('/api/supplier/cafe-registrations', requireApprovedSupplier, async (req, res) => {
    try {
      const data = registrationCreateSchema.parse(req.body);
      const registration = await storage.createSupplierCafeRegistration(req.session.userId!, data);
      broadcast('admin_user_directory_changed');
      res.status(201).json(registration);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(400).json({ message: err.message ?? 'Error creating registration' });
    }
  });

  // ── Admin side ─────────────────────────────────────────────────────────────

  app.get('/api/admin/cafe-registrations', requireAdmin, async (req, res) => {
    try {
      res.json(await storage.getAdminCafeRegistrations());
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? 'Error fetching registrations' });
    }
  });

  app.patch('/api/admin/cafe-registrations/:id/approve', requireAdmin, async (req, res) => {
    try {
      const data = approveSchema.parse(req.body);
      const { passwordMinLength } = await storage.getLoginSecuritySettings();
      if (!isValidRegistrationPassword(data.password, passwordMinLength)) {
        return res.status(400).json({ message: registrationPasswordMessage(passwordMinLength) });
      }
      const id = parseInt(req.params.id);
      const { registration, user } = await storage.approveCafeRegistration(id, req.session.userId!, {
        contactName: data.contactName,
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
        userId: registration.supplierId,
        service: "ADMIN", type: "cafe_registration_approved", priority: "SUCCESS",
        title: "Inscription approuvée",
        message: `L'inscription de "${registration.cafeName}" a été approuvée.`,
        entityType: "supplier_cafe_registration", entityId: registration.id,
      });
      res.json({ registration, user });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(400).json({ message: err.message ?? 'Error approving registration' });
    }
  });

  app.patch('/api/admin/cafe-registrations/:id/reject', requireAdmin, async (req, res) => {
    try {
      const { reason } = rejectSchema.parse(req.body);
      const id = parseInt(req.params.id);
      const registration = await storage.rejectCafeRegistration(id, req.session.userId!, reason ?? null);
      broadcast('admin_user_directory_changed');
      await notify({
        userId: registration.supplierId,
        service: "ADMIN", type: "cafe_registration_rejected", priority: "URGENT",
        title: "Inscription refusée",
        message: reason
          ? `L'inscription de "${registration.cafeName}" a été refusée : ${reason}`
          : `L'inscription de "${registration.cafeName}" a été refusée.`,
        entityType: "supplier_cafe_registration", entityId: registration.id,
      });
      res.json(registration);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(400).json({ message: err.message ?? 'Error rejecting registration' });
    }
  });
}
