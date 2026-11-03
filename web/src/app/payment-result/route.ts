import { NextResponse } from 'next/server'

export function GET(request: Request) {
  const source = new URL(request.url)
  const destination = new URL('/orders', source.origin)
  const orderCode = source.searchParams.get('orderCode')
  const cancelled = source.searchParams.get('cancel') === 'true' || source.searchParams.get('status') === 'CANCELLED'
  destination.searchParams.set('paymentResult', cancelled ? 'cancelled' : 'returned')
  if (orderCode && /^\d{1,18}$/.test(orderCode)) destination.searchParams.set('orderCode', orderCode)
  return NextResponse.redirect(destination, 303)
}
