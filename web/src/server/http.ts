import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { AuthenticationError } from './auth'

export class RequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
    this.name = 'RequestError'
  }
}

export async function readJson(request: Request, maxBytes = 16_384): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) throw new RequestError('Yêu cầu quá lớn.', 413)
  const reader = request.body?.getReader()
  if (!reader) throw new RequestError('Thiếu dữ liệu yêu cầu.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new RequestError('Yêu cầu quá lớn.', 413)
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const input = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { input.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder().decode(input)) as unknown
}

export function apiError(error: unknown) {
  if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof RequestError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? 'Dữ liệu không hợp lệ.' }, { status: 400 })
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'JSON không hợp lệ.' }, { status: 400 })
  if (typeof error === 'object' && error !== null && 'code' in error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Dữ liệu đã tồn tại (mã nguồn hoặc ghế trùng).' }, { status: 409 })
    if (error.code === '23503') return NextResponse.json({ error: 'Dữ liệu tham chiếu không hợp lệ.' }, { status: 400 })
  }
  console.error('Request failed', error)
  return NextResponse.json({ error: 'Không thể xử lý yêu cầu.' }, { status: 500 })
}
