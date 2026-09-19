export type OfficeDocType = "document" | "spreadsheet" | "presentation" | "notebook"

export type OfficePermission = "view" | "comment" | "edit"

export type OfficeRole = OfficePermission | "owner"

export interface OfficeUserBrief {
  id: number
  displayName?: string | null
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  avatarUrl?: string | null
}

export interface OfficeShareDTO {
  id: number
  documentId: number
  userId: number
  permission: OfficePermission
  createdAt: string
  user: OfficeUserBrief | null
}

export interface OfficeDocumentDTO {
  id: number
  type: OfficeDocType
  name: string
  description: string | null
  ownerId: number
  orgId: number | null
  role: OfficeRole
  isStarred: boolean
  folder: string | null
  thumbnailUrl: string | null
  content: unknown | null
  hasCollabState: boolean
  shared?: boolean
  createdAt: string
  updatedAt: string
}

export interface OfficeRoomInfo {
  docId: number
  permission: OfficePermission
  participants: number
}

export type OfficeEditorEvents = "status" | "sync" | "error"

export type OfficeEditorStatus =
  | "connecting"
  | "connected"
  | "synced"
  | "disconnected"