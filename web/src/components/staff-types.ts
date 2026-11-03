export type Entity = Record<string, unknown> & { id?: string }

export interface Platform extends Entity { id: string; name?: string }
export interface Account extends Entity { id: string; platformId?: string; label?: string; accountReference?: string; email?: string }
export interface EventRecord extends Entity { id: string; name?: string; venueName?: string; venue?: string; city?: string; status?: 'draft' | 'active' | 'archived'; description?: string }
export interface SessionRecord extends Entity { id: string; eventId?: string; name?: string; startsAt?: string }
export interface Tier extends Entity { id: string; eventSessionId?: string; eventId?: string; name?: string; isGeneralAdmission?: boolean; kind?: 'ga' | 'assigned'; faceValueVnd?: number; suggestedPriceVnd?: number; price?: number; transferStatus?: string; transferMethod?: string }
export interface Purchase extends Entity { id: string; sourceAccountId?: string; accountId?: string; eventSessionId?: string; externalReference?: string; reference?: string; totalCostVnd?: number; status?: string; createdAt?: string }
export interface Ticket extends Entity {
  id: string
  purchaseId?: string
  externalReference?: string
  eventId?: string
  eventSessionId?: string
  sessionId?: string
  ticketTierId?: string
  tierId?: string
  section?: string
  row?: string
  seat?: string
  costVnd?: number
  askingPriceVnd?: number
  cost?: number
  price?: number
  status?: string
  state?: string
  verifiedAt?: string
}
export interface Order extends Entity {
  id: string
  reference?: string
  orderCode?: number
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  ticketIds?: string[]
  total?: number
  totalVnd?: number
  subtotalVnd?: number
  status?: string
  paymentStatus?: string
  paymentState?: string
  deliveryStatus?: string
  deliveryState?: string
  createdAt?: string
  paymentUrl?: string
}

export interface LookupData {
  platforms: Platform[]
  accounts: Account[]
  events: EventRecord[]
  sessions: SessionRecord[]
  tiers: Tier[]
  purchases: Purchase[]
  tickets: Ticket[]
  orders: Order[]
}
