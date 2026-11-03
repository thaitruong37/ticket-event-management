import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";

import { and, eq } from "drizzle-orm";

import { db, pool } from "../src/db";
import { hashPassword, normalizeEmail } from "../src/db/crypto";
import { auditLogs, memberships, users, workspaces } from "../src/db/schema";

async function promptVisible(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error(`${label} must be supplied through the environment.`);
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await terminal.question(`${label}: `)).trim();
  } finally {
    terminal.close();
  }
}

async function promptHidden(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error(`${label} must be supplied through BOOTSTRAP_PASSWORD or BOOTSTRAP_PASSWORD_FILE.`);
  }
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const previousRawMode = process.stdin.isRaw ?? false;
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(previousRawMode);
      process.stdin.pause();
    };
    const onData = (chunk: Buffer | string) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") {
          cleanup();
          process.stdout.write("\n");
          reject(new Error("Owner bootstrap cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (character === "\b" || character === "\u007f") value = value.slice(0, -1);
        else if (character >= " ") value += character;
      }
    };
    process.stdout.write(`${label}: `);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

async function readBootstrapPassword(): Promise<string> {
  if (process.env.BOOTSTRAP_PASSWORD) return process.env.BOOTSTRAP_PASSWORD;
  const passwordFile = process.env.BOOTSTRAP_PASSWORD_FILE?.trim();
  if (passwordFile) return (await readFile(passwordFile, "utf8")).replace(/\r?\n$/, "");
  return promptHidden("BOOTSTRAP_PASSWORD");
}

async function bootstrapOwner(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const email = normalizeEmail(process.env.BOOTSTRAP_EMAIL?.trim() || (await promptVisible("BOOTSTRAP_EMAIL")));
  const password = await readBootstrapPassword();
  const displayName = process.env.BOOTSTRAP_NAME?.trim() || email.split("@")[0];
  const workspaceSlug = (process.env.BOOTSTRAP_WORKSPACE_SLUG?.trim() || "default").toLowerCase();
  const workspaceName = process.env.BOOTSTRAP_WORKSPACE_NAME?.trim() || "Ticket Operations";
  if (!email.includes("@") || email.length > 320) throw new Error("BOOTSTRAP_EMAIL is invalid.");
  if (!/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/.test(workspaceSlug)) {
    throw new Error("BOOTSTRAP_WORKSPACE_SLUG must contain 3-80 lowercase letters, digits, or hyphens.");
  }

  const passwordHash = await hashPassword(password);
  const result = await db.transaction(async (tx) => {
    let [workspace] = await tx.select().from(workspaces).where(eq(workspaces.slug, workspaceSlug)).limit(1);
    if (!workspace) {
      [workspace] = await tx.insert(workspaces).values({ slug: workspaceSlug, name: workspaceName }).returning();
    }

    let [user] = await tx.select().from(users).where(eq(users.email, email)).limit(1);
    let userCreated = false;
    if (!user) {
      [user] = await tx.insert(users).values({ email, displayName, passwordHash }).returning();
      userCreated = true;
    }

    let [membership] = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.workspaceId, workspace.id), eq(memberships.userId, user.id)))
      .limit(1);
    let membershipCreated = false;
    if (!membership) {
      [membership] = await tx
        .insert(memberships)
        .values({ workspaceId: workspace.id, userId: user.id, role: "owner" })
        .returning();
      membershipCreated = true;
    } else if (membership.role !== "owner" || membership.status !== "active") {
      [membership] = await tx
        .update(memberships)
        .set({ role: "owner", status: "active", updatedAt: new Date() })
        .where(eq(memberships.id, membership.id))
        .returning();
    }

    if (userCreated || membershipCreated) {
      await tx.insert(auditLogs).values({
        workspaceId: workspace.id,
        actorMembershipId: membership.id,
        action: "bootstrap.owner",
        entityType: "membership",
        entityId: membership.id,
        metadata: { userCreated, membershipCreated },
      });
    }

    return { workspace, user, membership, userCreated, membershipCreated };
  });

  console.info(
    result.userCreated || result.membershipCreated
      ? `Owner ${result.user.email} is ready in workspace ${result.workspace.slug}.`
      : `Owner ${result.user.email} already exists in workspace ${result.workspace.slug}; password was not changed.`,
  );
}

bootstrapOwner()
  .catch((error: unknown) => {
    console.error("Owner bootstrap failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
