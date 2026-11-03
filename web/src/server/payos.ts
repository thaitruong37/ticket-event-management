import { PayOS } from '@payos/node'

export class PayOSConfigurationError extends Error {
  readonly status = 503

  constructor(message = 'payOS is not configured.') {
    super(message)
    this.name = 'PayOSConfigurationError'
  }
}

export type PayOSPaymentStatus =
  | 'PENDING'
  | 'CANCELLED'
  | 'UNDERPAID'
  | 'PAID'
  | 'EXPIRED'
  | 'PROCESSING'
  | 'FAILED'

export type PayOSPaymentLink = {
  id: string
  orderCode: number
  amount: number
  amountPaid: number
  amountRemaining: number
  status: PayOSPaymentStatus
  createdAt: string
  transactions: Array<{
    reference: string
    amount: number
    transactionDateTime: string
  }>
  cancellationReason: string | null
  canceledAt: string | null
}

export type VerifiedPayOSWebhook = {
  orderCode: number
  amount: number
  description: string
  accountNumber: string
  reference: string
  transactionDateTime: string
  currency: string
  paymentLinkId: string
  code: string
  desc: string
}

let singleton: PayOS | null = null

export function isPayOSNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { status?: unknown; statusCode?: unknown; name?: unknown }
  return candidate.status === 404 || candidate.statusCode === 404 || candidate.name === 'NotFoundError'
}

export function isPayOSConfigured(): boolean {
  return Boolean(
    process.env.PAYOS_CLIENT_ID?.trim()
      && process.env.PAYOS_API_KEY?.trim()
      && process.env.PAYOS_CHECKSUM_KEY?.trim(),
  )
}

export function getPayOS(): PayOS {
  if (!isPayOSConfigured()) throw new PayOSConfigurationError()
  if (!singleton) {
    singleton = new PayOS({
      clientId: process.env.PAYOS_CLIENT_ID!.trim(),
      apiKey: process.env.PAYOS_API_KEY!.trim(),
      checksumKey: process.env.PAYOS_CHECKSUM_KEY!.trim(),
    })
  }
  return singleton
}

function appOrigin(): string {
  const value = process.env.APP_URL?.trim() || process.env.APP_ORIGIN?.trim()
  if (!value) throw new PayOSConfigurationError('APP_URL (or APP_ORIGIN) is required before creating a real payment link.')
  let origin: URL
  try {
    origin = new URL(value)
  } catch {
    throw new PayOSConfigurationError('APP_URL/APP_ORIGIN must be an absolute URL.')
  }
  if (origin.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    throw new PayOSConfigurationError('APP_URL/APP_ORIGIN must use HTTPS in production.')
  }
  return origin.origin
}

function safeOrderCode(orderCode: number): number {
  if (!Number.isSafeInteger(orderCode) || orderCode <= 0) {
    throw new Error('Order code cannot be represented safely for payOS.')
  }
  return orderCode
}

export type CreatedPayOSPaymentLink = {
  paymentLinkId: string
  checkoutUrl: string
  orderCode: number
  amount: number
  status: PayOSPaymentStatus
}

export async function createPayOSPaymentLink(input: {
  orderCode: number
  amountVnd: number
  description: string
  customerName: string
  customerEmail?: string | null
  customerPhone?: string | null
  expiresAt?: Date | null
  items: Array<{ name: string; quantity: number; price: number }>
}): Promise<CreatedPayOSPaymentLink> {
  const origin = appOrigin()
  const orderCode = safeOrderCode(input.orderCode)
  return getPayOS().paymentRequests.create({
    orderCode,
    amount: input.amountVnd,
    description: `DH ${orderCode}`.slice(0, 25),
    buyerName: input.customerName,
    buyerEmail: input.customerEmail || undefined,
    buyerPhone: input.customerPhone || undefined,
    items: input.items.map((item) => ({
      name: item.name.slice(0, 255),
      quantity: item.quantity,
      price: item.price,
    })),
    cancelUrl: `${origin}/payment-result?cancel=true&orderCode=${orderCode}`,
    returnUrl: `${origin}/payment-result?orderCode=${orderCode}`,
    expiredAt: input.expiresAt ? Math.floor(input.expiresAt.getTime() / 1_000) : undefined,
  })
}

export async function getPayOSPaymentLink(idOrOrderCode: string | number): Promise<PayOSPaymentLink> {
  return typeof idOrOrderCode === 'number'
    ? getPayOS().paymentRequests.get(idOrOrderCode) as Promise<PayOSPaymentLink>
    : getPayOS().paymentRequests.get(idOrOrderCode) as Promise<PayOSPaymentLink>
}

export async function cancelPayOSPaymentLink(
  idOrOrderCode: string | number,
  reason = 'Order cancelled',
): Promise<PayOSPaymentLink> {
  return typeof idOrOrderCode === 'number'
    ? getPayOS().paymentRequests.cancel(idOrOrderCode, reason) as Promise<PayOSPaymentLink>
    : getPayOS().paymentRequests.cancel(idOrOrderCode, reason) as Promise<PayOSPaymentLink>
}

export async function verifyPayOSWebhook(payload: unknown): Promise<VerifiedPayOSWebhook> {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid payOS webhook body.')
  const verified = await getPayOS().webhooks.verify(payload as Parameters<PayOS['webhooks']['verify']>[0])
  return verified as VerifiedPayOSWebhook
}

export function mapPayOSStatus(status: PayOSPaymentStatus): 'active' | 'paid' | 'cancelled' | 'expired' | 'failed' | 'unknown' {
  switch (status) {
    case 'PENDING':
    case 'PROCESSING':
    case 'UNDERPAID':
      return 'active'
    case 'PAID':
      return 'paid'
    case 'CANCELLED':
      return 'cancelled'
    case 'EXPIRED':
      return 'expired'
    case 'FAILED':
      return 'failed'
    default:
      return 'unknown'
  }
}
