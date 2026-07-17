"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import {
  Mic, MicOff, Phone, PhoneOff, Video, VideoOff,
  Monitor, MonitorOff, Copy, Check, Eye, EyeOff,
  VolumeX, Volume2, Link2, Settings2, X, Maximize2,
} from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useVoiceMedia, VoicePeer } from "@/hooks/useVoiceMedia"

interface VoicePanelProps {
  roomSlug: string
  roomName?: string
  onLeave: () => void
}

function FullscreenScreenShare({
  peer,
  isLocalPeer,
  localVideoStream,
  onClose,
}: {
  peer: VoicePeer | null
  isLocalPeer: boolean
  localVideoStream: MediaStream | null
  onClose: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  useEffect(() => {
    if (!isLocalPeer || !localVideoStream || !localVideoRef.current) return

    const video = localVideoRef.current
    video.srcObject = localVideoStream
    video.play().catch(() => {
      console.warn("[fullscreen] local video play failed")
    })

    return () => {
      video.srcObject = null
    }
  }, [isLocalPeer, localVideoStream])

  useEffect(() => {
    const container = containerRef.current
    if (isLocalPeer || !container || !peer?.screenVideoEl) return

    const el = peer.screenVideoEl
    const originalParent = el.parentElement
    const originalStyles = {
      width: el.style.width,
      height: el.style.height,
      objectFit: el.style.objectFit,
      display: el.style.display,
    }

    el.style.width = "100%"
    el.style.height = "100%"
    el.style.objectFit = "contain"
    el.style.display = "block"

    if (!container.contains(el)) {
      container.appendChild(el)
    }

    el.play().catch(() => {
      console.warn("[fullscreen] remote video play failed")
    })

    return () => {
      el.style.width = originalStyles.width
      el.style.height = originalStyles.height
      el.style.objectFit = originalStyles.objectFit
      el.style.display = originalStyles.display

      if (container.contains(el)) {
        container.removeChild(el)
      }

      if (originalParent && !originalParent.contains(el)) {
        originalParent.appendChild(el)
      }
    }
  }, [isLocalPeer, peer?.screenVideoEl])

  if (!peer) return null

  const displayName = isLocalPeer ? "Your Screen" : `${peer.peerId.slice(0, 8)}'s Screen`

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Video container */}
      <div
        className="w-full h-full flex items-center justify-center"
        onClick={e => e.stopPropagation()}
      >
        {isLocalPeer ? (
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <div
            ref={containerRef}
            className="w-full h-full flex items-center justify-center"
          />
        )}
      </div>

      {/* Controls overlay */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
        <div className="bg-black/60 backdrop-blur rounded-lg px-3 py-2 text-white pointer-events-auto">
          <div className="flex items-center gap-2 text-sm font-mono">
            <Monitor className="h-4 w-4 text-blue-400" />
            <span>{displayName}</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="bg-black/60 backdrop-blur hover:bg-black/80 rounded-lg p-2 text-white/80 hover:text-white transition-colors pointer-events-auto"
          title="Exit fullscreen (ESC)"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Help text */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
        <div className="bg-black/40 backdrop-blur rounded px-2 py-1 text-white/60 text-xs font-mono">
          Press ESC or click outside to exit
        </div>
      </div>
    </motion.div>
  )
}

function LocalVideoPreview({
  stream,
  bgBlur,
}: {
  stream: MediaStream | null
  bgBlur: boolean
}) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (stream) {
      el.srcObject = stream
      el.play().catch(() => {})
    } else {
      el.srcObject = null
    }
  }, [stream])

  if (!stream) return null

  return (
    <video
      ref={ref}
      autoPlay muted playsInline
      className="w-full h-full object-cover"
      style={bgBlur ? { filter: "blur(12px)", transform: "scale(1.12)" } : undefined}
    />
  )
}

function RemoteVideoTile({ videoEl }: { videoEl: HTMLVideoElement | null }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !videoEl) return

    videoEl.style.width = "100%"
    videoEl.style.height = "100%"
    videoEl.style.objectFit = "cover"
    videoEl.style.display = "block"

    if (!container.contains(videoEl)) {
      container.innerHTML = ""
      container.appendChild(videoEl)
    }

    videoEl.play().catch(() => {
      videoEl.muted = true
      videoEl.play().catch(() => {})
    })

    return () => {
      if (container.contains(videoEl)) {
        videoEl.style.display = "none"
        container.innerHTML = ""
      }
    }
  }, [videoEl])

  return <div ref={containerRef} className="w-full h-full" />
}

function PeerTile({
  peer,
  isLocal,
  localVideoStream,
  bgBlur,
  mediaType = "camera",
  onFullscreen,
}: {
  peer: VoicePeer
  isLocal: boolean
  localVideoStream: MediaStream | null
  bgBlur: boolean
  mediaType?: "camera" | "screen"
  onFullscreen?: () => void
}) {
  const isCamera = mediaType === "camera"
  const showVideo = isCamera ? peer.hasVideo : peer.isScreenSharing
  const videoEl = isCamera ? peer.videoEl : peer.screenVideoEl

  return (
    <div
      className={[
        "relative rounded-xl overflow-hidden bg-zinc-900 border aspect-video group",
        peer.isSpeaking && isCamera
          ? "border-green-500/70 shadow-[0_0_0_2px_rgba(34,197,94,0.35)]"
          : isCamera
          ? "border-white/10"
          : "border-blue-500/40 cursor-pointer hover:border-blue-400/60",
      ].join(" ")}
      onClick={!isCamera && onFullscreen ? onFullscreen : undefined}
    >
      {/* Video content */}
      <div className="w-full h-full">
        {showVideo ? (
          isLocal ? (
            <LocalVideoPreview
              stream={isCamera ? localVideoStream : localVideoStream}
              bgBlur={isCamera ? bgBlur : false}
            />
          ) : (
            <RemoteVideoTile videoEl={videoEl} />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div
              className={[
                "w-14 h-14 rounded-full flex items-center justify-center text-base font-bold select-none",
                isLocal ? "bg-primary/25 text-primary" : "bg-white/10 text-white/60",
              ].join(" ")}
            >
              {(isLocal ? "You" : peer.peerId).slice(0, 2).toUpperCase()}
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen button for screen shares */}
      {!isCamera && showVideo && onFullscreen && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onFullscreen()
          }}
          className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 backdrop-blur rounded-lg p-1.5 text-white/80 hover:text-white transition-all duration-200 opacity-0 group-hover:opacity-100"
          title="View fullscreen"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Overlay */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent">
        <span className="text-[10px] font-mono text-white/80 flex-1 truncate">
          {isLocal ? "You" : peer.peerId.slice(0, 8)}
          {!isCamera && <span className="ml-1.5 text-blue-300">Screen</span>}
        </span>
        <div className="flex items-center gap-0.5">
          {peer.isMuted && <MicOff className="h-2.5 w-2.5 text-red-400" />}
          {peer.isDeafened && <VolumeX className="h-2.5 w-2.5 text-amber-400" />}
          {isCamera ? (
            peer.isScreenSharing && <Monitor className="h-2.5 w-2.5 text-blue-400" />
          ) : (
            <Monitor className="h-2.5 w-2.5 text-blue-400" />
          )}
          {peer.isSpeaking && isCamera && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          )}
        </div>
      </div>
    </div>
  )
}

function CtrlBtn({
  onClick, title, active, activeIcon, inactiveIcon, activeClass, inactiveClass,
}: {
  onClick: () => void; title: string; active: boolean
  activeIcon: React.ReactNode; inactiveIcon: React.ReactNode
  activeClass: string; inactiveClass: string
}) {
  return (
    <button
      onClick={onClick} title={title}
      className={`p-2 rounded-full transition-all duration-150 ${active ? activeClass : inactiveClass}`}
    >
      {active ? activeIcon : inactiveIcon}
    </button>
  )
}

function DeviceSelectors({
  audioInputs, audioOutputs, videoInputs,
  selectedAudioInput, selectedAudioOutput, selectedVideoInput,
  setSelectedAudioInput, setSelectedAudioOutput, setSelectedVideoInput,
  compact = false,
}: {
  audioInputs: MediaDeviceInfo[]; audioOutputs: MediaDeviceInfo[]; videoInputs: MediaDeviceInfo[]
  selectedAudioInput: string; selectedAudioOutput: string; selectedVideoInput: string
  setSelectedAudioInput: (v: string) => void
  setSelectedAudioOutput: (v: string) => void
  setSelectedVideoInput: (v: string) => void
  compact?: boolean
}) {
  const wrapCls = compact ? "flex flex-wrap gap-2" : "space-y-1.5"
  const selCls = `border border-border/40 bg-background rounded px-1.5 py-0.5
    text-[10px] font-mono text-foreground/60 outline-none focus:border-primary/50 flex-1`

  return (
    <div className={wrapCls}>
      {audioInputs.length > 0 && (
        <div className="flex items-center gap-2">
          {!compact && <span className="text-[9px] font-mono text-muted-foreground/50 w-10">Mic</span>}
          <select value={selectedAudioInput} onChange={e => setSelectedAudioInput(e.target.value)} className={selCls}>
            <option value="">{compact ? "🎤 Mic" : "Default"}</option>
            {audioInputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 14)}</option>)}
          </select>
        </div>
      )}
      {audioOutputs.length > 0 && (
        <div className="flex items-center gap-2">
          {!compact && <span className="text-[9px] font-mono text-muted-foreground/50 w-10">Spkr</span>}
          <select value={selectedAudioOutput} onChange={e => setSelectedAudioOutput(e.target.value)} className={selCls}>
            <option value="">{compact ? "🔊 Speaker" : "Default"}</option>
            {audioOutputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 14)}</option>)}
          </select>
        </div>
      )}
      {videoInputs.length > 0 && (
        <div className="flex items-center gap-2">
          {!compact && <span className="text-[9px] font-mono text-muted-foreground/50 w-10">Cam</span>}
          <select value={selectedVideoInput} onChange={e => setSelectedVideoInput(e.target.value)} className={selCls}>
            <option value="">{compact ? "📷 Camera" : "Default"}</option>
            {videoInputs.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 14)}</option>)}
          </select>
        </div>
      )}
    </div>
  )
}

function VolumeControl({
  peerId,
  volume,
  muted,
  onVolumeChange,
  onMuteToggle,
  label,
  icon,
  color = "primary",
}: {
  peerId: string
  volume: number
  muted: boolean
  onVolumeChange: (peerId: string, volume: number) => void
  onMuteToggle: (peerId: string) => void
  label: string
  icon: React.ReactNode
  color?: "primary" | "blue"
}) {
  const accentColor = color === "blue" ? "accent-blue-500" : "accent-primary"
  
  return (
    <div className="flex items-center gap-1.5 ml-4">
      <button
        onClick={() => onMuteToggle(peerId)}
        className={`p-0.5 rounded transition-colors ${
          muted
            ? "text-destructive/70 bg-destructive/10"
            : "text-muted-foreground/40 hover:text-foreground/60"
        }`}
        title={muted ? `Unmute ${label.toLowerCase()}` : `Mute ${label.toLowerCase()}`}
      >
        {muted ? <VolumeX className="h-2.5 w-2.5" /> : icon}
      </button>
      <input
        type="range"
        min="0"
        max="100"
        value={Math.round(volume * 100)}
        onChange={e => onVolumeChange(peerId, Number(e.target.value) / 100)}
        disabled={muted}
        className={`flex-1 h-1 ${accentColor} cursor-pointer disabled:opacity-30`}
      />
      <span className="text-[9px] text-muted-foreground/40 w-12 text-right font-mono">
        {label === "Voice" ? "🎤" : "📺"} {Math.round(volume * 100)}%
      </span>
    </div>
  )
}

export default function VoicePanel({ roomSlug, roomName, onLeave }: VoicePanelProps) {
  const {
    peers, localPeerId, localVideoStream,
    isMuted, isDeafened, hasVideo, isScreenSharing, bgBlur,
    toggleMute, toggleDeafen, toggleVideo, toggleBgBlur,
    startScreenShare, stopScreenShare,
    joinRoom, leaveRoom,
    setPeerVolume, setPeerScreenVolume,
    togglePeerMute, togglePeerScreenMute,
    enumerateDevices,
    audioInputs, audioOutputs, videoInputs,
    selectedAudioInput, selectedAudioOutput, selectedVideoInput,
    setSelectedAudioInput, setSelectedAudioOutput, setSelectedVideoInput,
  } = useVoiceMedia(roomSlug)

  const [joined, setJoined] = useState(false)
  const [joining, setJoining] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [showDevices, setShowDevices] = useState(false)
  const [shareLink, setShareLink] = useState("")
  const [fullscreenPeer, setFullscreenPeer] = useState<VoicePeer | null>(null)

  useEffect(() => {
    setShareLink(`${window.location.origin}/dashboard/chat?voice=${roomSlug}`)
  }, [roomSlug])

  useEffect(() => {
    enumerateDevices()
    navigator.mediaDevices?.addEventListener?.("devicechange", enumerateDevices)
    return () => { navigator.mediaDevices?.removeEventListener?.("devicechange", enumerateDevices) }
  }, [enumerateDevices])

  const handleJoin = async (video = false) => {
    setJoining(true)
    try {
      await joinRoom(video)
      setJoined(true)
    } finally {
      setJoining(false)
    }
  }

  const handleLeave = () => {
    leaveRoom()
    setJoined(false)
    setShowGrid(false)
    setFullscreenPeer(null)
    onLeave()
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const handleFullscreen = useCallback((peer: VoicePeer) => {
    setFullscreenPeer(peer)
  }, [])

  const closeFullscreen = useCallback(() => {
    setFullscreenPeer(null)
  }, [])

  const localPeer: VoicePeer = {
    peerId: localPeerId ?? "__local__",
    isMuted, isDeafened, hasVideo, isScreenSharing,
    isSpeaking: false,
    videoEl: null,
    screenVideoEl: null,
    volume: 1,
    screenVolume: 1,
    locallyMuted: false,
    screenMuted: false,
  }
  const allPeers = localPeerId ? [localPeer, ...peers] : peers
  const totalCount = allPeers.length

  const cameraPeers = allPeers.filter(p => p.hasVideo)
  const screenPeers = allPeers.filter(p => p.isScreenSharing)
  const allVideoPeers = [...cameraPeers, ...screenPeers]

  if (!joined) {
    return (
      <div className="border border-border/40 bg-card rounded-lg p-4 mb-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary/60" />
            <span className="text-sm font-semibold text-foreground/70 font-mono">
              {roomName ? `Voice: ${roomName}` : "Voice Room"}
            </span>
          </div>
          <button onClick={onLeave} className="text-muted-foreground/40 hover:text-foreground/60 text-xs font-mono">
            [×]
          </button>
        </div>

        {/* Share link */}
        <div className="flex items-center gap-2">
          <code className="text-[11px] bg-muted/50 px-2 py-1 rounded font-mono text-foreground/50 truncate flex-1">
            {shareLink}
          </code>
          <button onClick={copyLink} className="p-1.5 text-muted-foreground/40 hover:text-foreground/60 hover:bg-muted rounded transition-colors">
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Device settings */}
        {(audioInputs.length > 0 || videoInputs.length > 0) && (
          <div className="border border-border/30 rounded p-2 space-y-2">
            <button
              onClick={() => setShowDevices(p => !p)}
              className="text-[10px] font-mono text-muted-foreground/50 hover:text-foreground/60 transition-colors"
            >
              {showDevices ? "[-] Hide devices" : "[+] Device settings"}
            </button>
            {showDevices && (
              <DeviceSelectors
                audioInputs={audioInputs}
                audioOutputs={audioOutputs}
                videoInputs={videoInputs}
                selectedAudioInput={selectedAudioInput}
                selectedAudioOutput={selectedAudioOutput}
                selectedVideoInput={selectedVideoInput}
                setSelectedAudioInput={setSelectedAudioInput}
                setSelectedAudioOutput={setSelectedAudioOutput}
                setSelectedVideoInput={setSelectedVideoInput}
              />
            )}
          </div>
        )}

        {/* Join buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => handleJoin(false)}
            disabled={joining}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 px-3 py-1.5 text-xs font-mono font-semibold rounded transition-colors"
          >
            <Phone className="h-3.5 w-3.5" />
            {joining ? "Joining…" : "Join Voice"}
          </button>
          <button
            onClick={() => handleJoin(true)}
            disabled={joining}
            className="flex items-center gap-1.5 border border-border/40 hover:bg-muted disabled:opacity-40 px-3 py-1.5 text-xs font-mono rounded transition-colors text-foreground/60"
          >
            <Video className="h-3.5 w-3.5" />
            Voice & Video
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="border border-border/40 bg-card rounded-lg mb-4 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-semibold text-foreground/70 font-mono">
              {roomName || "Voice Room"}
            </span>
            <span className="text-[10px] text-muted-foreground/40 font-mono">
              {totalCount} {totalCount === 1 ? "person" : "people"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={copyLink} title="Copy invite link"
              className="p-1 text-muted-foreground/40 hover:text-foreground/60 hover:bg-muted rounded transition-colors">
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Link2 className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => setShowDevices(p => !p)}
              title="Device settings"
              className={`p-1 rounded transition-colors ${showDevices
                ? "text-primary/70 bg-primary/10"
                : "text-muted-foreground/40 hover:text-foreground/60 hover:bg-muted"
              }`}
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
            {allVideoPeers.length > 0 && (
              <button
                onClick={() => setShowGrid(p => !p)}
                title={showGrid ? "Hide video" : "Show video"}
                className="p-1 text-muted-foreground/40 hover:text-foreground/60 hover:bg-muted rounded transition-colors"
              >
                {showGrid ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </div>

        {/* Video grid */}
        <AnimatePresence>
          {showGrid && allVideoPeers.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div
                className="p-2 grid gap-2"
                style={{ gridTemplateColumns: `repeat(${Math.min(allVideoPeers.length, 3)}, 1fr)` }}
              >
                {/* Camera videos */}
                {cameraPeers.map(p => (
                  <PeerTile
                    key={`cam-${p.peerId}`}
                    peer={p}
                    isLocal={p.peerId === localPeerId}
                    localVideoStream={localVideoStream}
                    bgBlur={bgBlur}
                    mediaType="camera"
                  />
                ))}
                {/* Screen shares */}
                {screenPeers.map(p => (
                  <PeerTile
                    key={`screen-${p.peerId}`}
                    peer={p}
                    isLocal={p.peerId === localPeerId}
                    localVideoStream={localVideoStream}
                    bgBlur={false}
                    mediaType="screen"
                    onFullscreen={() => handleFullscreen(p)}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Participant list */}
        <div className="px-3 py-2 max-h-56 overflow-y-auto space-y-2">
          {allPeers.map(p => {
            const isLocal = p.peerId === localPeerId
            return (
              <div key={p.peerId} className="space-y-1">
                {/* Peer info row */}
                <div className={`flex items-center gap-2 text-xs font-mono ${
                  p.isSpeaking ? "text-green-400" : "text-foreground/50"
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                    p.isSpeaking ? "bg-green-500" : p.isMuted ? "bg-destructive/60" : "bg-green-500/30"
                  }`} />
                  <span className="flex-1 truncate">
                    {isLocal ? "You" : p.peerId.slice(0, 8)}
                  </span>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {p.isMuted && <MicOff className="h-3 w-3 text-destructive/60" />}
                    {p.isDeafened && <VolumeX className="h-3 w-3 text-amber-400/60" />}
                    {p.hasVideo && <Video className="h-3 w-3 text-primary/60" />}
                    {p.isScreenSharing && (
                      <button
                        onClick={() => handleFullscreen(p)}
                        className="hover:bg-blue-500/20 rounded p-0.5 -m-0.5 transition-colors"
                        title="View fullscreen"
                      >
                        <Monitor className="h-3 w-3 text-blue-500/80 hover:text-blue-400" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Volume controls for remote peers */}
                {!isLocal && (
                  <div className="space-y-1">
                    {/* Voice volume */}
                    <VolumeControl
                      peerId={p.peerId}
                      volume={p.volume}
                      muted={p.locallyMuted}
                      onVolumeChange={setPeerVolume}
                      onMuteToggle={togglePeerMute}
                      label="Voice"
                      icon={<Volume2 className="h-2.5 w-2.5" />}
                      color="primary"
                    />

                    {p.isScreenSharing && (
                      <VolumeControl
                        peerId={p.peerId}
                        volume={p.screenVolume}
                        muted={p.screenMuted}
                        onVolumeChange={setPeerScreenVolume}
                        onMuteToggle={togglePeerScreenMute}
                        label="Screen"
                        icon={<Monitor className="h-2.5 w-2.5" />}
                        color="blue"
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <AnimatePresence>
          {showDevices && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-border/40"
            >
              <div className="px-3 py-2 bg-muted/10">
                <DeviceSelectors
                  audioInputs={audioInputs}
                  audioOutputs={audioOutputs}
                  videoInputs={videoInputs}
                  selectedAudioInput={selectedAudioInput}
                  selectedAudioOutput={selectedAudioOutput}
                  selectedVideoInput={selectedVideoInput}
                  setSelectedAudioInput={setSelectedAudioInput}
                  setSelectedAudioOutput={setSelectedAudioOutput}
                  setSelectedVideoInput={setSelectedVideoInput}
                  compact
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls */}
        <div className="flex items-center justify-center gap-1.5 px-3 py-2.5 border-t border-border/40 bg-muted/20">
          <CtrlBtn
            onClick={toggleMute}
            active={!isMuted}
            title={isMuted ? "Unmute" : "Mute"}
            activeIcon={<Mic className="h-4 w-4" />}
            inactiveIcon={<MicOff className="h-4 w-4" />}
            activeClass="bg-muted hover:bg-muted/70 text-foreground/70"
            inactiveClass="bg-destructive/20 text-destructive hover:bg-destructive/30"
          />
          
          <CtrlBtn
            onClick={toggleDeafen}
            active={!isDeafened}
            title={isDeafened ? "Undeafen" : "Deafen"}
            activeIcon={<Volume2 className="h-4 w-4" />}
            inactiveIcon={<VolumeX className="h-4 w-4" />}
            activeClass="bg-muted hover:bg-muted/70 text-foreground/70"
            inactiveClass="bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
          />

          <CtrlBtn
            onClick={toggleVideo}
            active={hasVideo}
            title={hasVideo ? "Turn off camera" : "Turn on camera"}
            activeIcon={<Video className="h-4 w-4" />}
            inactiveIcon={<VideoOff className="h-4 w-4" />}
            activeClass="bg-muted hover:bg-muted/70 text-foreground/70"
            inactiveClass="bg-muted hover:bg-muted/70 text-muted-foreground/50"
          />

          <CtrlBtn
            onClick={toggleBgBlur}
            active={bgBlur}
            title={bgBlur ? "Remove blur" : "Blur background"}
            activeIcon={<EyeOff className="h-4 w-4" />}
            inactiveIcon={<Eye className="h-4 w-4" />}
            activeClass="bg-primary/20 text-primary hover:bg-primary/30"
            inactiveClass="bg-muted hover:bg-muted/70 text-muted-foreground/50"
          />

          <CtrlBtn
            onClick={isScreenSharing ? stopScreenShare : startScreenShare}
            active={isScreenSharing}
            title={isScreenSharing ? "Stop sharing" : "Share screen"}
            activeIcon={<Monitor className="h-4 w-4" />}
            inactiveIcon={<MonitorOff className="h-4 w-4" />}
            activeClass="bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
            inactiveClass="bg-muted hover:bg-muted/70 text-muted-foreground/50"
          />

          <div className="w-px h-6 bg-border/40 mx-1" />

          <button
            onClick={handleLeave}
            className="p-2 bg-destructive/80 hover:bg-destructive text-white rounded-full transition-colors"
            title="Leave"
          >
            <PhoneOff className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Fullscreen screenshare viewer */}
      <AnimatePresence>
        {fullscreenPeer && (
          <FullscreenScreenShare
            peer={fullscreenPeer}
            isLocalPeer={fullscreenPeer.peerId === localPeerId}
            localVideoStream={localVideoStream}
            onClose={closeFullscreen}
          />
        )}
      </AnimatePresence>
    </>
  )
}