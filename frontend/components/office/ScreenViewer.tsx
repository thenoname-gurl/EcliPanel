"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Monitor, Wifi, WifiOff, Play, Loader2 } from "lucide-react"
import {
  type ScreenSessionState,
  ScreenPeer,
  screenPublicUrl,
  screenSignalWsUrl,
  pingFrame,
} from "@/lib/office/screenShare"

type ViewerStatus = "loading" | "invalid" | "waiting" | "connecting" | "live" | "ended"

interface Props {
  token: string
}

const ICE_RESTART_DELAY_MS = 4000

/**
 * Public viewer for an EcliOffice screen share. No auth — anyone with the
 * token/capability (the public link) can join. Connects to the signaling WS as
 * a "viewer", offers to the host, renders the received video stream.
 */
export default function ScreenViewer({ token }: Props) {
  const [status, setStatus] = useState<ViewerStatus>("loading")
  const [title, setTitle] = useState("Live Screen Share")
  const [hostName, setHostName] = useState("")
  const [participants, setParticipants] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const peerRef = useRef<ScreenPeer | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const offerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const endedRef = useRef(false)
  const hostOnlineRef = useRef(false)
  const attemptedRef = useRef(false)
  const reconnectAttempts = useRef(0)

  const send = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    try {
      ws.send(JSON.stringify(payload))
    } catch {
      /* noop */
    }
  }, [])

  const destroyPeer = useCallback(() => {
    if (offerTimerRef.current) {
      clearTimeout(offerTimerRef.current)
      offerTimerRef.current = null
    }
    peerRef.current?.close()
    peerRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    attemptedRef.current = false
  }, [])

  const markEnded = useCallback((reason: string) => {
    if (endedRef.current) return
    endedRef.current = true
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current)
      reconnectRef.current = null
    }
    try {
      wsRef.current?.close()
    } catch {
      /* noop */
    }
    wsRef.current = null
    destroyPeer()
    setErrorMsg(reason)
    setStatus("ended")
  }, [destroyPeer])

  const ensureOffer = useCallback(() => {
    if (endedRef.current || !hostOnlineRef.current) return
    if (attemptedRef.current) return
    attemptedRef.current = true

    const cleanup = () => {
      peerRef.current?.close()
      peerRef.current = null
      attemptedRef.current = false
    }

    const pc = new ScreenPeer()
    peerRef.current = pc
    pc.pc.addTransceiver("video", { direction: "recvonly" })

    pc.pc.ontrack = (event) => {
      if (endedRef.current) return
      if (!streamRef.current) {
        streamRef.current = new MediaStream()
        if (videoRef.current) {
          videoRef.current.srcObject = streamRef.current
          void videoRef.current.play().catch(() => undefined)
        }
      }
      if (event.streams?.[0]) {
        for (const t of event.streams[0].getTracks()) streamRef.current.addTrack(t)
      }
      setStatus("live")
    }

    pc.pc.onicecandidate = (event) => {
      if (event.candidate) send({ type: "screen_ice", candidate: event.candidate.toJSON() })
    }

    pc.pc.onconnectionstatechange = () => {
      const st = pc.pc.connectionState
      if (endedRef.current) return
      if (st === "failed" || st === "closed") {
        cleanup()
        setStatus(hostOnlineRef.current ? "connecting" : "waiting")
        offerTimerRef.current = setTimeout(() => {
          offerTimerRef.current = null
          if (!attemptedRef.current) ensureOffer()
        }, ICE_RESTART_DELAY_MS)
      }
    }

    pc.pc
      .createOffer({ iceRestart: false })
      .then(async (offer) => {
        if (endedRef.current) return
        await pc.pc.setLocalDescription(offer)
        send({ type: "screen_offer", sdp: offer.sdp })
      })
      .catch((err) => {
        console.error("[screen-viewer] offer failed", err)
        cleanup()
      })
  }, [send])

  const connect = useCallback(() => {
    if (endedRef.current) return
    const ws = new WebSocket(screenSignalWsUrl(token))
    wsRef.current = ws

    ws.onopen = () => {
      reconnectAttempts.current = 0
      send({ type: "screen_join", role: "viewer", name: "Guest" })
    }

    ws.onmessage = (ev) => {
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
          setTitle(state.title || "Live Screen Share")
          setHostName(state.hostName || "")
          setParticipants(state.participants || 0)
          hostOnlineRef.current = Boolean(state.hostOnline)
          if (state.ended) {
            markEnded("This screen share has ended.")
            return
          }
          if (hostOnlineRef.current) {
            setStatus((s) => (s === "live" ? s : "connecting"))
            ensureOffer()
          } else {
            setStatus("waiting")
            destroyPeer()
          }
          return
        }
        case "screen_offer":
        case "screen_answer": {
          const peer = peerRef.current
          if (!peer) return
          peer.pc
            .setRemoteDescription(new RTCSessionDescription({ type: data.type === "screen_answer" ? "answer" : "offer", sdp: data.sdp }))
            .then(() => peer.flushPendingIce())
            .catch((err) => console.error("[screen-viewer] setRemote failed", err))
          return
        }
        case "screen_ice": {
          const peer = peerRef.current
          if (peer) void peer.addRemoteIce(data.candidate)
          return
        }
        case "screen_ended": {
          markEnded(data.reason === "host_requested" ? "The host stopped sharing their screen." : "This screen share has ended.")
          return
        }
        case "screen_pong": {
          return
        }
        default:
          return
      }
    }

    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null
      if (endedRef.current) return
      setStatus(hostOnlineRef.current ? "connecting" : "waiting")
      destroyPeer()
      if (reconnectRef.current) return
      const delay = Math.min(1000 * Math.pow(1.6, reconnectAttempts.current), 8000)
      reconnectAttempts.current++
      reconnectRef.current = setTimeout(() => {
        reconnectRef.current = null
        connect()
      }, delay)
    }

    ws.onerror = () => {
      try {
        ws.close()
      } catch {
        /* noop */
      }
    }
  }, [token, send, ensureOffer, destroyPeer, markEnded])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    setErrorMsg(null)

    fetch(screenPublicUrl(token))
      .then((res) => {
        if (cancelled) return
        if (!res.ok) throw new Error("not-found")
        return res.json()
      })
      .then((info: ScreenSessionState | undefined) => {
        if (cancelled || !info) return
        setTitle(info.title || "Live Screen Share")
        setHostName(info.hostName || "")
        if (info.ended) {
          endedRef.current = true
          setStatus("ended")
          setErrorMsg("This screen share has ended.")
          return
        }
        setStatus("connecting")
      })
      .catch(() => {
        if (cancelled) return
        endedRef.current = true
        setStatus("invalid")
      })

    connect()
    const heartbeat = setInterval(() => pingFrame(wsRef.current as WebSocket), 15000)

    return () => {
      cancelled = true
      endedRef.current = true
      clearInterval(heartbeat)
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      try {
        wsRef.current?.close()
      } catch {
        /* noop */
      }
      wsRef.current = null
      destroyPeer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const link = mounted && typeof window !== "undefined" ? window.location.href : ""

  return (
    <div className="relative flex min-h-[70vh] flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex w-full max-w-3xl flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 text-primary">
              <Monitor className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-foreground">{title}</h1>
              <p className="truncate text-xs text-muted-foreground">
                {hostName ? `Shared by ${hostName}` : "Shared via EcliOffice"}
              </p>
            </div>
          </div>
          <StatusBadge status={status} participants={participants} />
        </div>

        <div className="relative overflow-hidden rounded-xl border border-border bg-black shadow-2xl shadow-black/50">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            controls={status === "live"}
            className="aspect-video w-full"
          />
          {status !== "live" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              {status === "loading" && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
              {status === "waiting" && <Play className="h-8 w-8 text-muted-foreground" />}
              <p className="max-w-sm px-6 text-sm text-muted-foreground">{statusLabel(status, errorMsg)}</p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Live screen share via EcliOffice{link ? ` · ${link.replace(/^https?:\/\//, "")}` : ""}
        </p>
      </div>
    </div>
  )
}

function statusLabel(status: ViewerStatus, errorMsg: string | null): string {
  switch (status) {
    case "loading":
      return "Connecting to the broadcast…"
    case "waiting":
      return "Waiting for the host to start streaming…"
    case "connecting":
      return "Connecting to the host…"
    case "ended":
      return errorMsg || "This screen share has ended."
    case "invalid":
      return "This screen share session doesn’t exist or has expired."
    default:
      return ""
  }
}

function StatusBadge({ status, participants }: { status: ViewerStatus; participants: number }) {
  const live = status === "live"
  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
        live
          ? "border-red-500/40 bg-red-500/10 text-red-400"
          : "border-border bg-secondary/60 text-muted-foreground"
      }`}
    >
      {live ? <Wifi className="h-3.5 w-3.5" /> : status === "ended" || status === "invalid" ? <WifiOff className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
      {live ? "LIVE" : status === "waiting" ? "Awaiting host" : status === "connecting" ? "Connecting" : status === "loading" ? "Loading" : status === "ended" ? "Ended" : "Unavailable"}
      {live && participants > 0 ? ` · ${participants}` : ""}
    </span>
  )
}