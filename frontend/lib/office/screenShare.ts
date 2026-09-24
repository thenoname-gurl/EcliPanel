"use client"

import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiWsUrl } from "@/lib/ws-url"

export interface ScreenSessionState {
  token: string
  title: string
  docType: string
  hostName: string
  startedAt: number
  hostOnline: boolean
  ended: boolean
  participants: number
  viewerIds?: string[]
  peerId?: string
}

export function screenPublicUrl(token: string): string {
  return API_ENDPOINTS.screenSharePublic.replace(":token", encodeURIComponent(token))
}

export function screenSignalWsUrl(token: string): string {
  return apiWsUrl(API_ENDPOINTS.screenShareSignal, { token })
}

export const SCREEN_STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
]

export class ScreenPeer {
  readonly pc: RTCPeerConnection
  private pendingCandidates: RTCIceCandidateInit[] = []

  constructor(extra: RTCConfiguration = {}) {
    this.pc = new RTCPeerConnection({ iceServers: SCREEN_STUN_SERVERS, ...extra })
  }

  async addRemoteIce(candidate: RTCIceCandidateInit | null | undefined): Promise<void> {
    if (!candidate) return
    if (this.pc.remoteDescription) {
      try {
        await this.pc.addIceCandidate(candidate)
      } catch {
        /* ignore */
      }
    } else {
      this.pendingCandidates.push(candidate)
    }
  }

  async flushPendingIce(): Promise<void> {
    const pending = this.pendingCandidates
    this.pendingCandidates = []
    for (const c of pending) {
      try {
        await this.pc.addIceCandidate(c)
      } catch {
        /* ignore */
      }
    }
  }

  close(): void {
    try {
      this.pc.close()
    } catch {
      /* noop */
    }
  }
}

export interface ScreenShareSupport {
  supported: boolean
  code: "ok" | "missing-api" | "ios-restricted"
  detail: string
}

export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent || ""
  const isIPhone = /iPhone|iPod/.test(ua)
  const isIPad = /iPad/.test(ua) || (ua.includes("Macintosh") && (navigator.maxTouchPoints || 0) > 1)
  return isIPhone || isIPad
}

export function getScreenShareSupport(): ScreenShareSupport {
  if (typeof navigator === "undefined") {
    return { supported: false, code: "missing-api", detail: "" }
  }
  const hasApi = typeof navigator.mediaDevices?.getDisplayMedia === "function"
  if (!hasApi) {
    if (isIOSDevice()) {
      return {
        supported: false,
        code: "ios-restricted",
        detail:
          "Apple doesn't allow any browser on iPhone or iPad — Chrome, Safari and others — to capture the screen. Share from a desktop browser on Windows, macOS or Linux, or share a document instead.",
      }
    }
    return {
      supported: false,
      code: "missing-api",
      detail:
        "This browser doesn't support screen capture. Try the latest Chrome, Edge, Firefox or Safari on Windows, macOS or Linux.",
    }
  }
  return { supported: true, code: "ok", detail: "" }
}

export function isScreenSupported(): boolean {
  return getScreenShareSupport().supported
}

export function pingFrame(ws: WebSocket): void {
  try {
    ws.send(JSON.stringify({ type: "screen_ping" }))
  } catch {
    /* noop */
  }
}