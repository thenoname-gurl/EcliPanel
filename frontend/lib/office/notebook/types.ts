export type NotebookKernelId = "lua"
export type NotebookCellType = "code" | "markdown"
export type NotebookCellMode = "code" | "blocks"

export type CellOutput =
  | { type: "stream"; name: "stdout" | "stderr"; text: string }
  | { type: "result"; data: unknown }
  | { type: "image"; mimeType: string; dataUrl: string }
  | { type: "html"; html: string }
  | { type: "error"; errorType?: string; traceback: string }

export interface NotebookCell {
  id: string
  type: NotebookCellType
  language: NotebookKernelId
  source: string
  outputs: CellOutput[]
  executionCount: number | null
  metadata?: Record<string, unknown>
}

export interface NotebookSnapshot {
  version: 1
  cells: NotebookCell[]
}

export interface KernelRunResult {
  durationMs: number
  outputs: CellOutput[]
  aborted?: boolean
}

export interface KernelRunOptions {
  timeoutMs?: number
  maxOutputChars?: number
}

export interface KernelDescriptor {
  id: NotebookKernelId
  monaco: string
  short: string
  color: string
  labelKey: string
}

export const NOTEBOOK_KERNELS: Record<NotebookKernelId, KernelDescriptor> = {
  lua: {
    id: "lua",
    monaco: "lua",
    short: "LUA",
    color: "text-violet-400",
    labelKey: "lua",
  },
}

export const NOTEBOOK_DEFAULT_KERNEL: NotebookKernelId = "lua"

export const NOTEBOOK_CELL_LIMIT = 500
export const NOTEBOOK_DEFAULT_TIMEOUT_MS = 10_000