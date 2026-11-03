import { db } from "../../db";
import { eq, and, or, inArray, desc, isNull, ne, gte, lte, sql } from "drizzle-orm";
import {
  users, orders, subOrders, deliveries, maintenanceProfiles, maintenanceReservations,
  baristaMarketplaceRequests, academyRegistrations,
  conversations, conversationParticipants, messages,
  type ConversationSummary, type ConversationMessageRow, type EligibleContact,
} from "@shared/schema";
import type { DatabaseStorage } from "../../storage";

// Stage 2 — Batch 33: the COMPLETE generic Messages/Messaging business
// domain, extracted into one file per the project's permanent "one
// business domain = one storage file" rule (adopted Batch 28, reapplied
// Batches 29-32 for Maintenance/Marketing/Print/Academy). Named
// `messages.storage.ts` to match the project's existing
// `<name>.storage.ts` convention (the task text said
// `messages-storage.ts` — the same naming slip already caught once for
// Barista and pre-empted since).
//
// No pre-existing Messages/Messaging-specific storage file was found
// anywhere in the repository — like Print (Batch 31) and Academy
// (Batch 32), this is a single-step extraction straight out of
// server/storage.ts, not a consolidation.
//
// This is deliberately a GENERIC messaging domain: it owns
// Conversations, Messages, Participants, messaging-relationship
// eligibility/sync, and the Admin messaging surfaces — never the
// business entities (reservations, orders, registrations, requests)
// that eligibility checks happen to read. Those stay owned by their
// own domains; Messages only ever READS them to answer "are these two
// users allowed to message each other right now."
//
// === The Academy reverse dependency (see Batch 32's finding) ===
// `hasEligibleMessagingRelationship`'s ACADEMY branch reads
// `academyRegistrations` directly (status IN {PENDING, CONFIRMED}, for
// the specific academyUserId/registrantId pair) to decide eligibility.
// Investigated exactly per this batch's Part 5 instructions:
//   - This is a plain `db.select(...).from(academyRegistrations)` —
//     never a call into any AcademyStorage method, and never anything
//     resembling a circular import; AcademyStorage has no reference to
//     MessagesStorage in either direction.
//   - It reads ONLY `academyRegistrations.status`/`academyUserId`/
//     `cafeOwnerId` — it does not touch the registration state-machine
//     (`ACADEMY_REGISTRATION_TRANSITIONS`, owned by AcademyStorage) and
//     does not duplicate or reimplement any Academy business rule; it
//     merely asks "does an active-ish registration exist between these
//     two people," a question Messages needs answered for its own
//     eligibility gate.
//   - The equivalent BARISTA/MAINTENANCE/SHOP branches do the exact
//     same thing against `baristaMarketplaceRequests`/
//     `maintenanceReservations`/`orders`+`subOrders` — this is an
//     established, symmetric pattern across all five service branches,
//     not something unique or newly introduced for Academy.
//   - Per the task's explicit instruction to prefer the safest
//     behavior-preserving option: the direct table read was KEPT
//     exactly as-is (not converted to a facade call into AcademyStorage,
//     which would be strictly worse — it would add a facade dependency
//     for zero behavioral benefit, since AcademyStorage exposes no
//     method that returns exactly this registration-eligibility
//     boolean, and inventing one would be redesigning the integration,
//     which this batch is explicitly told not to do).
// The `academyRegistrations` import this file needs is therefore its
// own, independent of AcademyStorage's — no coupling between the two
// domain files was created or removed.
//
// Has a facade constructor argument for its own cross-domain calls:
// `getMessagingSettings()` (×3 call sites — a thin delegate already
// resident on DatabaseStorage, forwarding to the already-extracted
// `PlatformSettingsStorage`) and `getUser()` (×2 call sites — the
// not-yet-extracted User/Auth domain).
export class MessagesStorage {
  constructor(private facade: DatabaseStorage) {}

  // ── Messaging ──────────────────────────────────────────────────────────────

  /** True if `driverId` has an active (not DELIVERED/CANCELLED) delivery connecting them to
   *  `otherId`, who must be the delivery's supplier or cafe owner (per `otherRole`). Backs
   *  Driver ↔ Supplier / Driver ↔ Coffee Owner messaging eligibility. */
  private async hasActiveDeliveryRelationship(driverId: number, otherId: number, otherRole: string): Promise<boolean> {
    const rows = await db.select({ status: deliveries.status }).from(deliveries).where(and(
      eq(deliveries.driverId, driverId),
      otherRole === "SUPPLIER" ? eq(deliveries.supplierId, otherId) : eq(deliveries.cafeId, otherId),
    ));
    const activeStatuses = new Set(["ASSIGNED", "PICKED_UP", "IN_TRANSIT"]);
    return rows.some((r) => activeStatuses.has(r.status));
  }

  private async hasEligibleMessagingRelationship(userA: number, userB: number, service: string): Promise<boolean> {
    const people = await db.select({ id: users.id, role: users.role })
      .from(users)
      .where(inArray(users.id, [userA, userB]));
    const roles = new Map(people.map(p => [p.id, p.role]));
    const roleA = roles.get(userA);
    const roleB = roles.get(userB);
    const settings = await this.facade.getMessagingSettings();
    const isAdminPair = roleA === "ADMIN" || roleA === "SUPER_ADMIN" || roleB === "ADMIN" || roleB === "SUPER_ADMIN";
    if (!isAdminPair && !settings.globalVisible) return false;

    if (isAdminPair) {
      return true;
    }

    if (service === "SHOP" && ((roleA === "SUPPLIER" && roleB === "CAFE_OWNER") || (roleB === "SUPPLIER" && roleA === "CAFE_OWNER"))) {
      if (!settings.supplierMessagingEnabled) return false;
      const supplierId = roleA === "SUPPLIER" ? userA : userB;
      const cafeId = roleA === "CAFE_OWNER" ? userA : userB;
      const directOrders = await db.select({ status: orders.status })
        .from(orders)
        .where(and(eq(orders.supplierId, supplierId), eq(orders.cafeId, cafeId)));
      const supplierSubOrders = await db.select({ status: subOrders.status })
        .from(subOrders)
        .innerJoin(orders, eq(subOrders.orderId, orders.id))
        .where(and(eq(subOrders.supplierId, supplierId), eq(orders.cafeId, cafeId)));
      const activeStatuses = new Set(["PENDING", "CONFIRMED", "PREPARING", "READY", "IN_DELIVERY"]);
      return [...directOrders, ...supplierSubOrders].some(order => activeStatuses.has(order.status));
    }

    // Driver ↔ Supplier / Driver ↔ Coffee Owner — reuses the SHOP service tag (same
    // conversation ecosystem as the Supplier↔Coffee Owner order chat above) scoped to an
    // active (not yet DELIVERED/CANCELLED) delivery connecting them. Backs the Driver
    // Livraisons map's Message button (task Part 4) — never an unrelated conversation.
    if (service === "SHOP" && roleA === "DRIVER" && (roleB === "SUPPLIER" || roleB === "CAFE_OWNER")) {
      return this.hasActiveDeliveryRelationship(userA, userB, roleB);
    }
    if (service === "SHOP" && roleB === "DRIVER" && (roleA === "SUPPLIER" || roleA === "CAFE_OWNER")) {
      return this.hasActiveDeliveryRelationship(userB, userA, roleA);
    }

    if (service === "MAINTENANCE" && ((roleA === "MAINTENANCE" && roleB === "CAFE_OWNER") || (roleB === "MAINTENANCE" && roleA === "CAFE_OWNER"))) {
      if (!settings.maintenanceMessagingEnabled) return false;
      const maintenanceUserId = roleA === "MAINTENANCE" ? userA : userB;
      const cafeOwnerId = roleA === "CAFE_OWNER" ? userA : userB;
      const reservations = await db.select({ status: maintenanceReservations.status })
        .from(maintenanceReservations)
        .where(and(
          eq(maintenanceReservations.maintenanceUserId, maintenanceUserId),
          eq(maintenanceReservations.cafeOwnerId, cafeOwnerId),
        ));
      const activeStatuses = new Set(["PENDING", "CONFIRMED", "RESCHEDULED", "RESCHEDULE_PENDING"]);
      return reservations.some(reservation => activeStatuses.has(reservation.status));
    }

    if (service === "BARISTA" && ((roleA === "BARISTA_MARKETPLACE" && roleB === "CAFE_OWNER") || (roleB === "BARISTA_MARKETPLACE" && roleA === "CAFE_OWNER"))) {
      if (!settings.baristaMessagingEnabled) return false;
      const baristaUserId = roleA === "BARISTA_MARKETPLACE" ? userA : userB;
      const cafeOwnerId = roleA === "CAFE_OWNER" ? userA : userB;
      const requests = await db.select({ status: baristaMarketplaceRequests.status })
        .from(baristaMarketplaceRequests)
        .where(and(
          eq(baristaMarketplaceRequests.baristaUserId, baristaUserId),
          eq(baristaMarketplaceRequests.cafeOwnerId, cafeOwnerId),
        ));
      const activeStatuses = new Set(["PENDING", "DISCUSSION", "ACCEPTED"]);
      return requests.some(request => activeStatuses.has(request.status));
    }

    // ACADEMY's "customer" side can be a Coffee Owner or a Barista Marketplace
    // professional (Espace Barista Marketplace → Academy) — both register
    // through the same academyRegistrations row (see the participantType note
    // on that table), so both are eligible to message the academy about it.
    //
    // See this file's header for the full investigation of this reverse
    // dependency (direct table read, no AcademyStorage call, kept as-is).
    const isAcademyCustomerRole = (role?: string) => role === "CAFE_OWNER" || role === "BARISTA_MARKETPLACE";
    if (service === "ACADEMY" && ((roleA === "BARISTA_ACADEMY" && isAcademyCustomerRole(roleB)) || (roleB === "BARISTA_ACADEMY" && isAcademyCustomerRole(roleA)))) {
      if (!settings.academyMessagingEnabled) return false;
      const academyUserId = roleA === "BARISTA_ACADEMY" ? userA : userB;
      const registrantId = roleA === "BARISTA_ACADEMY" ? userB : userA;
      const registrations = await db.select({ status: academyRegistrations.status })
        .from(academyRegistrations)
        .where(and(
          eq(academyRegistrations.academyUserId, academyUserId),
          eq(academyRegistrations.cafeOwnerId, registrantId),
        ));
      const activeStatuses = new Set(["PENDING", "CONFIRMED"]);
      return registrations.some(registration => activeStatuses.has(registration.status));
    }

    return false;
  }

  /** True for admins and active relationship conversations, including the 30-minute grace window. */
  async isConversationMessagingAllowed(conversationId: number, userId: number): Promise<boolean> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId));
    if (!conversation) return false;
    const participantRows = await db.select({
      userId: conversationParticipants.userId,
      hiddenAt: conversationParticipants.hiddenAt,
    })
      .from(conversationParticipants)
      .where(and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ));
    const membership = participantRows[0];
    if (!membership) return false;

    const me = await this.facade.getUser(userId);
    if (!me) return false;
    const isAdmin = me.role === "ADMIN" || me.role === "SUPER_ADMIN";
    // Admins retain access to manage and review Messages even when the
    // platform-wide visibility setting is hidden. This also keeps an admin
    // from locking themselves out after hiding a conversation for everyone.
    if (isAdmin) return true;
    if (membership.hiddenAt) return false;

    const settings = await this.facade.getMessagingSettings();
    if (!settings.globalVisible) return false;

    // Broadcast participants are governed by the broadcast setting rather
    // than an order/reservation relationship.
    if (conversation.type !== "DIRECT") {
      return settings.broadcastsEnabled;
    }

    const participantIds = await this.getConversationParticipantIds(conversationId);
    const otherId = participantIds.find(id => id !== userId);
    if (!otherId) return false;
    const other = await this.facade.getUser(otherId);
    if (!other) return false;
    if (other.role === "ADMIN" || other.role === "SUPER_ADMIN") return true;
    const meRole = me.role as string;
    const otherRole = other.role as string;
    if (await this.hasEligibleMessagingRelationship(userId, otherId, conversation.service)) return true;
    return !!conversation.relationshipClosedAt &&
      Date.now() - conversation.relationshipClosedAt.getTime() <= settings.gracePeriodMinutes * 60 * 1000;
  }

  /** Refresh the lifecycle timestamp used by the messaging grace period. */
  async syncMessagingRelationship(userA: number, userB: number, service: string): Promise<void> {
    const participantRows = await db.select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .innerJoin(conversations, eq(conversationParticipants.conversationId, conversations.id))
      .where(and(
        eq(conversations.type, "DIRECT"),
        eq(conversations.service, service),
        inArray(conversationParticipants.userId, [userA, userB]),
      ));
    const counts = new Map<number, number>();
    for (const row of participantRows) counts.set(row.conversationId, (counts.get(row.conversationId) ?? 0) + 1);
    const relationshipActive = await this.hasEligibleMessagingRelationship(userA, userB, service);
    for (const [conversationId, count] of Array.from(counts.entries())) {
      if (count !== 2) continue;
      if (relationshipActive) {
        await db.update(conversations)
          .set({ relationshipClosedAt: null })
          .where(eq(conversations.id, conversationId));
      } else {
        await db.update(conversations)
          .set({ relationshipClosedAt: new Date() })
          .where(and(eq(conversations.id, conversationId), isNull(conversations.relationshipClosedAt)));
      }
    }
  }

  async refreshOrderMessagingState(orderId: number): Promise<void> {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) return;
    const related = await db.select({ supplierId: subOrders.supplierId })
      .from(subOrders)
      .where(eq(subOrders.orderId, orderId));
    const supplierIds = new Set<number>(related.map(row => row.supplierId));
    if (order.supplierId) supplierIds.add(order.supplierId);
    for (const supplierId of Array.from(supplierIds)) {
      await this.syncMessagingRelationship(order.cafeId, supplierId, "SHOP");
    }
  }

  async deleteConversation(conversationId: number): Promise<number[]> {
    return db.transaction(async (tx) => {
      const participantRows = await tx.select({ userId: conversationParticipants.userId })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, conversationId));
      const [conversation] = await tx.select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.id, conversationId));
      if (!conversation) return [];

      await tx.delete(messages).where(eq(messages.conversationId, conversationId));
      await tx.delete(conversationParticipants).where(eq(conversationParticipants.conversationId, conversationId));
      await tx.delete(conversations).where(eq(conversations.id, conversationId));
      return participantRows.map(row => row.userId);
    });
  }

  /** Return all non-hidden conversations for a user, ordered by most recent activity. */
  async getConversationsForUser(userId: number, service?: string): Promise<ConversationSummary[]> {
    const participants = await db.select().from(conversationParticipants)
      .where(and(eq(conversationParticipants.userId, userId), isNull(conversationParticipants.hiddenAt)));
    if (participants.length === 0) return [];

    const convIds = participants.map(p => p.conversationId);
    const convRows = await db.select().from(conversations).where(and(
      inArray(conversations.id, convIds),
      ...(service ? [eq(conversations.service, service)] : []),
    ))
      .orderBy(desc(conversations.lastMessageAt));
    const visibleConvRows = [];
    for (const conv of convRows) {
      if (await this.isConversationMessagingAllowed(conv.id, userId)) visibleConvRows.push(conv);
    }
    if (visibleConvRows.length === 0) return [];

    // Fetch all participants for all conversations in one query
    const visibleIds = visibleConvRows.map(c => c.id);
    const allParticipants = await db.select({ cp: conversationParticipants, u: users })
      .from(conversationParticipants)
      .innerJoin(users, eq(conversationParticipants.userId, users.id))
      .where(inArray(conversationParticipants.conversationId, visibleIds));

    // Fetch last message per conversation
    const lastMsgs = await db.select().from(messages).where(inArray(messages.conversationId, visibleIds))
      .orderBy(desc(messages.createdAt));

    const userMap = new Map<number, { name: string; role: string }>();
    for (const row of allParticipants) userMap.set(row.u.id, { name: row.u.name, role: row.u.role });

    const myParticipantMap = new Map(participants.map(p => [p.conversationId, p]));

    return visibleConvRows.map(conv => {
      const myParticipant = myParticipantMap.get(conv.id)!;
      const others = allParticipants
        .filter(r => r.cp.conversationId === conv.id && r.cp.userId !== userId)
        .map(r => ({ id: r.u.id, name: r.u.name, role: r.u.role, profileImageUrl: r.u.profileImageUrl }));

      // Unread: messages after lastReadAt (or all if never read)
      const myLastRead = myParticipant.lastReadAt;
      const unreadCount = lastMsgs.filter(m => {
        if (m.conversationId !== conv.id) return false;
        if (m.senderId === userId) return false; // own messages never count as unread
        return !myLastRead || m.createdAt! > myLastRead;
      }).length;

      const lastMsg = lastMsgs.find(m => m.conversationId === conv.id);

      return {
        id: conv.id,
        type: conv.type,
        title: conv.title,
        service: conv.service,
        lastMessageAt: (conv.lastMessageAt ?? conv.createdAt)!.toISOString(),
        createdAt: conv.createdAt!.toISOString(),
        messageCount: lastMsgs.filter(m => m.conversationId === conv.id).length,
        lastMessage: lastMsg ? {
          content: lastMsg.content,
          senderId: lastMsg.senderId,
          senderName: userMap.get(lastMsg.senderId)?.name ?? 'Unknown',
          createdAt: lastMsg.createdAt!.toISOString(),
        } : null,
        unreadCount,
        otherParticipants: others,
      } satisfies ConversationSummary;
    });
  }

  /** Find an existing DIRECT conversation between two users, or create one. */
  async findOrCreateDirectConversation(userId1: number, userId2: number, service = 'SHOP'): Promise<{ conversation: typeof conversations.$inferSelect; isNew: boolean }> {
    if (userId1 === userId2 || !(await this.hasEligibleMessagingRelationship(userId1, userId2, service))) {
      throw new Error("These users are not eligible to message each other");
    }

    // Serialize the lookup/insert for this pair and service. Without the
    // transaction-scoped advisory lock, two tabs can both miss the lookup and
    // create duplicate direct conversations.
    const pairKey = `${service}:${Math.min(userId1, userId2)}:${Math.max(userId1, userId2)}`;
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${pairKey}))`);

      const p1 = await tx.select({ conversationId: conversationParticipants.conversationId })
        .from(conversationParticipants).where(eq(conversationParticipants.userId, userId1));
      const p2 = await tx.select({ conversationId: conversationParticipants.conversationId })
        .from(conversationParticipants).where(eq(conversationParticipants.userId, userId2));

      const ids1 = new Set(p1.map(r => r.conversationId));
      const sharedIds = p2.filter(r => ids1.has(r.conversationId)).map(r => r.conversationId);

      if (sharedIds.length > 0) {
        const directConvs = await tx.select().from(conversations)
          .where(and(
            inArray(conversations.id, sharedIds),
            eq(conversations.type, 'DIRECT'),
            eq(conversations.service, service),
          ));
        if (directConvs.length > 0) {
          return { conversation: directConvs[0], isNew: false };
        }
      }

      const [conv] = await tx.insert(conversations).values({
        type: 'DIRECT',
        service,
        createdByUserId: userId1,
      }).returning();

      await tx.insert(conversationParticipants).values([
        { conversationId: conv.id, userId: userId1 },
        { conversationId: conv.id, userId: userId2 },
      ]);

      return { conversation: conv, isNew: true };
    });
  }

  /** Check if userId is a non-hidden participant of conversationId. */
  async isParticipant(conversationId: number, userId: number): Promise<boolean> {
    const [row] = await db.select().from(conversationParticipants)
      .where(and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
        isNull(conversationParticipants.hiddenAt),
      ));
    return !!row && await this.isConversationMessagingAllowed(conversationId, userId);
  }

  async getConversationParticipantIds(conversationId: number): Promise<number[]> {
    const rows = await db.select({ userId: conversationParticipants.userId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.conversationId, conversationId));
    return rows.map(r => r.userId);
  }

  /** Get paginated messages for a conversation. Newest first for pagination, but return in asc order. */
  async getConversationMessages(conversationId: number, page: number, pageSize: number): Promise<{ msgs: ConversationMessageRow[]; total: number }> {
    const total = await db.select({ count: sql<number>`count(*)::int` }).from(messages)
      .where(eq(messages.conversationId, conversationId));

    const rows = await db.select({ m: messages, u: users })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // Return in chronological order
    const msgs: ConversationMessageRow[] = rows.reverse().map(r => ({
      id: r.m.id,
      conversationId: r.m.conversationId,
      senderId: r.m.senderId,
      senderName: r.u.name,
      senderRole: r.u.role,
      content: r.m.content,
      createdAt: r.m.createdAt!.toISOString(),
    }));
    return { msgs, total: total[0]?.count ?? 0 };
  }

  /** Persist a message and update conversation lastMessageAt. Returns the inserted message enriched with sender info. */
  async sendMessage(conversationId: number, senderId: number, content: string): Promise<ConversationMessageRow> {
    if (!(await this.isConversationMessagingAllowed(conversationId, senderId))) {
      throw new Error("Messaging is not available for this conversation");
    }
    const [sender] = await db.select().from(users).where(eq(users.id, senderId));
    const [msg] = await db.insert(messages).values({ conversationId, senderId, content }).returning();
    await db.update(conversations).set({ lastMessageAt: msg.createdAt }).where(eq(conversations.id, conversationId));
    return {
      id: msg.id,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      senderName: sender?.name ?? 'Unknown',
      senderRole: sender?.role ?? 'CAFE_OWNER',
      content: msg.content,
      createdAt: msg.createdAt!.toISOString(),
    };
  }

  async getConversationService(conversationId: number): Promise<string | undefined> {
    const [row] = await db.select({ service: conversations.service }).from(conversations).where(eq(conversations.id, conversationId));
    return row?.service;
  }

  /** Mark all messages in a conversation as read for a user. */
  async markConversationRead(conversationId: number, userId: number): Promise<void> {
    await db.update(conversationParticipants)
      .set({ lastReadAt: new Date() })
      .where(and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ));
  }

  /** Admin: create a broadcast conversation to multiple users. */
  async createBroadcastConversation(adminId: number, title: string, targetUserIds: number[]): Promise<typeof conversations.$inferSelect> {
    const [conv] = await db.insert(conversations).values({
      title,
      type: 'BROADCAST',
      service: 'SHOP',
      createdByUserId: adminId,
    }).returning();

    const allParticipants = Array.from(new Set([adminId, ...targetUserIds]));
    await db.insert(conversationParticipants).values(
      allParticipants.map(uid => ({ conversationId: conv.id, userId: uid }))
    );

    return conv;
  }

  /** Return users a given user is allowed to start a conversation with based on order relationships. */
  async getEligibleContacts(userId: number, service?: string): Promise<EligibleContact[]> {
    const [me] = await db.select().from(users).where(eq(users.id, userId));
    if (!me) return [];

    const isAdmin = me.role === 'ADMIN' || me.role === 'SUPER_ADMIN';
    const settings = await this.facade.getMessagingSettings();
    if (!isAdmin && !settings.globalVisible) return [];
    const serviceRoles: Record<string, string[]> = {
      SHOP: ['CAFE_OWNER', 'SUPPLIER', 'DELIVERY_COMPANY', 'DRIVER'],
      MAINTENANCE: ['CAFE_OWNER', 'MAINTENANCE'],
      PRINT: ['CAFE_OWNER', 'PRINTER'],
      MARKETING: ['CAFE_OWNER', 'MARKETING'],
      BARISTA: ['CAFE_OWNER', 'BARISTA_MARKETPLACE'],
      // Real Academy ecosystem (courses/registrations) — see the Barista Academy
      // storage section below. Deliberately its own messaging-service tag,
      // separate from BARISTA (Marketplace), matching the existing Barista/
      // Academy service split (shared/schema.ts's serviceKeyEnum note).
      // BARISTA_MARKETPLACE is included too: a Barista can register for
      // formations via Espace Barista Marketplace → Academy, using the same
      // registration model as a Coffee Owner (see the participantType note
      // on academyRegistrations).
      ACADEMY: ['CAFE_OWNER', 'BARISTA_MARKETPLACE', 'BARISTA_ACADEMY'],
    };
    const allowedServiceRoles = service ? serviceRoles[service] : undefined;

    if (isAdmin) {
      // Admin can message every real account in the selected service, but
      // service selection is still enforced at the data boundary.
      const adminAllowedRoles = service === "MAINTENANCE"
        ? ["MAINTENANCE"]
        : allowedServiceRoles;
      const all = await db.select().from(users).where(and(
        ne(users.id, userId),
        ...(adminAllowedRoles ? [inArray(users.role, adminAllowedRoles as any)] : []),
      ));
      return all.map(u => ({ id: u.id, name: u.name, role: u.role }));
    }

    const contactUserIds = new Set<number>();

    if (me.role === 'CAFE_OWNER') {
      // Can message suppliers from orders
      const cafeOrders = await db.select().from(orders).where(eq(orders.cafeId, userId));
      for (const o of cafeOrders) {
        if (o.supplierId) contactUserIds.add(o.supplierId);
      }
      // Also add delivery users from orders
      for (const o of cafeOrders) {
        if (o.deliveryId) contactUserIds.add(o.deliveryId);
      }
      // If no order relationships yet, show all approved suppliers
      if (contactUserIds.size === 0) {
        const allSuppliers = await db.select().from(users)
          .where(and(eq(users.role, 'SUPPLIER' as any), eq(users.status, 'approved')));
        for (const s of allSuppliers) contactUserIds.add(s.id);
      }
      // Maintenance professionals are contactable directly from the
      // Maintenance marketplace, before an order exists.
      const maintenance = await db.select({ userId: maintenanceProfiles.userId })
        .from(maintenanceProfiles)
        .innerJoin(users, eq(maintenanceProfiles.userId, users.id))
        .where(and(
          eq(users.role, "MAINTENANCE" as any),
          eq(users.status, "approved"),
          eq(maintenanceProfiles.marketplaceVisible, true),
        ));
      for (const provider of maintenance) contactUserIds.add(provider.userId);
      // Service-specific provider accounts are available before an order
      // exists, just like Maintenance providers.
      if (service && service !== "SHOP" && allowedServiceRoles) {
        const providers = await db.select({ id: users.id }).from(users).where(and(
          inArray(users.role, allowedServiceRoles as any),
          eq(users.status, "approved"),
          ne(users.role, "CAFE_OWNER" as any),
        ));
        for (const provider of providers) contactUserIds.add(provider.id);
      }
    } else if (me.role === 'SUPPLIER') {
      // Can message cafe owners from orders
      const supplierOrders = await db.select().from(orders).where(eq(orders.supplierId, userId));
      for (const o of supplierOrders) contactUserIds.add(o.cafeId);
      // Always show all approved cafe owners (so new suppliers can message without prior orders)
      const allCafes = await db.select().from(users)
        .where(and(eq(users.role, 'CAFE_OWNER' as any), eq(users.status, 'approved')));
      for (const c of allCafes) contactUserIds.add(c.id);
    } else if (me.role === 'DELIVERY_COMPANY' || me.role === 'DRIVER') {
      // Can message cafe owners from deliveries
      const delivOrders = await db.select().from(orders).where(eq(orders.deliveryId, userId));
      for (const o of delivOrders) contactUserIds.add(o.cafeId);
      // Also show all approved cafe owners
      const allCafes = await db.select().from(users)
        .where(and(eq(users.role, 'CAFE_OWNER' as any), eq(users.status, 'approved')));
      for (const c of allCafes) contactUserIds.add(c.id);
      // A Driver additionally needs the Supplier of whichever delivery is actively assigned
      // to them — the Livraisons map's Message button (task Part 4) targets exactly this
      // pair, scoped by the real assignment rather than "every supplier on the platform".
      if (me.role === 'DRIVER') {
        const ownDeliveries = await db.select({ supplierId: deliveries.supplierId, cafeId: deliveries.cafeId })
          .from(deliveries)
          .where(and(eq(deliveries.driverId, userId), inArray(deliveries.status, ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'])));
        for (const d of ownDeliveries) { contactUserIds.add(d.supplierId); contactUserIds.add(d.cafeId); }
      }
    } else if (me.role === 'MAINTENANCE') {
      const allCafes = await db.select().from(users)
        .where(and(eq(users.role, 'CAFE_OWNER' as any), eq(users.status, 'approved')));
      for (const c of allCafes) contactUserIds.add(c.id);
    } else if (me.role === 'BARISTA_MARKETPLACE') {
      const allCafes = await db.select().from(users)
        .where(and(eq(users.role, 'CAFE_OWNER' as any), eq(users.status, 'approved')));
      for (const c of allCafes) contactUserIds.add(c.id);
      // Academy accounts are contactable directly from Espace Barista Marketplace
      // → Academy, before an order/registration exists — mirrors the Coffee
      // Owner "Service-specific provider accounts" behavior above.
      if (service === "ACADEMY") {
        const academies = await db.select({ id: users.id }).from(users).where(and(
          eq(users.role, "BARISTA_ACADEMY" as any),
          eq(users.status, "approved"),
        ));
        for (const academy of academies) contactUserIds.add(academy.id);
      }
    }

    // Admin support is available from every messaging service. The service
    // restriction applies to provider/customer pairs, not support access.
    const admins = await db.select().from(users)
      .where(or(eq(users.role, 'ADMIN' as any), eq(users.role, 'SUPER_ADMIN' as any)));
    for (const a of admins) contactUserIds.add(a.id);

    // Supplier/café and Maintenance/café contacts are relationship-scoped.
    // Keep legacy delivery and other service contact behavior unchanged.
    contactUserIds.delete(userId);

    if (contactUserIds.size === 0) return [];
    const candidateUsers = await db.select({ id: users.id, role: users.role })
      .from(users)
      .where(inArray(users.id, Array.from(contactUserIds)));
    const relationshipService = service ?? (me.role === "MAINTENANCE" ? "MAINTENANCE" : "SHOP");
    const eligibleIds = new Set<number>();
    for (const candidate of candidateUsers) {
      const restrictedPair =
        (me.role === "SUPPLIER" && candidate.role === "CAFE_OWNER") ||
        (me.role === "CAFE_OWNER" && candidate.role === "SUPPLIER") ||
        (me.role === "MAINTENANCE" && candidate.role === "CAFE_OWNER") ||
        (me.role === "CAFE_OWNER" && candidate.role === "MAINTENANCE") ||
        // Driver ↔ Supplier / Driver ↔ Coffee Owner must be scoped to an actual active
        // delivery (task Part 4/15/25 — "do not allow unrelated conversations"), unlike the
        // always-eligible "all approved cafes" fallback the DRIVER branch above also adds.
        (me.role === "DRIVER" && (candidate.role === "SUPPLIER" || candidate.role === "CAFE_OWNER"));
      if (!restrictedPair || await this.hasEligibleMessagingRelationship(userId, candidate.id, relationshipService)) {
        eligibleIds.add(candidate.id);
      }
    }
    if (eligibleIds.size === 0) return [];
    const roleCondition = allowedServiceRoles
      ? (!isAdmin && service === "SHOP"
        ? or(
          inArray(users.role, allowedServiceRoles as any),
          eq(users.role, "ADMIN" as any),
          eq(users.role, "SUPER_ADMIN" as any),
        )
        : inArray(users.role, allowedServiceRoles as any))
      : undefined;
    const contacts = await db.select().from(users).where(and(
      inArray(users.id, Array.from(eligibleIds)),
      ...(roleCondition ? [roleCondition] : []),
    ));
    return contacts.map(u => ({ id: u.id, name: u.name, role: u.role, profileImageUrl: u.profileImageUrl }));
  }

  /** Admin: hide or show a conversation for a specific user (or for all current participants if targetUserId is null). */
  async setConversationVisibility(conversationId: number, targetUserId: number | null, hidden: boolean, adminId: number): Promise<void> {
    const condition = targetUserId
      ? and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, targetUserId))
      : eq(conversationParticipants.conversationId, conversationId);

    await db.update(conversationParticipants)
      .set({ hiddenAt: hidden ? new Date() : null, hiddenByUserId: hidden ? adminId : null })
      .where(condition!);
  }

  /** Admin: list all conversations with a summary of participants. */
  async adminGetAllConversations(service?: string): Promise<ConversationSummary[]> {
    const convRows = await db.select().from(conversations)
      .where(service ? eq(conversations.service, service) : undefined)
      .orderBy(desc(conversations.lastMessageAt));
    if (convRows.length === 0) return [];

    const allParticipants = await db.select({ cp: conversationParticipants, u: users })
      .from(conversationParticipants)
      .innerJoin(users, eq(conversationParticipants.userId, users.id))
      .where(inArray(conversationParticipants.conversationId, convRows.map(c => c.id)));

    const lastMsgs = await db.select().from(messages)
      .where(inArray(messages.conversationId, convRows.map(c => c.id)))
      .orderBy(desc(messages.createdAt));

    const userMap = new Map<number, { name: string; role: string }>();
    for (const row of allParticipants) userMap.set(row.u.id, { name: row.u.name, role: row.u.role });

    return convRows.map(conv => {
      const participants = allParticipants.filter(r => r.cp.conversationId === conv.id)
        .map(r => ({
          id: r.u.id,
          name: r.u.name,
          role: r.u.role,
          profileImageUrl: r.u.profileImageUrl,
          hiddenAt: r.cp.hiddenAt ? r.cp.hiddenAt.toISOString() : null,
        }));
      const lastMsg = lastMsgs.find(m => m.conversationId === conv.id);
      return {
        id: conv.id,
        type: conv.type,
        title: conv.title,
        service: conv.service,
        lastMessageAt: (conv.lastMessageAt ?? conv.createdAt)!.toISOString(),
        createdAt: conv.createdAt!.toISOString(),
        messageCount: lastMsgs.filter(m => m.conversationId === conv.id).length,
        lastMessage: lastMsg ? {
          content: lastMsg.content,
          senderId: lastMsg.senderId,
          senderName: userMap.get(lastMsg.senderId)?.name ?? 'Unknown',
          createdAt: lastMsg.createdAt!.toISOString(),
        } : null,
        unreadCount: 0,
        otherParticipants: participants,
      } satisfies ConversationSummary;
    });
  }

  async getAdminConversationExport(filters: {
    service?: string;
    ids?: number[];
    from?: Date;
    to?: Date;
  }): Promise<Array<{
    conversation: typeof conversations.$inferSelect;
    participants: Array<{ id: number; name: string; role: string }>;
    message: ConversationMessageRow | null;
  }>> {
    const conditions = [];
    if (filters.service) conditions.push(eq(conversations.service, filters.service));
    if (filters.ids?.length) conditions.push(inArray(conversations.id, filters.ids));
    if (filters.from) conditions.push(gte(conversations.lastMessageAt, filters.from));
    if (filters.to) conditions.push(lte(conversations.lastMessageAt, filters.to));
    const convRows = await db.select().from(conversations)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(conversations.lastMessageAt));
    if (convRows.length === 0) return [];

    const ids = convRows.map(c => c.id);
    const participantRows = await db.select({ cp: conversationParticipants, u: users })
      .from(conversationParticipants)
      .innerJoin(users, eq(conversationParticipants.userId, users.id))
      .where(inArray(conversationParticipants.conversationId, ids));
    const messageRows = await db.select({ m: messages, u: users })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(inArray(messages.conversationId, ids))
      .orderBy(messages.createdAt);

    return convRows.reduce<Array<{
      conversation: typeof conversations.$inferSelect;
      participants: Array<{ id: number; name: string; role: string }>;
      message: ConversationMessageRow | null;
    }>>((result, conversation) => {
      const participants = participantRows
        .filter(row => row.cp.conversationId === conversation.id)
        .map(row => ({ id: row.u.id, name: row.u.name, role: row.u.role }));
      const rows = messageRows.filter(row => row.m.conversationId === conversation.id);
      if (rows.length === 0) {
        result.push({ conversation, participants, message: null });
      } else {
        result.push(...rows.map(row => ({
          conversation,
          participants,
          message: {
            id: row.m.id,
            conversationId: row.m.conversationId,
            senderId: row.m.senderId,
            senderName: row.u.name,
            senderRole: row.u.role,
            content: row.m.content,
            createdAt: row.m.createdAt!.toISOString(),
          },
        })));
      }
      return result;
    }, []);
  }

  async getUnreadMessageCount(userId: number): Promise<number> {
    const participants = await db.select().from(conversationParticipants)
      .where(and(eq(conversationParticipants.userId, userId), isNull(conversationParticipants.hiddenAt)));
    if (participants.length === 0) return 0;

    const allowedConversationIds: number[] = [];
    for (const participant of participants) {
      if (await this.isConversationMessagingAllowed(participant.conversationId, userId)) {
        allowedConversationIds.push(participant.conversationId);
      }
    }
    if (allowedConversationIds.length === 0) return 0;

    const convIds = allowedConversationIds;
    const allMessages = await db.select().from(messages).where(inArray(messages.conversationId, convIds));

    return allMessages.filter(m => {
      if (m.senderId === userId) return false;
      const myParticipant = participants.find(p => p.conversationId === m.conversationId);
      if (!myParticipant) return false;
      const lastRead = myParticipant.lastReadAt;
      return !lastRead || m.createdAt! > lastRead;
    }).length;
  }

  /** All Admin/Super Admin user ids — used to fan platform-level notifications out to every admin. */
  async getAdminUserIds(): Promise<number[]> {
    const rows = await db.select({ id: users.id }).from(users).where(inArray(users.role, ["ADMIN", "SUPER_ADMIN"] as any));
    return rows.map((r) => r.id);
  }
}
