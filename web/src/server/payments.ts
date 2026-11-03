import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import { db } from '@/db'
import {
  cases,
  deliveries,
  orderLines,
  orders,
  paymentEvents,
  paymentLinks,
  ticketHolds,
  tickets,
} from '@/db/schema'
import type { VerifiedPayOSWebhook } from './payos'

export type PaymentSource = 'webhook' | 'reconciliation'

type IncomingPayment = {
  orderCode: number
  amount: number
  reference: string
  paymentLinkId?: string | null
  transactionDateTime?: string | null
  payload: Record<string, unknown>
}

function validDate(value?: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function reviewCopy(reason: string, orderCode: number) {
  if (reason === 'late_payment') {
    return {
      type: 'late_payment' as const,
      title: `Late payment for order ${orderCode}`,
      description: 'payOS reported a payment after the order or ticket hold stopped being live. No inventory was allocated.',
    }
  }
  return {
    type: 'payment_mismatch' as const,
    title: `Payment mismatch for order ${orderCode}`,
    description: `The payment could not be accepted automatically: ${reason}. No inventory was allocated.`,
  }
}

async function findPaymentContext(payment: IncomingPayment) {
  const [order] = await db.select().from(orders).where(eq(orders.orderCode, payment.orderCode)).limit(1)
  if (order) return { order, workspaceId: order.workspaceId }
  if (payment.paymentLinkId) {
    const [link] = await db.select().from(paymentLinks)
      .where(eq(paymentLinks.providerPaymentLinkId, payment.paymentLinkId)).limit(1)
    if (link) {
      const [linkedOrder] = await db.select().from(orders).where(and(
        eq(orders.workspaceId, link.workspaceId), eq(orders.id, link.orderId),
      )).limit(1)
      if (linkedOrder) return { order: linkedOrder, workspaceId: link.workspaceId }
    }
  }
  return null
}

export async function recordRejectedPayOSWebhook(payload: Record<string, unknown>, reason: string): Promise<void> {
  const data = payload.data && typeof payload.data === 'object' ? payload.data as Record<string, unknown> : {}
  const orderCode = typeof data.orderCode === 'number' && Number.isSafeInteger(data.orderCode) ? data.orderCode : null
  const paymentLinkId = typeof data.paymentLinkId === 'string' ? data.paymentLinkId : null
  if (orderCode === null && !paymentLinkId) return

  const context = orderCode === null
    ? null
    : await findPaymentContext({ orderCode, amount: 0, reference: '', paymentLinkId, payload })
  if (!context && paymentLinkId) {
    const [link] = await db.select().from(paymentLinks).where(eq(paymentLinks.providerPaymentLinkId, paymentLinkId)).limit(1)
    if (link) {
      await db.insert(paymentEvents).values({
        workspaceId: link.workspaceId,
        orderId: link.orderId,
        paymentLinkId: link.id,
        provider: 'payos',
        source: 'webhook',
        status: 'rejected',
        orderCode,
        payload,
        rejectionReason: reason,
        processedAt: new Date(),
      })
    }
    return
  }
  if (!context) return

  await db.insert(paymentEvents).values({
    workspaceId: context.workspaceId,
    orderId: context.order.id,
    provider: 'payos',
    source: 'webhook',
    status: 'rejected',
    orderCode,
    payload,
    rejectionReason: reason,
    processedAt: new Date(),
  })
}

export async function processPayOSPayment(payment: IncomingPayment, source: PaymentSource) {
  const context = await findPaymentContext(payment)
  if (!context) return { accepted: false, duplicate: false, reason: 'unknown_order' as const }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from orders where workspace_id = ${context.workspaceId} and id = ${context.order.id} for update`)
    const [order] = await tx.select().from(orders).where(and(
      eq(orders.workspaceId, context.workspaceId), eq(orders.id, context.order.id),
    ))
    if (!order) return { accepted: false, duplicate: false, reason: 'unknown_order' as const }

    let link: typeof paymentLinks.$inferSelect | undefined = undefined
    if (payment.paymentLinkId) {
      const [found] = await tx.select().from(paymentLinks).where(and(
        eq(paymentLinks.workspaceId, context.workspaceId),
        eq(paymentLinks.orderId, order.id),
        eq(paymentLinks.providerPaymentLinkId, payment.paymentLinkId),
      )).limit(1)
      link = found
    }
    if (!link) {
      const [fallback] = await tx.select().from(paymentLinks).where(and(
        eq(paymentLinks.workspaceId, context.workspaceId),
        eq(paymentLinks.orderId, order.id),
        inArray(paymentLinks.status, ['creating', 'active', 'unknown']),
      )).orderBy(desc(paymentLinks.createdAt)).limit(1)
      link = fallback
    }
    if (link && payment.paymentLinkId && link.providerPaymentLinkId && link.providerPaymentLinkId !== payment.paymentLinkId) {
      link = undefined
    }
    if (link && payment.paymentLinkId && !link.providerPaymentLinkId) {
      await tx.update(paymentLinks).set({
        providerPaymentLinkId: payment.paymentLinkId,
        updatedAt: new Date(),
      }).where(and(eq(paymentLinks.id, link.id), sql`${paymentLinks.providerPaymentLinkId} is null`))
      link = { ...link, providerPaymentLinkId: payment.paymentLinkId }
    }

    const inserted = await tx.insert(paymentEvents).values({
      workspaceId: context.workspaceId,
      orderId: order.id,
      paymentLinkId: link?.id ?? null,
      provider: 'payos',
      providerTransactionId: payment.reference || null,
      source,
      status: 'verified',
      orderCode: payment.orderCode,
      amountVnd: payment.amount,
      occurredAt: validDate(payment.transactionDateTime),
      payload: payment.payload,
    }).onConflictDoNothing().returning()
    const event = inserted[0]
    if (!event) return { accepted: order.status === 'paid' || order.status === 'fulfilled', duplicate: true, reason: 'duplicate' as const }

    const lines = await tx.select().from(orderLines).where(and(
      eq(orderLines.workspaceId, context.workspaceId), eq(orderLines.orderId, order.id),
    ))
    for (const ticketId of lines.map((line) => line.ticketId).sort()) {
      await tx.execute(sql`select id from tickets where workspace_id = ${context.workspaceId} and id = ${ticketId} for update`)
    }
    const holds = await tx.select().from(ticketHolds).where(and(
      eq(ticketHolds.workspaceId, context.workspaceId), eq(ticketHolds.orderId, order.id), eq(ticketHolds.status, 'active'),
    ))
    const lineTicketIds = lines.map((line) => line.ticketId)
    const heldTicketIds = holds.map((hold) => hold.ticketId)
    const heldTicketSet = new Set(heldTicketIds)
    const heldTickets = heldTicketIds.length
      ? await tx.select().from(tickets).where(and(
          eq(tickets.workspaceId, context.workspaceId), inArray(tickets.id, heldTicketIds), eq(tickets.status, 'held'),
        ))
      : []
    const now = new Date()

    let rejectionReason: string | null = null
    let caseType: 'late_payment' | 'payment_mismatch' = 'payment_mismatch'
    if (payment.orderCode !== order.orderCode) rejectionReason = `payment order code ${payment.orderCode} does not match ${order.orderCode}`
    else if (payment.amount !== order.totalVnd) rejectionReason = `expected ${order.totalVnd} VND, received ${payment.amount} VND`
    else if (!link) rejectionReason = 'payment link does not match this order'
    else if (!['creating', 'active', 'unknown'].includes(link.status)) {
      rejectionReason = `payment link status is ${link.status}`
      caseType = 'late_payment'
    } else if (link.amountVnd !== order.totalVnd) rejectionReason = 'stored payment-link amount does not match the order total'
    else if (order.status !== 'awaiting_payment') {
      rejectionReason = `order status is ${order.status}`
      caseType = 'late_payment'
    } else if (!order.holdExpiresAt || order.holdExpiresAt <= now) {
      rejectionReason = 'ticket hold expired before payment was processed'
      caseType = 'late_payment'
    } else if (
      holds.length !== lines.length
      || heldTickets.length !== lines.length
      || lineTicketIds.some((ticketId) => !heldTicketSet.has(ticketId))
      || holds.some((hold) => hold.expiresAt <= now)
    ) {
      rejectionReason = 'the complete live ticket hold is no longer available'
      caseType = 'late_payment'
    }

    if (rejectionReason) {
      const copy = reviewCopy(caseType === 'late_payment' ? 'late_payment' : rejectionReason, order.orderCode)
      await tx.update(paymentEvents).set({
        status: 'review', rejectionReason, processedAt: now,
      }).where(eq(paymentEvents.id, event.id))
      if (link) await tx.update(paymentLinks).set({ status: 'unknown', updatedAt: now }).where(eq(paymentLinks.id, link.id))
      if (['awaiting_payment', 'cancelled', 'expired'].includes(order.status)) {
        await tx.update(orders).set({ status: 'payment_review', updatedAt: now }).where(eq(orders.id, order.id))
      }
      await tx.insert(cases).values({
        workspaceId: context.workspaceId,
        orderId: order.id,
        paymentEventId: event.id,
        type: copy.type,
        status: 'open',
        title: copy.title,
        description: copy.description,
      })
      return { accepted: false, duplicate: false, reason: rejectionReason }
    }

    await tx.update(ticketHolds).set({ status: 'converted', releasedAt: now }).where(and(
      eq(ticketHolds.workspaceId, context.workspaceId), eq(ticketHolds.orderId, order.id), eq(ticketHolds.status, 'active'),
    ))
    const soldTickets = await tx.update(tickets).set({ status: 'sold', updatedAt: now }).where(and(
      eq(tickets.workspaceId, context.workspaceId), inArray(tickets.id, heldTicketIds), eq(tickets.status, 'held'),
    )).returning({ id: tickets.id })
    if (soldTickets.length !== lines.length) throw new Error('Ticket allocation changed during payment processing.')
    await tx.update(orders).set({ status: 'paid', paidAt: now, updatedAt: now }).where(eq(orders.id, order.id))
    await tx.update(paymentEvents).set({ status: 'processed', processedAt: now }).where(eq(paymentEvents.id, event.id))
    if (link) await tx.update(paymentLinks).set({ status: 'paid', updatedAt: now }).where(eq(paymentLinks.id, link.id))
    if (lines.length) {
      await tx.insert(deliveries).values(lines.map((line) => ({
        workspaceId: context.workspaceId,
        orderId: order.id,
        ticketId: line.ticketId,
        status: 'pending' as const,
        recipientName: order.customerName,
        recipientContact: order.customerEmail || order.customerPhone,
      }))).onConflictDoNothing()
    }
    return { accepted: true, duplicate: false, reason: null }
  })
}

export function verifiedWebhookToPayment(data: VerifiedPayOSWebhook, rawPayload: Record<string, unknown>): IncomingPayment {
  return {
    orderCode: data.orderCode,
    amount: data.amount,
    reference: data.reference,
    paymentLinkId: data.paymentLinkId,
    transactionDateTime: data.transactionDateTime,
    payload: rawPayload,
  }
}

export async function getFinanceOverview(workspaceId: string) {
  const [summaryRows, caseCounts, eventRows, openCases, linkRows] = await Promise.all([
    db.select({
      grossPaidVnd: sql<string>`coalesce(sum(${orders.totalVnd}) filter (where ${orders.status} in ('paid', 'fulfilled')), 0)::text`,
      paidOrders: sql<number>`count(*) filter (where ${orders.status} in ('paid', 'fulfilled'))::int`,
      awaitingPaymentVnd: sql<string>`coalesce(sum(${orders.totalVnd}) filter (where ${orders.status} = 'awaiting_payment'), 0)::text`,
      awaitingPaymentOrders: sql<number>`count(*) filter (where ${orders.status} = 'awaiting_payment')::int`,
      paymentReviewOrders: sql<number>`count(*) filter (where ${orders.status} = 'payment_review')::int`,
    }).from(orders).where(eq(orders.workspaceId, workspaceId)),
    db.select({ count: sql<number>`count(*)::int` }).from(cases).where(and(
      eq(cases.workspaceId, workspaceId), inArray(cases.status, ['open', 'in_progress']),
    )),
    db.select().from(paymentEvents).where(eq(paymentEvents.workspaceId, workspaceId)).orderBy(desc(paymentEvents.receivedAt)).limit(200),
    db.select().from(cases).where(and(eq(cases.workspaceId, workspaceId), inArray(cases.status, ['open', 'in_progress']))).orderBy(desc(cases.createdAt)).limit(200),
    db.select().from(paymentLinks).where(eq(paymentLinks.workspaceId, workspaceId)).orderBy(desc(paymentLinks.createdAt)).limit(500),
  ])

  const totals = summaryRows[0]
  return {
    summary: {
      grossPaidVnd: Number(totals?.grossPaidVnd ?? 0),
      paidOrders: totals?.paidOrders ?? 0,
      awaitingPaymentVnd: Number(totals?.awaitingPaymentVnd ?? 0),
      awaitingPaymentOrders: totals?.awaitingPaymentOrders ?? 0,
      paymentReviewOrders: totals?.paymentReviewOrders ?? 0,
      openCases: caseCounts[0]?.count ?? 0,
    },
    paymentEvents: eventRows,
    paymentLinks: linkRows,
    cases: openCases,
  }
}

export async function listCases(workspaceId: string) {
  return db.select().from(cases).where(eq(cases.workspaceId, workspaceId)).orderBy(desc(cases.createdAt)).limit(500)
}
