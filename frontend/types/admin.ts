export interface AdminPlan {
  id: number
  name: string
  type: string
  price: number
  description?: string
  memory?: number
  disk?: number
  cpu?: number
  serverLimit?: number
  databases?: number
  backups?: number
  emailSendDailyLimit?: number
  emailSendQueueLimit?: number
  portCount?: number
  tunnelPortCount?: number
  isDefault?: boolean
  hiddenFromBilling?: boolean
  features?: string[]
  boostPercent?: number
  boostStartsAt?: string
  boostExpiresAt?: string
  boostReason?: string
}

export interface BoostInfo {
  active: boolean
  percent: number
  expiresAt: string | null
  reason: string | null
}

export interface VirtualResources {
  memory: number
  disk: number
  cpu: number
}

export interface ServerBoostResponse {
  boost: BoostInfo
  virtualResources: VirtualResources
}

export interface AdminOrder {
  id: number
  userId: number
  description?: string
  planId?: number
  amount: number
  taxAmount: number
  taxRate: number
  status: string
  billingType?: string
  notes?: string
  createdAt: string
  expiresAt?: string
}

export interface PanelSettings {
  billingCurrency?: string
  [key: string]: any
}