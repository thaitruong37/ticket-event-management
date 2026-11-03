import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { Client } from 'pg'

import { db, pool } from '../src/db'
import { cases, orders, paymentLinks, ticketHolds, tickets } from '../src/db/schema'
import { processPayOSPayment } from '../src/server/payments'
import {
  cancelPayOSPaymentLink,
  getPayOSPaymentLink,
  isPayOSConfigured,
  mapPayOSStatus,
  type PayOSPaymentLink,
} from '../src/server/payos'

const batchSize = positiveInteger(process.env.WORKER_BATCH_SIZE, 50)
const intervalMs = positiveInteger(process.env.WORKER_INTERVAL_MS, 30_000)

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function isProviderNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { status?: unknown; statusCode?: unknown; name?: unknown }
  return candidate.status === 404 || candidate.statusCode === 404 || candidate.name === 'NotFoundError'
}

async function updateProviderState(linkId: string, provider: PayOSPaymentLink): Promise<void> {
  await db.update(paymentLinks).set({
    providerPaymentLinkId: provider.id,
    status: mapPayOSStatus(provider.status),
    failureCode: null,
    failureMessage: null,
    updatedAt: new Date(),
  }).where(and(
    eq(paymentLinks.id, linkId),
    inArray(paymentLinks.status, ['creating', 'active', 'unknown', 'failed']),
  ))
}

async function submitProviderPayment(
  order: typeof orders.$inferSelect,
  provider: PayOSPaymentLink,
): Promise<void> {
  const transaction = provider.transactions.at(-1)
  await processPayOSPayment({
    orderCode: order.orderCode,
    amount: provider.amountPaid,
    reference: transaction?.reference || `payos-link:${provider.id}:${provider.amountPaid}`,
    paymentLinkId: provider.id,
    transactionDateTime: transaction?.transactionDateTime || null,
    payload: provider as unknown as Record<string, unknown>,
  }, 'reconciliation')
}

async function quarantineOrder(orderId: string, reason: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from orders where id = ${orderId} for update`)
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1)
    if (!order || order.status !== 'awaiting_payment') return false

    const [existingCase] = await tx.select({ id: cases.id }).from(cases).where(and(
      eq(cases.workspaceId, order.workspaceId),
      eq(cases.orderId, order.id),
      eq(cases.status, 'open'),
      eq(cases.type, 'payment_mismatch'),
    )).limit(1)

    const now = new Date()
    await tx.update(orders).set({ status: 'payment_review', updatedAt: now }).where(eq(orders.id, order.id))
    await tx.update(paymentLinks).set({
      status: 'unknown',
      failureCode: 'RECONCILIATION_REQUIRED',
      failureMessage: reason,
      updatedAt: now,
    }).where(and(
      eq(paymentLinks.workspaceId, order.workspaceId),
      eq(paymentLinks.orderId, order.id),
      inArray(paymentLinks.status, ['creating', 'active', 'unknown']),
    ))
    if (!existingCase) {
      await tx.insert(cases).values({
        workspaceId: order.workspaceId,
        orderId: order.id,
        type: 'payment_mismatch',
        status: 'open',
        title: `Payment state unavailable for order ${order.orderCode}`,
        description: `${reason} Ticket holds were quarantined and were not released.`,
      })
    }
    return true
  })
}

async function expireConfirmedUnpaidOrder(orderId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from orders where id = ${orderId} for update`)
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1)
    if (!order || order.status !== 'awaiting_payment' || !order.holdExpiresAt || order.holdExpiresAt > new Date()) return false

    const liveLinks = await tx.select({ id: paymentLinks.id }).from(paymentLinks).where(and(
      eq(paymentLinks.workspaceId, order.workspaceId),
      eq(paymentLinks.orderId, order.id),
      inArray(paymentLinks.status, ['creating', 'active', 'unknown']),
    )).limit(1)
    if (liveLinks.length) return false

    const activeHolds = await tx.select().from(ticketHolds).where(and(
      eq(ticketHolds.workspaceId, order.workspaceId),
      eq(ticketHolds.orderId, order.id),
      eq(ticketHolds.status, 'active'),
    ))
    const ticketIds = activeHolds.map((hold) => hold.ticketId)
    const now = new Date()
    await tx.update(ticketHolds).set({ status: 'expired', releasedAt: now }).where(and(
      eq(ticketHolds.workspaceId, order.workspaceId),
      eq(ticketHolds.orderId, order.id),
      eq(ticketHolds.status, 'active'),
    ))
    if (ticketIds.length) {
      await tx.update(tickets).set({ status: 'available', updatedAt: now }).where(and(
        eq(tickets.workspaceId, order.workspaceId),
        inArray(tickets.id, ticketIds),
        eq(tickets.status, 'held'),
      ))
    }
    await tx.update(orders).set({ status: 'expired', updatedAt: now }).where(eq(orders.id, order.id))
    return true
  })
}

async function reconcileExpiredOrders(): Promise<{ expired: number; quarantined: number; payments: number }> {
  const candidates = await db.select().from(orders).where(and(
    eq(orders.status, 'awaiting_payment'),
    sql`${orders.holdExpiresAt} is not null and ${orders.holdExpiresAt} <= now()`,
  )).orderBy(asc(orders.holdExpiresAt)).limit(batchSize)

  let expired = 0
  let quarantined = 0
  let payments = 0

  for (const order of candidates) {
    const [link] = await db.select().from(paymentLinks).where(and(
      eq(paymentLinks.workspaceId, order.workspaceId),
      eq(paymentLinks.orderId, order.id),
    )).orderBy(desc(paymentLinks.createdAt)).limit(1)

    if (!link) {
      if (await expireConfirmedUnpaidOrder(order.id)) expired += 1
      continue
    }
    if (!isPayOSConfigured()) {
      if (await quarantineOrder(order.id, 'payOS credentials are unavailable, so unpaid status could not be verified.')) quarantined += 1
      continue
    }

    try {
      let provider = await getPayOSPaymentLink(link.providerPaymentLinkId || order.orderCode)
      if (provider.status === 'PAID' || provider.status === 'UNDERPAID' || provider.amountPaid > 0) {
        await submitProviderPayment(order, provider)
        payments += 1
        continue
      }
      await updateProviderState(link.id, provider)

      if (provider.status === 'PROCESSING') {
        if (await quarantineOrder(order.id, 'payOS reports that payment processing is still in progress.')) quarantined += 1
        continue
      }
      if (provider.status === 'PENDING') {
        provider = await cancelPayOSPaymentLink(provider.id, 'Ticket hold expired')
        if (provider.status === 'PAID' || provider.status === 'UNDERPAID' || provider.amountPaid > 0) {
          await submitProviderPayment(order, provider)
          payments += 1
          continue
        }
        await updateProviderState(link.id, provider)
      }

      if (['CANCELLED', 'EXPIRED', 'FAILED'].includes(provider.status)) {
        if (await expireConfirmedUnpaidOrder(order.id)) expired += 1
      } else if (await quarantineOrder(order.id, `Unexpected payOS status: ${provider.status}.`)) {
        quarantined += 1
      }
    } catch (error) {
      if (isProviderNotFound(error)) {
        await db.update(paymentLinks).set({
          status: 'failed',
          failureCode: 'PAYOS_NOT_FOUND',
          failureMessage: 'payOS confirmed that no payment request exists for this order code.',
          updatedAt: new Date(),
        }).where(eq(paymentLinks.id, link.id))
        if (await expireConfirmedUnpaidOrder(order.id)) expired += 1
        continue
      }
      const reason = error instanceof Error ? error.message : 'Unknown payOS reconciliation error.'
      if (await quarantineOrder(order.id, `payOS could not be reached or verified: ${reason}`)) quarantined += 1
    }
  }

  return { expired, quarantined, payments }
}

async function reconcileLivePaymentLinks(): Promise<number> {
  if (!isPayOSConfigured()) return 0
  const rows = await db.select({ link: paymentLinks, order: orders })
    .from(paymentLinks)
    .innerJoin(orders, and(eq(orders.id, paymentLinks.orderId), eq(orders.workspaceId, paymentLinks.workspaceId)))
    .where(and(
      inArray(paymentLinks.status, ['creating', 'active', 'unknown']),
      eq(orders.status, 'awaiting_payment'),
    ))
    .orderBy(asc(paymentLinks.updatedAt))
    .limit(batchSize)

  let processed = 0
  for (const { link, order } of rows) {
    try {
      const provider = await getPayOSPaymentLink(link.providerPaymentLinkId || order.orderCode)
      if (provider.status === 'PAID' || provider.status === 'UNDERPAID' || provider.amountPaid > 0) {
        await submitProviderPayment(order, provider)
      } else {
        await updateProviderState(link.id, provider)
      }
      processed += 1
    } catch (error) {
      console.error(`Unable to reconcile payment link ${link.id}`, error)
    }
  }
  return processed
}

async function runCycle(): Promise<void> {
  const reconciled = await reconcileLivePaymentLinks()
  const expiry = await reconcileExpiredOrders()
  if (reconciled || expiry.expired || expiry.quarantined || expiry.payments) {
    console.log(`Worker cycle: reconciled=${reconciled}, expired=${expiry.expired}, quarantined=${expiry.quarantined}, payments=${expiry.payments}`)
  }
}

async function guardedCycle(): Promise<void> {
  const lockClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'require'
      ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false' }
      : undefined,
  })
  await lockClient.connect()
  try {
    const result = await lockClient.query<{ acquired: boolean }>(
      'select pg_try_advisory_lock(20261024, 1) as acquired',
    )
    if (!result.rows[0]?.acquired) return
    try {
      await runCycle()
    } finally {
      await lockClient.query('select pg_advisory_unlock(20261024, 1)')
    }
  } finally {
    await lockClient.end()
  }
}

async function main(): Promise<void> {
  do {
    await guardedCycle()
    if (process.env.WORKER_ONCE === 'true') break
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  } while (true)
}

main()
  .catch((error: unknown) => {
    console.error('Worker failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
