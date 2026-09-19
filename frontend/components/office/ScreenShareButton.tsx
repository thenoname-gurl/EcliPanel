"use client"

import { useEffect, useRef, useState } from "react"
import { MonitorUp, Link2, Square, Copy } from "lucide-react"
import { toast } from "sonner"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import {
  type ScreenSessionState,
  ScreenPeer,
  screenSignalWsUrl,
  getScreenShareSupport,
} from "@/lib/office/screenShare"

interface Props {
  docId: number
  docName: string
  docType: string
  userName: string
}

/**
 * Host control for EcliOffice screen share. Captures the display with
 * getDisplayMedia, creates a public session, and answers viewer offers over
 * the backend signaling WS. While active, a floating bar shows the live
 * preview, the public link, the viewer count and the stop control.
 */
export default function ScreenShareButton({ docId, docName, docType, userName }: Props) {
  const [sharing, setSharing] = useState(false)
  const [starting, setStarting] = useState(false)
  const [link, setLink] = useState("")
  const [viewers, setViewers] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const tokenRef = useRef<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const peersRef = useRef<Map<string, ScreenPeer>>(new Map())
  const pendingRemoteIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stoppedRef = useRef(true)
  const reconnectAttempts = useRef(0)

  const send = (payload: Record<string, unknown>) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    try {
      ws.send(JSON.stringify(payload))
    } catch {
      /* noop */
    }
  }

  const closeAllPeers = () => {
    for (const [, peer] of peersRef.current) peer.close()
    peersRef.current.clear()
    pendingRemoteIceRef.current.clear()
  }

  const teardown = () => {
    stoppedRef.current = true
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current)
      reconnectRef.current = null
    }
    closeAllPeers()
    try {
      wsRef.current?.close()
    } catch {
      /* noop */
    }
    wsRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    sessionIdRef.current = null
    tokenRef.current = null
    setSharing(false)
    setLink("")
    setViewers(0)
    setError(null)
  }

  const stop = () => {
    try {
      wsRef.current?.send(JSON.stringify({ type: "screen_end" }))
    } catch {
      /* noop */
    }
    const sessionId = sessionIdRef.current
    if (sessionId) {
      void apiFetch(API_ENDPOINTS.screenShareDelete.replace(":id", String(sessionId)), { method: "DELETE" }).catch(() => {
        /* already gone */
      })
    }
    teardown()
  }

  const scheduleReconnect = () => {
    if (stoppedRef.current) return
    if (reconnectRef.current) return
    if (!tokenRef.current) return
    const delay = Math.min(1000 * Math.pow(1.6, reconnectAttempts.current), 8000)
    reconnectAttempts.current++
    reconnectRef.current = setTimeout(() => {
      reconnectRef.current = null
      if (stoppedRef.current) return
      connectHost()
    }, delay)
  }

  const syncPeersToViewers = (viewerIds?: string[]) => {
    if (!viewerIds) return
    const ids = new Set(viewerIds)
    for (const [viewerId, peer] of peersRef.current) {
      if (!ids.has(viewerId)) {
        peer.close()
        peersRef.current.delete(viewerId)
      }
    }
  }

  const acceptOffer = async (viewerId: string, sdp: string | null) => {
    if (!sdp) return
    const stream = streamRef.current
    if (!stream) return

    let peer = peersRef.current.get(viewerId)
    if (!peer) {
      peer = new ScreenPeer()
      peer.pc.onicecandidate = (e) => {
        if (e.candidate) send({ type: "screen_ice", to: viewerId, candidate: e.candidate.toJSON() })
      }
      peer.pc.onconnectionstatechange = () => {
        const st = peer!.pc.connectionState
        if (st === "failed" || st === "closed") {
          peersRef.current.delete(viewerId)
          pendingRemoteIceRef.current.delete(viewerId)
          peer!.close()
        }
      }
      peersRef.current.set(viewerId, peer)
    }

    const queued = pendingRemoteIceRef.current.get(viewerId) ?? []
    pendingRemoteIceRef.current.delete(viewerId)
    for (const cand of queued) await peer.addRemoteIce(cand)

    for (const track of stream.getTracks()) {
      const sender = peer.pc.getSenders().find((s) => s.track === track)
      if (!sender) {
        try {
          peer.pc.addTrack(track, stream)
        } catch {
          /* already added */
        }
      }
    }

    try {
      await peer.pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp }))
      const answer = await peer.pc.createAnswer()
      await peer.pc.setLocalDescription(answer)
      await peer.flushPendingIce()
      send({ type: "screen_answer", viewerId, sdp: answer.sdp })
    } catch (err) {
      console.error("[screen-share] failed to answer", err)
      peer.close()
      peersRef.current.delete(viewerId)
    }
  }

  const handleHostMessage = (ws: WebSocket, ev: MessageEvent) => {
    let data: any
    try {
      data = JSON.parse(typeof ev.data === "string" ? ev.data : "")
    } catch {
      return
    }
    if (!data?.type) return

    switch (data.type) {
      case "screen_state": {
        const state = data as ScreenSessionState
        setViewers(state.participants || 0)
        syncPeersToViewers(state.viewerIds)
        if (state.ended) {
          teardown()
          toast.info("Screen share session ended")
        }
        return
      }
      case "screen_offer": {
        void acceptOffer(String(data.viewerId || ""), data.sdp)
        return
      }
      case "screen_ice": {
        const viewerId = String(data.viewerId || "")
        const peer = peersRef.current.get(viewerId)
        if (peer) {
          void peer.addRemoteIce(data.candidate)
        } else {
          const list = pendingRemoteIceRef.current.get(viewerId) ?? []
          if (data.candidate) list.push(data.candidate)
          pendingRemoteIceRef.current.set(viewerId, list)
        }
        return
      }
      case "screen_error": {
        console.error("[screen-share] error:", data.message)
        if (data.message === "notFound") {
          toast.error("Screen share session expired")
          teardown()
        } else if (data.message === "notHost") {
          toast.error("This session is owned by another account")
          teardown()
        }
        return
      }
      default:
        return
    }
  }

  const connectHost = () => {
    const token = tokenRef.current
    if (!token) return
    const ws = new WebSocket(screenSignalWsUrl(token))
    wsRef.current = ws
    ws.onopen = () => {
      reconnectAttempts.current = 0
      send({ type: "screen_join", role: "host", name: userName })
    }
    ws.onmessage = (ev) => handleHostMessage(ws, ev)
    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null
      if (stoppedRef.current) return
      closeAllPeers()
      scheduleReconnect()
    }
    ws.onerror = () => {
      try {
        ws.close()
      } catch {
        /* noop */
      }
    }
  }

  const start = async () => {
    if (starting || sharing) return
    const support = getScreenShareSupport()
    if (!support.supported) {
      setError(support.detail)
      toast.error(
        support.code === "ios-restricted"
          ? "Screen sharing isn't available on iPhone or iPad"
          : "Screen sharing isn't supported in this browser"
      )
      return
    }
    setStarting(true)
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 12, max: 24 } },
      })
      streamRef.current = stream

      const onTrackEnded = () => stop()
      for (const track of stream.getTracks()) track.addEventListener("ended", onTrackEnded)

      const res = await apiFetch(API_ENDPOINTS.screenShareSessions, {
        method: "POST",
        body: { docId, title: docName, docType },
      })
      if (!res?.token) throw new Error("Could not create a screen share session")

      tokenRef.current = res.token
      sessionIdRef.current = res.id as string
      stoppedRef.current = false
      setLink(`${window.location.origin}/screen/${res.token}`)
      setSharing(true)

      connectHost()

      if (videoRef.current && stream.getVideoTracks().length > 0) {
        videoRef.current.srcObject = stream
        void videoRef.current.play().catch(() => undefined)
      }
    } catch (err: any) {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      const aborted = err?.name === "NotAllowedError" || err?.name === "AbortError"
      if (aborted) {
        setError("Screen share was cancelled")
      } else {
        setError("Screen share couldn't start")
        toast.error("Screen share couldn't start — please try again")
      }
    } finally {
      setStarting(false)
    }
  }

  useEffect(() => {
    return () => teardown()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <button
        onClick={() => void start()}
        disabled={starting || sharing}
        title="Share your screen via a public link"
        className="flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1.5 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        <MonitorUp className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">{sharing ? "Sharing…" : "Share screen"}</span>
      </button>

      {error && !sharing && (
        <span className="text-xs text-red-400">{error}</span>
      )}

      {sharing && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-3">
          <div className="flex w-full max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card/95 p-3 shadow-2xl shadow-black/40 backdrop-blur">
            <video
              ref={videoRef}
              muted
              playsInline
              className="h-14 w-24 shrink-0 rounded-md border border-border bg-black object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
                <span className="truncate">Live{viewers > 0 ? ` · ${viewers} watching` : " · waiting for viewers"}</span>
              </div>
              <div className="truncate text-xs text-muted-foreground">{docName}</div>
            </div>

            <div className="flex min-w-0 items-center gap-1.5">
              <span className="hidden max-w-64 truncate rounded-md bg-secondary px-2 py-1 text-xs text-muted-foreground md:inline">
                {link}
              </span>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(link).then(() => toast.success("Link copied"))
                }}
                className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-foreground transition hover:border-primary hover:text-primary"
                title="Copy public link"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy link
              </button>
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-foreground transition hover:border-primary hover:text-primary"
                title="Open the public page"
              >
                <Link2 className="h-3.5 w-3.5" />
                Open
              </a>
              <button
                onClick={stop}
                className="flex shrink-0 items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20"
              >
                <Square className="h-3.5 w-3.5" />
                Stop
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}