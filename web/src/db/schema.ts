import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
  inet,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const id = (name = "id") => uuid(name).defaultRandom().primaryKey();
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();
const vnd = (name: string) => bigint(name, { mode: "number" });

export const membershipRoleEnum = pgEnum("membership_role", [
  "owner",
  "operations",
  "finance",
  "viewer",
]);
export const membershipStatusEnum = pgEnum("membership_status", ["active", "suspended"]);
export const recordStatusEnum = pgEnum("record_status", ["active", "inactive"]);
export const sourceAccountStatusEnum = pgEnum("source_account_status", [
  "active",
  "inactive",
  "review_required",
]);
export const eventStatusEnum = pgEnum("event_status", ["draft", "active", "archived"]);
export const transferStatusEnum = pgEnum("transfer_status", [
  "unverified",
  "verified",
  "not_transferable",
]);
export const purchaseStatusEnum = pgEnum("purchase_status", [
  "pending",
  "confirmed",
  "cancelled",
  "refunded",
]);
export const ticketStatusEnum = pgEnum("ticket_status", [
  "preparing",
  "available",
  "held",
  "sold",
  "blocked",
  "void",
]);
export const holdStatusEnum = pgEnum("hold_status", [
  "active",
  "converted",
  "released",
  "expired",
]);
export const orderStatusEnum = pgEnum("order_status", [
  "draft",
  "awaiting_payment",
  "paid",
  "payment_review",
  "cancelled",
  "expired",
  "fulfilled",
  "refunded",
]);
export const paymentLinkStatusEnum = pgEnum("payment_link_status", [
  "creating",
  "active",
  "paid",
  "cancelled",
  "expired",
  "failed",
  "unknown",
]);
export const paymentEventSourceEnum = pgEnum("payment_event_source", [
  "webhook",
  "reconciliation",
  "manual",
]);
export const paymentEventStatusEnum = pgEnum("payment_event_status", [
  "received",
  "verified",
  "rejected",
  "processed",
  "review",
]);
export const deliveryStatusEnum = pgEnum("delivery_status", [
  "pending",
  "in_progress",
  "confirmed",
  "failed",
  "cancelled",
]);
export const caseTypeEnum = pgEnum("case_type", [
  "payment_mismatch",
  "late_payment",
  "delivery",
  "refund",
  "chargeback",
  "inventory",
  "other",
]);
export const caseStatusEnum = pgEnum("case_status", [
  "open",
  "in_progress",
  "resolved",
  "closed",
]);

export const workspaces = pgTable(
  "workspaces",
  {
    id: id(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    status: recordStatusEnum("status").default("active").notNull(),
    timezone: varchar("timezone", { length: 80 }).default("Asia/Ho_Chi_Minh").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("workspaces_slug_uidx").on(table.slug),
    check("workspaces_slug_ck", sql`${table.slug} ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'`),
  ],
);

export const users = pgTable(
  "users",
  {
    id: id(),
    email: varchar("email", { length: 320 }).notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).defaultNow().notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("users_email_lower_uidx").on(sql`lower(${table.email})`),
    check("users_email_normalized_ck", sql`${table.email} = lower(btrim(${table.email}))`),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull(),
    status: membershipStatusEnum("status").default("active").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("memberships_workspace_user_uidx").on(table.workspaceId, table.userId),
    unique("memberships_workspace_id_uq").on(table.workspaceId, table.id),
    index("memberships_user_idx").on(table.userId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    role: membershipRoleEnum("role").notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    invitedByMembershipId: uuid("invited_by_membership_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("invitations_token_hash_uidx").on(table.tokenHash),
    index("invitations_workspace_email_idx").on(table.workspaceId, table.email),
    index("invitations_expiry_idx").on(table.expiresAt),
    foreignKey({
      name: "invitations_inviter_scope_fk",
      columns: [table.workspaceId, table.invitedByMembershipId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }).onDelete("restrict"),
    check("invitations_email_normalized_ck", sql`${table.email} = lower(btrim(${table.email}))`),
    check("invitations_non_owner_role_ck", sql`${table.role} <> 'owner'::membership_role`),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id").notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdIp: inet("created_ip"),
    userAgent: varchar("user_agent", { length: 512 }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_hash_uidx").on(table.tokenHash),
    index("auth_sessions_user_idx").on(table.userId),
    index("auth_sessions_expiry_idx").on(table.expiresAt),
    foreignKey({
      name: "auth_sessions_membership_scope_fk",
      columns: [table.workspaceId, table.membershipId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }).onDelete("cascade"),
  ],
);

export const authLoginAttempts = pgTable(
  "auth_login_attempts",
  {
    keyHash: varchar("key_hash", { length: 64 }).primaryKey(),
    failureCount: integer("failure_count").default(0).notNull(),
    firstFailureAt: timestamp("first_failure_at", { withTimezone: true }).defaultNow().notNull(),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (table) => [check("auth_login_attempts_count_ck", sql`${table.failureCount} >= 0`)],
);

export const platforms = pgTable(
  "platforms",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    websiteUrl: text("website_url"),
    status: recordStatusEnum("status").default("active").notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("platforms_workspace_name_uidx").on(table.workspaceId, sql`lower(${table.name})`),
    unique("platforms_workspace_id_uq").on(table.workspaceId, table.id),
  ],
);

export const sourceAccounts = pgTable(
  "source_accounts",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull(),
    platformId: uuid("platform_id").notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    accountReference: varchar("account_reference", { length: 320 }),
    status: sourceAccountStatusEnum("status").default("active").notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("source_accounts_workspace_platform_label_uidx").on(
      table.workspaceId,
      table.platformId,
      sql`lower(${table.label})`,
    ),
    unique("source_accounts_workspace_id_uq").on(table.workspaceId, table.id),
    foreignKey({
      name: "source_accounts_platform_scope_fk",
      columns: [table.workspaceId, table.platformId],
      foreignColumns: [platforms.workspaceId, platforms.id],
    }).onDelete("restrict"),
  ],
);

export const events = pgTable(
  "events",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 240 }).notNull(),
    venueName: varchar("venue_name", { length: 240 }),
    city: varchar("city", { length: 160 }),
    status: eventStatusEnum("status").default("draft").notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("events_workspace_id_uq").on(table.workspaceId, table.id),
    index("events_workspace_status_idx").on(table.workspaceId, table.status),
  ],
);

export const eventSessions = pgTable(
  "event_sessions",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull(),
    eventId: uuid("event_id").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    doorsAt: timestamp("doors_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("event_sessions_workspace_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("event_sessions_event_name_time_uidx").on(table.eventId, table.name, table.startsAt),
    index("event_sessions_workspace_time_idx").on(table.workspaceId, table.startsAt),
    foreignKey({
      name: "event_sessions_event_scope_fk",
      columns: [table.workspaceId, table.eventId],
      foreignColumns: [events.workspaceId, events.id],
    }).onDelete("cascade"),
    check("event_sessions_time_ck", sql`${table.endsAt} is null or ${table.endsAt} > ${table.startsAt}`),
  ],
);

export const ticketTiers = pgTable(
  "ticket_tiers",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull(),
    eventSessionId: uuid("event_session_id").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    section: varchar("section", { length: 160 }),
    isGeneralAdmission: boolean("is_general_admission").default(false).notNull(),
    faceValueVnd: vnd("face_value_vnd"),
    suggestedPriceVnd: vnd("suggested_price_vnd"),
    transferStatus: transferStatusEnum("transfer_status").default("unverified").notNull(),
    transferMethod: varchar("transfer_method", { length: 120 }),
    transferNotes: text("transfer_notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("ticket_tiers_workspace_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("ticket_tiers_session_name_uidx").on(table.eventSessionId, sql`lower(${table.name})`),
    foreignKey({
      name: "ticket_tiers_session_scope_fk",
      columns: [table.workspaceId, table.eventSessionId],
      foreignColumns: [eventSessions.workspaceId, eventSessions.id],
    }).onDelete("cascade"),
    check("ticket_tiers_face_value_ck", sql`${table.faceValueVnd} is null or ${table.faceValueVnd} >= 0`),
    check(
      "ticket_tiers_suggested_price_ck",
      sql`${table.suggestedPriceVnd} is null or ${table.suggestedPriceVnd} >= 0`,
    ),
    check(
      "ticket_tiers_verified_transfer_ck",
      sql`${table.transferStatus} <> 'verified'::transfer_status or (coalesce(nullif(btrim(${table.transferMethod}), ''), '') <> '' and coalesce(nullif(btrim(${table.transferNotes}), ''), '') <> '')`,
    ),
  ],
);

export const purchases = pgTable(
  "purchases",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull(),
    sourceAccountId: uuid("source_account_id").notNull(),
    eventSessionId: uuid("event_session_id").notNull(),
    externalReference: varchar("external_reference", { length: 240 }),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull(),
    totalCostVnd: vnd("total_cost_vnd").notNull(),
    status: purchaseStatusEnum("status").default("pending").notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("purchases_workspace_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("purchases_source_external_uidx")
      .on(table.sourceAccountId, table.externalReference)
      .where(sql`${table.externalReference} is not null`),
    index("purchases_workspace_time_idx").on(table.workspaceId, table.purchasedAt),
    foreignKey({
      name: "purchases_source_account_scope_fk",
      columns: [table.workspaceId, table.sourceAccountId],
      foreignColumns: [sourceAccounts.workspaceId, sourceAccounts.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "purchases_event_session_scope_fk",
      columns: [table.workspaceId, table.eventSessionId],
      foreignColumns: [eventSessions.workspaceId, eventSessions.id],
    }).onDelete("restrict"),
    check("purchases_total_cost_ck", sql`${table.totalCostVnd} >= 0`),
  ],
);

export const tickets = pgTable(
  "tickets",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull(),
    purchaseId: uuid("purchase_id").notNull(),
    sourceAccountId: uuid("source_account_id").notNull(),
    eventSessionId: uuid("event_session_id").notNull(),
    ticketTierId: uuid("ticket_tier_id").notNull(),
    externalReference: varchar("external_reference", { length: 240 }),
    section: varchar("section", { length: 160 }),
    row: varchar("row", { length: 80 }),
    seat: varchar("seat", { length: 80 }),
    costVnd: vnd("cost_vnd").notNull(),
    askingPriceVnd: vnd("asking_price_vnd").notNull(),
    status: ticketStatusEnum("status").default("preparing").notNull(),
    blockedReason: text("blocked_reason"),
    artifactReference: varchar("artifact_reference", { length: 500 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("tickets_workspace_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("tickets_source_external_uidx")
      .on(table.sourceAccountId, table.externalReference)
      .where(sql`${table.externalReference} is not null`),
    uniqueIndex("tickets_session_seat_uidx")
      .on(table.eventSessionId, table.section, table.row, table.seat)
      .where(sql`${table.seat} is not null`),
    index("tickets_workspace_status_idx").on(table.workspaceId, table.status),
    index("tickets_tier_idx").on(table.ticketTierId),
    foreignKey({
      name: "tickets_purchase_scope_fk",
      columns: [table.workspaceId, table.purchaseId],
      foreignColumns: [purchases.workspaceId, purchases.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "tickets_source_account_scope_fk",
      columns: [table.workspaceId, table.sourceAccountId],
      foreignColumns: [sourceAccounts.workspaceId, sourceAccounts.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "tickets_event_session_scope_fk",
      columns: [table.workspaceId, table.eventSessionId],
      foreignColumns: [eventSessions.workspaceId, eventSessions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "tickets_tier_scope_fk",
      columns: [table.workspaceId, table.ticketTierId],
      foreignColumns: [ticketTiers.workspaceId, ticketTiers.id],
    }).onDelete("restrict"),
    check("tickets_cost_ck", sql`${table.costVnd} >= 0`),
    check("tickets_asking_price_ck", sql`${table.askingPriceVnd} >= 0`),
    check(
      "tickets_block_reason_ck",
      sql`${table.status} <> 'blocked'::ticket_status or coalesce(nullif(btrim(${table.blockedReason}), ''), '') <> ''`,
    ),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    orderCode: bigserial("order_code", { mode: "number" }).notNull(),
    status: orderStatusEnum("status").default("draft").notNull(),
    customerName: varchar("customer_name", { length: 160 }).notNull(),
    customerEmail: varchar("customer_email", { length: 320 }),
    customerPhone: varchar("customer_phone", { length: 40 }),
    subtotalVnd: vnd("subtotal_vnd").notNull(),
    totalVnd: vnd("total_vnd").notNull(),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdByMembershipId: uuid("created_by_membership_id").notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("orders_order_code_uidx").on(table.orderCode),
    unique("orders_workspace_id_uq").on(table.workspaceId, table.id),
    index("orders_workspace_status_idx").on(table.workspaceId, table.status),
    index("orders_workspace_created_idx").on(table.workspaceId, table.createdAt),
    foreignKey({
      name: "orders_creator_membership_scope_fk",
      columns: [table.workspaceId, table.createdByMembershipId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }).onDelete("restrict"),
    check("orders_subtotal_ck", sql`${table.subtotalVnd} >= 0`),
    check("orders_total_ck", sql`${table.totalVnd} >= 0`),
  ],
);

export const ticketHolds = pgTable(
  "ticket_holds",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull(),
    ticketId: uuid("ticket_id").notNull(),
    orderId: uuid("order_id").notNull(),
    status: holdStatusEnum("status").default("active").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("ticket_holds_one_active_per_ticket_uidx")
      .on(table.ticketId)
      .where(sql`${table.status} = 'active'::hold_status`),
    uniqueIndex("ticket_holds_order_ticket_uidx").on(table.orderId, table.ticketId),
    index("ticket_holds_active_expiry_idx")
      .on(table.expiresAt)
      .where(sql`${table.status} = 'active'::hold_status`),
    foreignKey({
      name: "ticket_holds_ticket_scope_fk",
      columns: [table.workspaceId, table.ticketId],
      foreignColumns: [tickets.workspaceId, tickets.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "ticket_holds_order_scope_fk",
      columns: [table.workspaceId, table.orderId],
      foreignColumns: [orders.workspaceId, orders.id],
    }).onDelete("cascade"),
  ],
);

export const orderLines = pgTable(
  "order_lines",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull(),
    orderId: uuid("order_id").notNull(),
    ticketId: uuid("ticket_id").notNull(),
    description: varchar("description", { length: 500 }).notNull(),
    unitPriceVnd: vnd("unit_price_vnd").notNull(),
    quantity: integer("quantity").default(1).notNull(),
    lineTotalVnd: vnd("line_total_vnd").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("order_lines_order_ticket_uidx").on(table.orderId, table.ticketId),
    index("order_lines_ticket_idx").on(table.ticketId),
    foreignKey({
      name: "order_lines_order_scope_fk",
      columns: [table.workspaceId, table.orderId],
      foreignColumns: [orders.workspaceId, orders.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "order_lines_ticket_scope_fk",
      columns: [table.workspaceId, table.ticketId],
      foreignColumns: [tickets.workspaceId, tickets.id],
    }).onDelete("restrict"),
    check("order_lines_quantity_ck", sql`${table.quantity} = 1`),
    check("order_lines_unit_price_ck", sql`${table.unitPriceVnd} >= 0`),
    check("order_lines_total_ck", sql`${table.lineTotalVnd} = ${table.unitPriceVnd} * ${table.quantity}`),
  ],
);

export const paymentLinks = pgTable(
  "payment_links",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull(),
    orderId: uuid("order_id").notNull(),
    provider: varchar("provider", { length: 40 }).default("payos").notNull(),
    providerPaymentLinkId: varchar("provider_payment_link_id", { length: 240 }),
    checkoutUrl: text("checkout_url"),
    amountVnd: vnd("amount_vnd").notNull(),
    status: paymentLinkStatusEnum("status").default("creating").notNull(),
    failureCode: varchar("failure_code", { length: 120 }),
    failureMessage: text("failure_message"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("payment_links_workspace_id_uq").on(table.workspaceId, table.id),
    uniqueIndex("payment_links_provider_id_uidx")
      .on(table.provider, table.providerPaymentLinkId)
      .where(sql`${table.providerPaymentLinkId} is not null`),
    uniqueIndex("payment_links_one_live_per_order_uidx")
      .on(table.orderId)
      .where(sql`${table.status} in ('creating'::payment_link_status, 'active'::payment_link_status, 'unknown'::payment_link_status)`),
    index("payment_links_order_idx").on(table.orderId),
    foreignKey({
      name: "payment_links_order_scope_fk",
      columns: [table.workspaceId, table.orderId],
      foreignColumns: [orders.workspaceId, orders.id],
    }).onDelete("cascade"),
    check("payment_links_amount_ck", sql`${table.amountVnd} >= 0`),
  ],
);

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull(),
    orderId: uuid("order_id"),
    paymentLinkId: uuid("payment_link_id"),
    provider: varchar("provider", { length: 40 }).default("payos").notNull(),
    providerEventId: varchar("provider_event_id", { length: 240 }),
    providerTransactionId: varchar("provider_transaction_id", { length: 240 }),
    source: paymentEventSourceEnum("source").notNull(),
    status: paymentEventStatusEnum("status").default("received").notNull(),
    orderCode: bigint("order_code", { mode: "number" }),
    amountVnd: vnd("amount_vnd"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    rejectionReason: text("rejection_reason"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("payment_events_provider_event_uidx")
      .on(table.provider, table.providerEventId)
      .where(sql`${table.providerEventId} is not null`),
    uniqueIndex("payment_events_provider_transaction_uidx")
      .on(table.provider, table.providerTransactionId)
      .where(sql`${table.providerTransactionId} is not null`),
    index("payment_events_order_idx").on(table.orderId),
    index("payment_events_status_idx").on(table.workspaceId, table.status),
    foreignKey({
      name: "payment_events_order_scope_fk",
      columns: [table.workspaceId, table.orderId],
      foreignColumns: [orders.workspaceId, orders.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "payment_events_link_scope_fk",
      columns: [table.workspaceId, table.paymentLinkId],
      foreignColumns: [paymentLinks.workspaceId, paymentLinks.id],
    }).onDelete("restrict"),
    check("payment_events_amount_ck", sql`${table.amountVnd} is null or ${table.amountVnd} >= 0`),
  ],
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull(),
    orderId: uuid("order_id").notNull(),
    ticketId: uuid("ticket_id").notNull(),
    status: deliveryStatusEnum("status").default("pending").notNull(),
    recipientName: varchar("recipient_name", { length: 160 }),
    recipientContact: varchar("recipient_contact", { length: 320 }),
    method: varchar("method", { length: 120 }).default("official_transfer").notNull(),
    evidenceReference: varchar("evidence_reference", { length: 500 }),
    assignedMembershipId: uuid("assigned_membership_id"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("deliveries_order_ticket_uidx").on(table.orderId, table.ticketId),
    index("deliveries_workspace_status_idx").on(table.workspaceId, table.status),
    foreignKey({
      name: "deliveries_order_scope_fk",
      columns: [table.workspaceId, table.orderId],
      foreignColumns: [orders.workspaceId, orders.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "deliveries_ticket_scope_fk",
      columns: [table.workspaceId, table.ticketId],
      foreignColumns: [tickets.workspaceId, tickets.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "deliveries_assignee_scope_fk",
      columns: [table.workspaceId, table.assignedMembershipId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }).onDelete("restrict"),
  ],
);

export const cases = pgTable(
  "cases",
  {
    id: id(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    orderId: uuid("order_id"),
    paymentEventId: uuid("payment_event_id").references(() => paymentEvents.id, { onDelete: "set null" }),
    type: caseTypeEnum("type").notNull(),
    status: caseStatusEnum("status").default("open").notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    description: text("description").notNull(),
    assignedMembershipId: uuid("assigned_membership_id"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolution: text("resolution"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("cases_workspace_status_idx").on(table.workspaceId, table.status),
    foreignKey({
      name: "cases_order_scope_fk",
      columns: [table.workspaceId, table.orderId],
      foreignColumns: [orders.workspaceId, orders.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "cases_assignee_scope_fk",
      columns: [table.workspaceId, table.assignedMembershipId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }).onDelete("restrict"),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().notNull(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "restrict" }),
    actorMembershipId: uuid("actor_membership_id"),
    action: varchar("action", { length: 160 }).notNull(),
    entityType: varchar("entity_type", { length: 120 }).notNull(),
    entityId: uuid("entity_id"),
    requestId: varchar("request_id", { length: 120 }),
    ipAddress: inet("ip_address"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.createdAt], name: "audit_logs_pk" }),
    index("audit_logs_workspace_time_idx").on(table.workspaceId, table.createdAt),
    index("audit_logs_entity_idx").on(table.workspaceId, table.entityType, table.entityId),
    foreignKey({
      name: "audit_logs_actor_scope_fk",
      columns: [table.workspaceId, table.actorMembershipId],
      foreignColumns: [memberships.workspaceId, memberships.id],
    }).onDelete("restrict"),
  ],
);

export type MembershipRole = (typeof membershipRoleEnum.enumValues)[number];
export type MembershipStatus = (typeof membershipStatusEnum.enumValues)[number];
export type NewAuditLog = typeof auditLogs.$inferInsert;
