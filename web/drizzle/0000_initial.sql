CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
CREATE TYPE "membership_role" AS ENUM ('owner', 'operations', 'finance', 'viewer');
CREATE TYPE "membership_status" AS ENUM ('active', 'suspended');
CREATE TYPE "record_status" AS ENUM ('active', 'inactive');
CREATE TYPE "source_account_status" AS ENUM ('active', 'inactive', 'review_required');
CREATE TYPE "event_status" AS ENUM ('draft', 'active', 'archived');
CREATE TYPE "transfer_status" AS ENUM ('unverified', 'verified', 'not_transferable');
CREATE TYPE "purchase_status" AS ENUM ('pending', 'confirmed', 'cancelled', 'refunded');
CREATE TYPE "ticket_status" AS ENUM ('preparing', 'available', 'held', 'sold', 'blocked', 'void');
CREATE TYPE "hold_status" AS ENUM ('active', 'converted', 'released', 'expired');
CREATE TYPE "order_status" AS ENUM ('draft', 'awaiting_payment', 'paid', 'payment_review', 'cancelled', 'expired', 'fulfilled', 'refunded');
CREATE TYPE "payment_link_status" AS ENUM ('creating', 'active', 'paid', 'cancelled', 'expired', 'failed', 'unknown');
CREATE TYPE "payment_event_source" AS ENUM ('webhook', 'reconciliation', 'manual');
CREATE TYPE "payment_event_status" AS ENUM ('received', 'verified', 'rejected', 'processed', 'review');
CREATE TYPE "delivery_status" AS ENUM ('pending', 'in_progress', 'confirmed', 'failed', 'cancelled');
CREATE TYPE "case_type" AS ENUM ('payment_mismatch', 'late_payment', 'delivery', 'refund', 'chargeback', 'inventory', 'other');
CREATE TYPE "case_status" AS ENUM ('open', 'in_progress', 'resolved', 'closed');
--> statement-breakpoint
CREATE TABLE "workspaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" varchar(80) NOT NULL,
  "name" varchar(160) NOT NULL,
  "status" "record_status" DEFAULT 'active' NOT NULL,
  "timezone" varchar(80) DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "workspaces_slug_ck" CHECK ("slug" ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$')
);
CREATE UNIQUE INDEX "workspaces_slug_uidx" ON "workspaces" ("slug");
--> statement-breakpoint
CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(320) NOT NULL,
  "display_name" varchar(160) NOT NULL,
  "password_hash" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "password_changed_at" timestamptz DEFAULT now() NOT NULL,
  "last_login_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "users_email_normalized_ck" CHECK ("email" = lower(btrim("email")))
);
CREATE UNIQUE INDEX "users_email_lower_uidx" ON "users" (lower("email"));
--> statement-breakpoint
CREATE TABLE "memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" "membership_role" NOT NULL,
  "status" "membership_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "memberships_workspace_user_uidx" UNIQUE("workspace_id", "user_id"),
  CONSTRAINT "memberships_workspace_id_uq" UNIQUE("workspace_id", "id")
);
CREATE INDEX "memberships_user_idx" ON "memberships" ("user_id");
--> statement-breakpoint
CREATE TABLE "invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "email" varchar(320) NOT NULL,
  "role" "membership_role" NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "invited_by_membership_id" uuid NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "invitations_inviter_scope_fk" FOREIGN KEY ("workspace_id", "invited_by_membership_id") REFERENCES "memberships"("workspace_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "invitations_email_normalized_ck" CHECK ("email" = lower(btrim("email"))),
  CONSTRAINT "invitations_non_owner_role_ck" CHECK ("role" <> 'owner'::membership_role)
);
CREATE UNIQUE INDEX "invitations_token_hash_uidx" ON "invitations" ("token_hash");
CREATE INDEX "invitations_workspace_email_idx" ON "invitations" ("workspace_id", "email");
CREATE INDEX "invitations_expiry_idx" ON "invitations" ("expires_at");
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "membership_id" uuid NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "last_seen_at" timestamptz DEFAULT now() NOT NULL,
  "revoked_at" timestamptz,
  "created_ip" inet,
  "user_agent" varchar(512),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "auth_sessions_membership_scope_fk" FOREIGN KEY ("workspace_id", "membership_id") REFERENCES "memberships"("workspace_id", "id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "auth_sessions_token_hash_uidx" ON "auth_sessions" ("token_hash");
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" ("user_id");
CREATE INDEX "auth_sessions_expiry_idx" ON "auth_sessions" ("expires_at");
--> statement-breakpoint
CREATE TABLE "auth_login_attempts" (
  "key_hash" varchar(64) PRIMARY KEY NOT NULL,
  "failure_count" integer DEFAULT 0 NOT NULL,
  "first_failure_at" timestamptz DEFAULT now() NOT NULL,
  "blocked_until" timestamptz,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "auth_login_attempts_count_ck" CHECK ("failure_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "platforms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" varchar(160) NOT NULL,
  "website_url" text,
  "status" "record_status" DEFAULT 'active' NOT NULL,
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "platforms_workspace_id_uq" UNIQUE("workspace_id", "id")
);
CREATE UNIQUE INDEX "platforms_workspace_name_uidx" ON "platforms" ("workspace_id", lower("name"));
--> statement-breakpoint
CREATE TABLE "source_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "platform_id" uuid NOT NULL,
  "label" varchar(160) NOT NULL,
  "account_reference" varchar(320),
  "status" "source_account_status" DEFAULT 'active' NOT NULL,
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "source_accounts_workspace_id_uq" UNIQUE("workspace_id", "id"),
  CONSTRAINT "source_accounts_platform_scope_fk" FOREIGN KEY ("workspace_id", "platform_id") REFERENCES "platforms"("workspace_id", "id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "source_accounts_workspace_platform_label_uidx" ON "source_accounts" ("workspace_id", "platform_id", lower("label"));
--> statement-breakpoint
CREATE TABLE "events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" varchar(240) NOT NULL,
  "venue_name" varchar(240),
  "city" varchar(160),
  "status" "event_status" DEFAULT 'draft' NOT NULL,
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "events_workspace_id_uq" UNIQUE("workspace_id", "id")
);
CREATE INDEX "events_workspace_status_idx" ON "events" ("workspace_id", "status");
--> statement-breakpoint
CREATE TABLE "event_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "name" varchar(160) NOT NULL,
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz,
  "doors_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "event_sessions_workspace_id_uq" UNIQUE("workspace_id", "id"),
  CONSTRAINT "event_sessions_event_scope_fk" FOREIGN KEY ("workspace_id", "event_id") REFERENCES "events"("workspace_id", "id") ON DELETE CASCADE,
  CONSTRAINT "event_sessions_time_ck" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at")
);
CREATE UNIQUE INDEX "event_sessions_event_name_time_uidx" ON "event_sessions" ("event_id", "name", "starts_at");
CREATE INDEX "event_sessions_workspace_time_idx" ON "event_sessions" ("workspace_id", "starts_at");
--> statement-breakpoint
CREATE TABLE "ticket_tiers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "event_session_id" uuid NOT NULL,
  "name" varchar(160) NOT NULL,
  "section" varchar(160),
  "is_general_admission" boolean DEFAULT false NOT NULL,
  "face_value_vnd" bigint,
  "suggested_price_vnd" bigint,
  "transfer_status" "transfer_status" DEFAULT 'unverified' NOT NULL,
  "transfer_method" varchar(120),
  "transfer_notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "ticket_tiers_workspace_id_uq" UNIQUE("workspace_id", "id"),
  CONSTRAINT "ticket_tiers_session_scope_fk" FOREIGN KEY ("workspace_id", "event_session_id") REFERENCES "event_sessions"("workspace_id", "id") ON DELETE CASCADE,
  CONSTRAINT "ticket_tiers_face_value_ck" CHECK ("face_value_vnd" IS NULL OR "face_value_vnd" >= 0),
  CONSTRAINT "ticket_tiers_suggested_price_ck" CHECK ("suggested_price_vnd" IS NULL OR "suggested_price_vnd" >= 0),
  CONSTRAINT "ticket_tiers_verified_transfer_ck" CHECK ("transfer_status" <> 'verified'::transfer_status OR (coalesce(nullif(btrim("transfer_method"), ''), '') <> '' AND coalesce(nullif(btrim("transfer_notes"), ''), '') <> ''))
);
CREATE UNIQUE INDEX "ticket_tiers_session_name_uidx" ON "ticket_tiers" ("event_session_id", lower("name"));
--> statement-breakpoint
CREATE TABLE "purchases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "source_account_id" uuid NOT NULL,
  "event_session_id" uuid NOT NULL,
  "external_reference" varchar(240),
  "purchased_at" timestamptz NOT NULL,
  "total_cost_vnd" bigint NOT NULL,
  "status" "purchase_status" DEFAULT 'pending' NOT NULL,
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "purchases_workspace_id_uq" UNIQUE("workspace_id", "id"),
  CONSTRAINT "purchases_source_account_scope_fk" FOREIGN KEY ("workspace_id", "source_account_id") REFERENCES "source_accounts"("workspace_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "purchases_event_session_scope_fk" FOREIGN KEY ("workspace_id", "event_session_id") REFERENCES "event_sessions"("workspace_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "purchases_total_cost_ck" CHECK ("total_cost_vnd" >= 0)
);
CREATE UNIQUE INDEX "purchases_source_external_uidx" ON "purchases" ("source_account_id", "external_reference") WHERE "external_reference" IS NOT NULL;
CREATE INDEX "purchases_workspace_time_idx" ON "purchases" ("workspace_id", "purchased_at");
--> statement-breakpoint
CREATE TABLE "tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "purchase_id" uuid NOT NULL,
  "source_account_id" uuid NOT NULL,
  "event_session_id" uuid NOT NULL,
  "ticket_tier_id" uuid NOT NULL,
  "external_reference" varchar(240),
  "section" varchar(160),
  "row" varchar(80),
  "seat" varchar(80),
  "cost_vnd" bigint NOT NULL,
  "asking_price_vnd" bigint NOT NULL,
  "status" "ticket_status" DEFAULT 'preparing' NOT NULL,
  "blocked_reason" text,
  "artifact_reference" varchar(500),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "tickets_workspace_id_uq" UNIQUE("workspace_id", "id"),
  CONSTRAINT "tickets_purchase_scope_fk" FOREIGN KEY ("workspace_id", "purchase_id") REFERENCES "purchases"("workspace_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "tickets_source_account_scope_fk" FOREIGN KEY ("workspace_id", "source_account_id") REFERENCES "source_accounts"("workspace_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "tickets_event_session_scope_fk" FOREIGN KEY ("workspace_id", "event_session_id") REFERENCES "event_sessions"("workspace_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "tickets_tier_scope_fk" FOREIGN KEY ("workspace_id", "ticket_tier_id") REFERENCES "ticket_tiers"("workspace_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "tickets_cost_ck" CHECK ("cost_vnd" >= 0),
  CONSTRAINT "tickets_asking_price_ck" CHECK ("asking_price_vnd" >= 0),
  CONSTRAINT "tickets_block_reason_ck" CHECK ("status" <> 'blocked'::ticket_status OR coalesce(nullif(btrim("blocked_reason"), ''), '') <> '')
);
CREATE UNIQUE INDEX "tickets_source_external_uidx" ON "tickets" ("source_account_id", "external_reference") WHERE "external_reference" IS NOT NULL;
CREATE UNIQUE INDEX "tickets_session_seat_uidx" ON "tickets" ("event_session_id", "section", "row", "seat") WHERE "seat" IS NOT NULL;
CREATE INDEX "tickets_workspace_status_idx" ON "tickets" ("workspace_id", "status");
CREATE INDEX "tickets_tier_idx" ON "tickets" ("ticket_tier_id");
--> statement-breakpoint
CREATE TABLE "orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "order_code" bigserial NOT NULL,
  "status" "order_status" DEFAULT 'draft' NOT NULL,
  "customer_name" varchar(160) NOT NULL,
  "customer_email" varchar(320),
  "customer_phone" varchar(40),
  "subtotal_vnd" bigint NOT NULL,
  "total_vnd" bigint NOT NULL,
  "hold_expires_at" timestamptz,
  "paid_at" timestamptz,
  "cancelled_at" timestamptz,
  "created_by_membership_id" uuid NOT NULL,
  "notes" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "orders_workspace_id_uq" UNIQUE("workspace_id", "id"),
  CONSTRAINT "orders_creator_membership_scope_fk" FOREIGN KEY ("workspace_id", "created_by_membership_id") REFERENCES "memberships"("workspace_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "orders_subtotal_ck" CHECK ("subtotal_vnd" >= 0),
  CONSTRAINT "orders_total_ck" CHECK ("total_vnd" >= 0)
);
CREATE UNIQUE INDEX "orders_order_code_uidx" ON "orders" ("order_code");
CREATE INDEX "orders_workspace_status_idx" ON "orders" ("workspace_id", "status");
CREATE INDEX "orders_workspace_created_idx" ON "orders" ("workspace_id", "created_at");
--> statement-breakpoint
CREATE TABLE "ticket_holds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "ticket_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "status" "hold_status" DEFAULT 'active' NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "released_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "ticket_holds_ticket_scope_fk" FOREIGN KEY ("workspace_id", "ticket_id") REFERENCES "tickets"("workspace_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "ticket_holds_order_scope_fk" FOREIGN KEY ("workspace_id", "order_id") REFERENCES "orders"("workspace_id", "id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "ticket_holds_one_active_per_ticket_uidx" ON "ticket_holds" ("ticket_id") WHERE "status" = 'active'::hold_status;
CREATE UNIQUE INDEX "ticket_holds_order_ticket_uidx" ON "ticket_holds" ("order_id", "ticket_id");
CREATE INDEX "ticket_holds_active_expiry_idx" ON "ticket_holds" ("expires_at") WHERE "status" = 'active'::hold_status;
--> statement-breakpoint
CREATE TABLE "order_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "ticket_id" uuid NOT NULL,
  "description" varchar(500) NOT NULL,
  "unit_price_vnd" bigint NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "line_total_vnd" bigint NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "order_lines_order_scope_fk" FOREIGN KEY ("workspace_id", "order_id") REFERENCES "orders"("workspace_id", "id") ON DELETE CASCADE,
  CONSTRAINT "order_lines_ticket_scope_fk" FOREIGN KEY ("workspace_id", "ticket_id") REFERENCES "tickets"("workspace_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "order_lines_quantity_ck" CHECK ("quantity" = 1),
  CONSTRAINT "order_lines_unit_price_ck" CHECK ("unit_price_vnd" >= 0),
  CONSTRAINT "order_lines_total_ck" CHECK ("line_total_vnd" = "unit_price_vnd" * "quantity")
);
CREATE UNIQUE INDEX "order_lines_order_ticket_uidx" ON "order_lines" ("order_id", "ticket_id");
CREATE INDEX "order_lines_ticket_idx" ON "order_lines" ("ticket_id");
--> statement-breakpoint
CREATE TABLE "payment_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "provider" varchar(40) DEFAULT 'payos' NOT NULL,
  "provider_payment_link_id" varchar(240),
  "checkout_url" text,
  "amount_vnd" bigint NOT NULL,
  "status" "payment_link_status" DEFAULT 'creating' NOT NULL,
  "failure_code" varchar(120),
  "failure_message" text,
  "expires_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "payment_links_workspace_id_uq" UNIQUE("workspace_id", "id"),
  CONSTRAINT "payment_links_order_scope_fk" FOREIGN KEY ("workspace_id", "order_id") REFERENCES "orders"("workspace_id", "id") ON DELETE CASCADE,
  CONSTRAINT "payment_links_amount_ck" CHECK ("amount_vnd" >= 0)
);
CREATE UNIQUE INDEX "payment_links_provider_id_uidx" ON "payment_links" ("provider", "provider_payment_link_id") WHERE "provider_payment_link_id" IS NOT NULL;
CREATE UNIQUE INDEX "payment_links_one_live_per_order_uidx" ON "payment_links" ("order_id") WHERE "status" IN ('creating'::payment_link_status, 'active'::payment_link_status, 'unknown'::payment_link_status);
CREATE INDEX "payment_links_order_idx" ON "payment_links" ("order_id");
--> statement-breakpoint
CREATE TABLE "payment_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "order_id" uuid,
  "payment_link_id" uuid,
  "provider" varchar(40) DEFAULT 'payos' NOT NULL,
  "provider_event_id" varchar(240),
  "provider_transaction_id" varchar(240),
  "source" "payment_event_source" NOT NULL,
  "status" "payment_event_status" DEFAULT 'received' NOT NULL,
  "order_code" bigint,
  "amount_vnd" bigint,
  "occurred_at" timestamptz,
  "received_at" timestamptz DEFAULT now() NOT NULL,
  "payload" jsonb NOT NULL,
  "rejection_reason" text,
  "processed_at" timestamptz,
  CONSTRAINT "payment_events_order_scope_fk" FOREIGN KEY ("workspace_id", "order_id") REFERENCES "orders"("workspace_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "payment_events_link_scope_fk" FOREIGN KEY ("workspace_id", "payment_link_id") REFERENCES "payment_links"("workspace_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "payment_events_amount_ck" CHECK ("amount_vnd" IS NULL OR "amount_vnd" >= 0)
);
CREATE UNIQUE INDEX "payment_events_provider_event_uidx" ON "payment_events" ("provider", "provider_event_id") WHERE "provider_event_id" IS NOT NULL;
CREATE UNIQUE INDEX "payment_events_provider_transaction_uidx" ON "payment_events" ("provider", "provider_transaction_id") WHERE "provider_transaction_id" IS NOT NULL;
CREATE INDEX "payment_events_order_idx" ON "payment_events" ("order_id");
CREATE INDEX "payment_events_status_idx" ON "payment_events" ("workspace_id", "status");
--> statement-breakpoint
CREATE TABLE "deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "ticket_id" uuid NOT NULL,
  "status" "delivery_status" DEFAULT 'pending' NOT NULL,
  "recipient_name" varchar(160),
  "recipient_contact" varchar(320),
  "method" varchar(120) DEFAULT 'official_transfer' NOT NULL,
  "evidence_reference" varchar(500),
  "assigned_membership_id" uuid,
  "confirmed_at" timestamptz,
  "failure_reason" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "deliveries_order_scope_fk" FOREIGN KEY ("workspace_id", "order_id") REFERENCES "orders"("workspace_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "deliveries_ticket_scope_fk" FOREIGN KEY ("workspace_id", "ticket_id") REFERENCES "tickets"("workspace_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "deliveries_assignee_scope_fk" FOREIGN KEY ("workspace_id", "assigned_membership_id") REFERENCES "memberships"("workspace_id", "id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "deliveries_order_ticket_uidx" ON "deliveries" ("order_id", "ticket_id");
CREATE INDEX "deliveries_workspace_status_idx" ON "deliveries" ("workspace_id", "status");
--> statement-breakpoint
CREATE TABLE "cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "order_id" uuid,
  "payment_event_id" uuid REFERENCES "payment_events"("id") ON DELETE SET NULL,
  "type" "case_type" NOT NULL,
  "status" "case_status" DEFAULT 'open' NOT NULL,
  "title" varchar(240) NOT NULL,
  "description" text NOT NULL,
  "assigned_membership_id" uuid,
  "resolved_at" timestamptz,
  "resolution" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "cases_order_scope_fk" FOREIGN KEY ("workspace_id", "order_id") REFERENCES "orders"("workspace_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "cases_assignee_scope_fk" FOREIGN KEY ("workspace_id", "assigned_membership_id") REFERENCES "memberships"("workspace_id", "id") ON DELETE RESTRICT
);
CREATE INDEX "cases_workspace_status_idx" ON "cases" ("workspace_id", "status");
--> statement-breakpoint
CREATE TABLE "audit_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE RESTRICT,
  "actor_membership_id" uuid,
  "action" varchar(160) NOT NULL,
  "entity_type" varchar(120) NOT NULL,
  "entity_id" uuid,
  "request_id" varchar(120),
  "ip_address" inet,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "audit_logs_pk" PRIMARY KEY("id", "created_at"),
  CONSTRAINT "audit_logs_actor_scope_fk" FOREIGN KEY ("workspace_id", "actor_membership_id") REFERENCES "memberships"("workspace_id", "id") ON DELETE RESTRICT
);
CREATE INDEX "audit_logs_workspace_time_idx" ON "audit_logs" ("workspace_id", "created_at");
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" ("workspace_id", "entity_type", "entity_id");
