import { NextResponse } from 'next/server'

import { processPayOSPayment, recordRejectedPayOSWebhook, verifiedWebhookToPayment } from '@/server/payments'
import { isPayOSConfigured, verifyPayOSWebhook } from '@/server/payos'

export const runtime = 'nodejs'

const MAX_WEBHOOK_BYTES = 256 * 1024

function asPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Webhook body must be an object.')
  return value as Record<string, unknown>
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const declaredLength = Number.parseInt(request.headers.get('content-length') ?? '', 10)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) throw new Error('Webhook body is too large.')
  if (!request.body) throw new Error('Webhook body is required.')

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_WEBHOOK_BYTES) {
      await reader.cancel()
      throw new Error('Webhook body is too large.')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return asPayload(JSON.parse(new TextDecoder().decode(bytes)) as unknown)
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>
  try {
    payload = await readJsonBody(request)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  if (!isPayOSConfigured()) {
    return NextResponse.json({ error: 'payOS webhook verification is not configured.' }, { status: 503 })
  }

  let verified: Awaited<ReturnType<typeof verifyPayOSWebhook>>
  try {
    verified = await verifyPayOSWebhook(payload)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Webhook verification failed.'
    try {
      await recordRejectedPayOSWebhook(payload, reason)
    } catch (recordError) {
      console.error('Unable to record rejected payOS webhook', recordError)
    }
    console.error('payOS webhook rejected', error)
    return NextResponse.json({ error: 'Invalid payOS webhook.' }, { status: 400 })
  }

  if (payload.code !== '00') {
    await recordRejectedPayOSWebhook(payload, `Unexpected payOS result code: ${String(payload.code)}`)
    return NextResponse.json({ error: 'Webhook is not a successful payment.' }, { status: 400 })
  }

  try {
    const result = await processPayOSPayment(verifiedWebhookToPayment(verified, payload), 'webhook')
    return NextResponse.json({ code: '00', desc: 'success', data: result })
  } catch (error) {
    console.error('payOS webhook processing failed', error)
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 })
  }
}
