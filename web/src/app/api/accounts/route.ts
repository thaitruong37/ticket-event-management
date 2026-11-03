import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { platforms, sourceAccounts } from '@/db/schema'
import { readJson, RequestError } from '@/server/http'
import { staffRequest } from '@/server/route'

const schema = z.object({
  platformId: z.uuid(), label: z.string().trim().min(2).max(160),
  accountReference: z.string().trim().max(320).optional(), notes: z.string().max(2000).optional(),
})

export async function GET(request: Request) {
  return staffRequest(request, ['owner', 'operations', 'finance', 'viewer'], async (session) => {
    const rows = await db.select().from(sourceAccounts).where(eq(sourceAccounts.workspaceId, session.workspaceId))
    return session.role === 'owner' || session.role === 'operations'
      ? rows
      : rows.map(({ id, platformId, label, status }) => ({ id, platformId, label, status }))
  })
}

export async function POST(request: Request) {
  return staffRequest(request, ['owner', 'operations'], async (session) => {
    const data = schema.parse(await readJson(request))
    const [platform] = await db.select({ id: platforms.id }).from(platforms)
      .where(and(eq(platforms.workspaceId, session.workspaceId), eq(platforms.id, data.platformId), eq(platforms.status, 'active')))
    if (!platform) throw new RequestError('Sàn nguồn không tồn tại hoặc đã ngừng hoạt động.', 404)
    const [account] = await db.insert(sourceAccounts).values({ workspaceId: session.workspaceId, ...data }).returning()
    return account
  })
}
