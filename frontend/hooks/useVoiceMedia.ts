"use client"

import { useRef, useState, useCallback, useEffect } from "react"

export interface VoicePeer {
  peerId: string
  isMuted: boolean
  isDeafened: boolean
  hasVideo: boolean
  isScreenSharing: boolean
  isSpeaking: boolean
  videoEl: HTMLVideoElement | null
  screenVideoEl: HTMLVideoElement | null
  volume: number
  screenVolume: number
  locallyMuted: boolean
  screenMuted: boolean
}

const AUDIO_SAMPLE_RATE = 48000
const PROCESSOR_BUFFER = 1024
const CHUNK_SIZE = 4800 
const SPEAKING_THRESHOLD = 0.012
const SPEAKING_HOLD_MS = 800
const RECONNECT_DELAY_MS = 10

function f32ToBase64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength)
  let bin = ""
  const CHUNK = 8192
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

function base64ToF32(b64: string): Float32Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Float32Array(bytes.buffer)
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as ArrayBuffer
      const bytes = new Uint8Array(result)
      let bin = ""
      const CHUNK = 8192
      for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
      }
      resolve(btoa(bin))
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(blob)
  })
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

const WEBM_MAGIC = [0x1A, 0x45, 0xDF, 0xA3]
function isWebMInitSegment(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 4) return false
  const v = new Uint8Array(buf)
  return WEBM_MAGIC.every((b, i) => v[i] === b)
}

function getBestVideoMime(): string {
  const candidates = [
    "video/webm;codecs=vp8",
    "video/webm;codecs=vp9",
    "video/webm",
  ]
  return candidates.find(c => MediaRecorder.isTypeSupported(c)) ?? "video/webm"
}

function getBestSourceBufferMime(): string {
  const candidates = [
    "video/webm;codecs=vp8",
    "video/webm;codecs=vp9",
    "video/webm",
  ]
  return candidates.find(c => {
    try { return MediaSource.isTypeSupported(c) } catch { return false }
  }) ?? "video/webm"
}

class RemoteVideoPlayer {
  el: HTMLVideoElement
  private ms: MediaSource
  private sb: SourceBuffer | null = null
  private queue: ArrayBuffer[] = []
  private ready = false
  private destroyed = false
  private objectUrl: string

  constructor(
    private peerId: string,
    private kind: "camera" | "screen",
  ) {
    this.el = document.createElement("video")
    this.el.autoplay = true
    this.el.playsInline = true
    this.el.muted = true
    this.el.style.display = "none"
    document.body.appendChild(this.el)

    this.ms = new MediaSource()
    this.objectUrl = URL.createObjectURL(this.ms)
    this.el.src = this.objectUrl

    this.ms.addEventListener("sourceopen", this.onSourceOpen, { once: true })
  }

  private onSourceOpen = () => {
    if (this.destroyed) return
    const mime = getBestSourceBufferMime()
    try {
      this.sb = this.ms.addSourceBuffer(mime)
      this.sb.mode = "sequence"
      this.sb.addEventListener("updateend", this.flush)
      this.ready = true
      this.flush()
      console.log(`[video:${this.peerId}:${this.kind}] player ready, mime=${mime}`)
    } catch (e) {
      console.error(`[video:${this.peerId}:${this.kind}] addSourceBuffer failed:`, e)
    }
  }

  private flush = () => {
    if (!this.sb || this.sb.updating || this.queue.length === 0) return
    const chunk = this.queue.shift()!
    try {
      this.sb.appendBuffer(chunk)
    } catch (e: any) {
      if (e.name === "QuotaExceededError") {
        this.evict()
        this.queue.unshift(chunk)
      } else {
        console.warn(`[video:${this.peerId}:${this.kind}] appendBuffer:`, e.message)
        this.queue.unshift(chunk)
        try { this.sb.abort() } catch {}
      }
    }
  }

  private evict() {
    if (!this.sb || !this.el) return
    const buffered = this.sb.buffered
    if (buffered.length > 0) {
      const start = buffered.start(0)
      const end = Math.max(start, this.el.currentTime - 2)
      if (end > start) {
        try { this.sb.remove(start, end) } catch { }
      }
    }
  }

  append(buf: ArrayBuffer, isInit: boolean) {
    if (this.destroyed) return

    if (isInit) {
      console.log(`[video:${this.peerId}:${this.kind}] reset (new init segment)`)
      this.queue = [buf]
      if (this.sb && !this.sb.updating) {
        try {
          const buffered = this.sb.buffered
          if (buffered.length > 0) {
            this.sb.addEventListener("updateend", () => {
              this.queue = [buf]
              this.flush()
            }, { once: true })
            this.sb.remove(buffered.start(0), buffered.end(buffered.length - 1) + 0.01)
            return
          }
        } catch { }
      }
    } else {
      this.queue.push(buf)
    }

    if (this.ready) this.flush()
  }

  async tryPlay() {
    try {
      await this.el.play()
    } catch { /* yes yes */ }
  }

  destroy() {
    this.destroyed = true
    this.queue = []
    try { this.ms.endOfStream() } catch { }
    this.el.srcObject = null
    this.el.src = ""
    URL.revokeObjectURL(this.objectUrl)
    this.el.remove()
  }
}

class RemoteAudioPlayer {
  private ac: AudioContext
  private gainNode: GainNode
  private nextPlayTime = 0
  private speakingTimeout: ReturnType<typeof setTimeout> | null = null
  private audioBuffer: Float32Array[] = []
  private maxBuffer = 12
  private schedulerTimer: ReturnType<typeof setInterval> | null = null
  private started = false
  onSpeaking?: (speaking: boolean) => void

  constructor(
    private peerId: string,
    private volume: number,
    private locallyMuted: boolean,
    private kind: "mic" | "screen",
    private initialDelay: number = 0.15, 
  ) {
    this.ac = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE })
    this.gainNode = this.ac.createGain()
    this.gainNode.gain.value = locallyMuted ? 0 : volume
    this.gainNode.connect(this.ac.destination)
  }

  push(_seq: number, samples: Float32Array) {
    if (this.locallyMuted) return
    if (this.ac.state === "suspended") this.ac.resume().catch(() => {})

    const wasEmpty = this.audioBuffer.length === 0
    this.audioBuffer.push(samples)
    while (this.audioBuffer.length > this.maxBuffer) this.audioBuffer.shift()

    if (wasEmpty && this.started) {
      const now = this.ac.currentTime
      if (this.nextPlayTime < now) {
        this.nextPlayTime = now + 0.01
      }
    }

    if (!this.started) {
      this.started = true
      this.nextPlayTime = this.ac.currentTime + this.initialDelay
      this.schedulerTimer = setInterval(() => this.tick(), 20)
    }

    if (this.kind === "mic") {
      let sumSq = 0
      for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i]
      const rms = Math.sqrt(sumSq / samples.length)
      if (rms > SPEAKING_THRESHOLD) {
        this.onSpeaking?.(true)
        if (this.speakingTimeout) clearTimeout(this.speakingTimeout)
        this.speakingTimeout = setTimeout(() => this.onSpeaking?.(false), SPEAKING_HOLD_MS)
      }
    }
  }

  scheduleAt(_seq: number, targetAcTime: number, samples: Float32Array) {
    if (this.locallyMuted) return
    if (this.ac.state === "suspended") this.ac.resume().catch(() => {})

    const buf = this.ac.createBuffer(1, samples.length, AUDIO_SAMPLE_RATE)
    buf.getChannelData(0).set(samples)
    const source = this.ac.createBufferSource()
    source.buffer = buf
    source.connect(this.gainNode)
    source.start(Math.max(this.ac.currentTime, targetAcTime))
  }

  private tick() {
    const now = this.ac.currentTime
    if (this.nextPlayTime < now - 0.15) {
      this.nextPlayTime = now + 0.02
    }
    while (this.audioBuffer.length > 0) {
      const samples = this.audioBuffer.shift()!
      const buf = this.ac.createBuffer(1, samples.length, AUDIO_SAMPLE_RATE)
      buf.getChannelData(0).set(samples)
      const source = this.ac.createBufferSource()
      source.buffer = buf
      source.connect(this.gainNode)
      source.start(this.nextPlayTime)
      this.nextPlayTime += samples.length / AUDIO_SAMPLE_RATE
    }
  }

  private lastScheduledEnd = 0

  getAcTime(): number { return this.ac.currentTime }

  setVolume(v: number) {
    this.volume = v
    this.gainNode.gain.setTargetAtTime(this.locallyMuted ? 0 : v, this.ac.currentTime, 0.01)
  }

  setMuted(m: boolean) {
    this.locallyMuted = m
    this.gainNode.gain.setTargetAtTime(m ? 0 : this.volume, this.ac.currentTime, 0.01)
  }

  destroy() {
    if (this.schedulerTimer) { clearInterval(this.schedulerTimer); this.schedulerTimer = null }
    if (this.speakingTimeout) clearTimeout(this.speakingTimeout)
    this.audioBuffer = []
    this.ac.close()
  }
}

export function useVoiceMedia(roomSlug: string | null) {
  const [peers, setPeers] = useState<VoicePeer[]>([])
  const [localPeerId, setLocalPeerId] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isDeafened, setIsDeafened] = useState(false)
  const [hasVideo, setHasVideo] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [bgBlur, setBgBlur] = useState(false)
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([])
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([])
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([])
  const [selectedAudioInput, setSelectedAudioInput] = useState("")
  const [selectedAudioOutput, setSelectedAudioOutput] = useState("")
  const [selectedVideoInput, setSelectedVideoInput] = useState("")
  const wsRef = useRef<WebSocket | null>(null)
  const localPeerIdRef = useRef<string | null>(null)
  const roomSlugRef = useRef(roomSlug)
  const isMutedRef = useRef(false)
  const isDeafenedRef = useRef(false)
  const hasVideoRef = useRef(false)
  const isScreenSharingRef = useRef(false)
  const micStreamRef = useRef<MediaStream | null>(null)
  const camStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const screenProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const screenAudioSrcRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const camRecorderRef = useRef<MediaRecorder | null>(null)
  const screenRecorderRef = useRef<MediaRecorder | null>(null)
  const micAudioPlayersRef = useRef<Map<string, RemoteAudioPlayer>>(new Map())
  const screenAudioPlayersRef = useRef<Map<string, RemoteAudioPlayer>>(new Map())
  const camVideoPlayersRef = useRef<Map<string, RemoteVideoPlayer>>(new Map())
  const screenVideoPlayersRef = useRef<Map<string, RemoteVideoPlayer>>(new Map())
  const peerVolumesRef = useRef<Map<string, number>>(new Map())
  const peerScreenVolumesRef = useRef<Map<string, number>>(new Map())
  const peerMutesRef = useRef<Map<string, boolean>>(new Map())
  const peerScreenMutesRef = useRef<Map<string, boolean>>(new Map())
  const micSeqRef = useRef(0)
  const screenSeqRef = useRef(0)
  const screenSyncRef = useRef<Map<string, { videoStartWallTime: number; videoEl: HTMLVideoElement; videoStartSeq: number }>>(new Map())

  useEffect(() => { roomSlugRef.current = roomSlug }, [roomSlug])
  useEffect(() => { isMutedRef.current = isMuted }, [isMuted])
  useEffect(() => { isDeafenedRef.current = isDeafened }, [isDeafened])
  useEffect(() => { hasVideoRef.current = hasVideo }, [hasVideo])
  useEffect(() => { isScreenSharingRef.current = isScreenSharing }, [isScreenSharing])

  const enumerateDevices = useCallback(async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices()
      setAudioInputs(devs.filter(d => d.kind === "audioinput"))
      setAudioOutputs(devs.filter(d => d.kind === "audiooutput"))
      setVideoInputs(devs.filter(d => d.kind === "videoinput"))
    } catch { }
  }, [])

  const wsSend = useCallback((msg: object) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }, [])

  const startMicCapture = useCallback(() => {
    const micStream = micStreamRef.current
    if (!micStream) return

    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE })
    }
    const ac = audioCtxRef.current

    if (micProcessorRef.current) {
      try { micProcessorRef.current.disconnect() } catch { }
      micProcessorRef.current = null
    }
    if (micSourceRef.current) {
      try { micSourceRef.current.disconnect() } catch { }
      micSourceRef.current = null
    }

    const micSrc = ac.createMediaStreamSource(micStream)
    micSourceRef.current = micSrc

    const processor = ac.createScriptProcessor(PROCESSOR_BUFFER, 1, 1)
    micProcessorRef.current = processor

    const silentGain = ac.createGain()
    silentGain.gain.value = 0
    micSrc.connect(processor)
    processor.connect(silentGain)
    silentGain.connect(ac.destination)

    let overflow = new Float32Array(0)

    processor.onaudioprocess = (e) => {
      if (isMutedRef.current) return
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

      const input = e.inputBuffer.getChannelData(0)

      let combined: Float32Array
      if (overflow.length > 0) {
        combined = new Float32Array(overflow.length + input.length)
        combined.set(overflow)
        combined.set(input, overflow.length)
        overflow = new Float32Array(0)
      } else {
        combined = new Float32Array(input)
      }

      let offset = 0
      while (offset + CHUNK_SIZE <= combined.length) {
        const chunk = combined.slice(offset, offset + CHUNK_SIZE)
        offset += CHUNK_SIZE
        try {
          wsRef.current!.send(JSON.stringify({
            type: "voice_media",
            roomSlug: roomSlugRef.current,
            kind: "mic_audio",
            chunk: f32ToBase64(chunk),
            seq: micSeqRef.current++,
            senderTime: Date.now(),
          }))
        } catch { }
      }

      overflow = combined.slice(offset)

      if (overflow.length > AUDIO_SAMPLE_RATE) {
        console.warn("[voice] mic overflow too large, resetting")
        overflow = new Float32Array(0)
      }
    }
  }, [])

  const startScreenAudioCapture = useCallback(() => {
    const screenStream = screenStreamRef.current
    if (!screenStream) return

    const audioTracks = screenStream.getAudioTracks()
    if (audioTracks.length === 0) {
      console.log("[voice] no screen audio tracks")
      return
    }

    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE })
    }
    const ac = audioCtxRef.current

    if (screenProcessorRef.current) {
      try { screenProcessorRef.current.disconnect() } catch { }
      screenProcessorRef.current = null
    }
    if (screenAudioSrcRef.current) {
      try { screenAudioSrcRef.current.disconnect() } catch { }
      screenAudioSrcRef.current = null
    }

    const screenAudioStream = new MediaStream(audioTracks)
    const screenSrc = ac.createMediaStreamSource(screenAudioStream)
    screenAudioSrcRef.current = screenSrc

    const processor = ac.createScriptProcessor(PROCESSOR_BUFFER, 1, 1)
    screenProcessorRef.current = processor

    const silentGain = ac.createGain()
    silentGain.gain.value = 0
    screenSrc.connect(processor)
    processor.connect(silentGain)
    silentGain.connect(ac.destination)

    let overflow = new Float32Array(0)

    processor.onaudioprocess = (e) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

      const input = e.inputBuffer.getChannelData(0)
      let combined: Float32Array
      if (overflow.length > 0) {
        combined = new Float32Array(overflow.length + input.length)
        combined.set(overflow)
        combined.set(input, overflow.length)
        overflow = new Float32Array(0)
      } else {
        combined = new Float32Array(input)
      }

      let offset = 0
      while (offset + CHUNK_SIZE <= combined.length) {
        const chunk = combined.slice(offset, offset + CHUNK_SIZE)
        offset += CHUNK_SIZE
        try {
          wsRef.current!.send(JSON.stringify({
            type: "voice_media",
            roomSlug: roomSlugRef.current,
            kind: "screen_audio",
            chunk: f32ToBase64(chunk),
            seq: screenSeqRef.current++,
            senderTime: Date.now(),
          }))
        } catch { }
      }

      overflow = combined.slice(offset)
      if (overflow.length > AUDIO_SAMPLE_RATE) overflow = new Float32Array(0)
    }

    console.log("[voice] screen audio capture started")
  }, [])

  const startCamRecorder = useCallback(() => {
    if (camRecorderRef.current?.state === "recording") {
      camRecorderRef.current.stop()
      camRecorderRef.current = null
    }

    const camStream = camStreamRef.current
    if (!camStream || !hasVideoRef.current) return

    const videoTracks = camStream.getVideoTracks().filter(t => t.enabled)
    if (videoTracks.length === 0) return

    const mime = getBestVideoMime()
    const stream = new MediaStream(videoTracks)

    try {
      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 800_000,
      })

      recorder.ondataavailable = async (e) => {
        if (e.data.size === 0) return
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        try {
          const chunk = await blobToBase64(e.data)
          wsRef.current.send(JSON.stringify({
            type: "voice_media",
            roomSlug: roomSlugRef.current,
            kind: "camera_video",
            chunk,
          }))
        } catch { }
      }

      recorder.start(150)
      camRecorderRef.current = recorder
      console.log("[voice] camera recorder started:", mime)
    } catch (e) {
      console.error("[voice] camera recorder failed:", e)
    }
  }, [])

  const startScreenRecorder = useCallback(() => {
    if (screenRecorderRef.current?.state === "recording") {
      screenRecorderRef.current.stop()
      screenRecorderRef.current = null
    }

    const screenStream = screenStreamRef.current
    if (!screenStream) return

    const videoTracks = screenStream.getVideoTracks()
    if (videoTracks.length === 0) return

    const mime = getBestVideoMime()
    const stream = new MediaStream(videoTracks)
    console.log("[voice] screen recorder mime:", mime)

    try {
      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 1_500_000,
      })

      recorder.ondataavailable = async (e) => {
        if (e.data.size === 0) return
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        try {
          const chunk = await blobToBase64(e.data)
          const seq = screenSeqRef.current++
          wsRef.current.send(JSON.stringify({
            type: "voice_media",
            roomSlug: roomSlugRef.current,
            kind: "screen_video",
            chunk,
            seq,
            senderTime: Date.now(),
          }))
        } catch { }
      }

      recorder.start(150)
      screenRecorderRef.current = recorder
      console.log("[voice] screen recorder started:", mime)
    } catch (e) {
      console.error("[voice] screen recorder failed:", e)
    }
  }, [])

  const handleRemoteAudio = useCallback((peerId: string, kind: string, chunk: string, senderTime?: number, seq?: number) => {
    if (isDeafenedRef.current) return

    const isMicAudio = kind === "mic_audio"
    const playersMap = isMicAudio ? micAudioPlayersRef.current : screenAudioPlayersRef.current
    const volumesMap = isMicAudio ? peerVolumesRef.current : peerScreenVolumesRef.current
    const mutesMap = isMicAudio ? peerMutesRef.current : peerScreenMutesRef.current

    let player = playersMap.get(peerId)
    if (!player) {
      player = new RemoteAudioPlayer(
        peerId,
        volumesMap.get(peerId) ?? 1,
        mutesMap.get(peerId) ?? false,
        isMicAudio ? "mic" : "screen",
        isMicAudio ? 0.15 : 0.25,
      )
      if (isMicAudio) {
        player.onSpeaking = (speaking) => {
          setPeers(prev => prev.map(p => p.peerId === peerId ? { ...p, isSpeaking: speaking } : p))
        }
      }
      playersMap.set(peerId, player)
    }

    const samples = base64ToF32(chunk)

    if (!isMicAudio) {
      const sync = screenSyncRef.current.get(peerId) as any
      if (sync && !sync._latencyMeasured) {
        const elapsed = (Date.now() - sync._receiverStartMs) / 1000
        sync._measuredLatency = Math.max(0.15, elapsed)
        sync._latencyMeasured = true
        console.log(`[voice] screen audio latency measured: ${(sync._measuredLatency * 1000).toFixed(0)}ms`)
      }
      const delay = sync?._measuredLatency ?? 0.35
      const startTime = Math.max(player.getAcTime() + delay, player.lastScheduledEnd)
      player.lastScheduledEnd = startTime + (samples.length / AUDIO_SAMPLE_RATE)
      player.scheduleAt(seq ?? 0, startTime, samples)
      return
    }

    player.push(seq ?? 0, samples)
  }, [])

  const handleRemoteVideo = useCallback((peerId: string, kind: string, chunk: string, senderTime?: number, seq?: number) => {
    const buf = base64ToArrayBuffer(chunk)
    const isInit = isWebMInitSegment(buf)

    const isCameraVideo = kind === "camera_video"
    const playersMap = isCameraVideo ? camVideoPlayersRef.current : screenVideoPlayersRef.current

    let player = playersMap.get(peerId)

    if (isInit && player) {
      console.log(`[voice] reinit ${kind} for ${peerId}`)
      player.destroy()
      playersMap.delete(peerId)
      player = undefined
    }

    if (!player) {
      player = new RemoteVideoPlayer(peerId, isCameraVideo ? "camera" : "screen")
      playersMap.set(peerId, player)
      player.tryPlay()

      if (!isCameraVideo && isInit && seq !== undefined && senderTime) {
        const syncEntry = {
          videoStartWallTime: senderTime,
          videoEl: player.el,
          videoStartSeq: seq,
          _receiverStartMs: Date.now(),
          _latencyMeasured: false,
          _measuredLatency: 0.35,
        }
        screenSyncRef.current.set(peerId, syncEntry as any)

        const onFullscreenChange = () => {
          syncEntry._latencyMeasured = false
          syncEntry._receiverStartMs = Date.now()
          console.log(`[voice] screen sync reset for ${peerId} (fullscreen change)`)
        }
        player.el.addEventListener("fullscreenchange", onFullscreenChange)
        player.el.addEventListener("enterpictureinpicture", onFullscreenChange)
        player.el.addEventListener("leavepictureinpicture", onFullscreenChange)
        document.addEventListener("fullscreenchange", onFullscreenChange)
        console.log(`[voice] screen sync set for ${peerId}`)
      }

      const el = player.el
      setPeers(prev => prev.map(p => {
        if (p.peerId === peerId) {
          return {
            ...p,
            [isCameraVideo ? "videoEl" : "screenVideoEl"]: el,
          }
        }
        return p
      }))
    }

    player.append(buf, isInit)
  }, [])

  function cleanupPeer(peerId: string) {
    micAudioPlayersRef.current.get(peerId)?.destroy()
    micAudioPlayersRef.current.delete(peerId)
    screenAudioPlayersRef.current.get(peerId)?.destroy()
    screenAudioPlayersRef.current.delete(peerId)
    camVideoPlayersRef.current.get(peerId)?.destroy()
    camVideoPlayersRef.current.delete(peerId)
    screenVideoPlayersRef.current.get(peerId)?.destroy()
    screenVideoPlayersRef.current.delete(peerId)
    screenSyncRef.current.delete(peerId)
  }

  function cleanupAllPeers() {
    for (const [id] of micAudioPlayersRef.current) cleanupPeer(id)
  }

  function stopAllCapture() {
    if (micProcessorRef.current) {
      try { micProcessorRef.current.disconnect() } catch { }
      micProcessorRef.current = null
    }
    if (screenProcessorRef.current) {
      try { screenProcessorRef.current.disconnect() } catch { }
      screenProcessorRef.current = null
    }
    if (micSourceRef.current) {
      try { micSourceRef.current.disconnect() } catch { }
      micSourceRef.current = null
    }
    if (screenAudioSrcRef.current) {
      try { screenAudioSrcRef.current.disconnect() } catch { }
      screenAudioSrcRef.current = null
    }
    if (camRecorderRef.current?.state === "recording") {
      camRecorderRef.current.stop()
      camRecorderRef.current = null
    }
    if (screenRecorderRef.current?.state === "recording") {
      screenRecorderRef.current.stop()
      screenRecorderRef.current = null
    }
    screenSeqRef.current = 0
  }

  const acquireMicStream = useCallback(async () => {
    if (micStreamRef.current) return micStreamRef.current
    const constraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: AUDIO_SAMPLE_RATE,
      sampleSize: 16,
      channelCount: 1,
      latency: 0.02,
      volume: 1.0,
      googEchoCancellation: true,
      googNoiseSuppression: true,
      googAutoGainControl: true,
      googHighpassFilter: true,
      googExperimentalEchoCancellation: true,
    } as any

    if (selectedAudioInput) constraints.deviceId = { exact: selectedAudioInput }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: constraints,
      video: false
    })
    micStreamRef.current = stream
    await enumerateDevices()
    return stream
  }, [selectedAudioInput, enumerateDevices])


  const toggleMute = useCallback(() => {
    const mic = micStreamRef.current
    if (!mic) return
    const mute = !isMutedRef.current
    mic.getAudioTracks().forEach(t => { t.enabled = !mute })
    isMutedRef.current = mute
    setIsMuted(mute)
    wsSend({ type: mute ? "voice_mute" : "voice_unmute", roomSlug: roomSlugRef.current })
  }, [wsSend])

  const toggleDeafen = useCallback(() => {
    const d = !isDeafenedRef.current
    isDeafenedRef.current = d
    setIsDeafened(d)
    for (const [, p] of micAudioPlayersRef.current) {
      p.setMuted(d || (peerMutesRef.current.get(p["peerId" as any] as any) ?? false))
    }
    for (const [, p] of screenAudioPlayersRef.current) {
      p.setMuted(d || (peerScreenMutesRef.current.get(p["peerId" as any] as any) ?? false))
    }
    wsSend({ type: d ? "voice_deafen" : "voice_undeafen", roomSlug: roomSlugRef.current })
  }, [wsSend])

  const toggleVideo = useCallback(async () => {
    const wantVideo = !hasVideoRef.current

    if (wantVideo) {
      const vConstraints: MediaTrackConstraints = {
        width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 },
      }
      if (selectedVideoInput) vConstraints.deviceId = { exact: selectedVideoInput }
      const vs = await navigator.mediaDevices.getUserMedia({ video: vConstraints })
      camStreamRef.current = vs
      await enumerateDevices()
      startCamRecorder()
    } else {
      camStreamRef.current?.getTracks().forEach(t => t.stop())
      camStreamRef.current = null
      if (camRecorderRef.current?.state === "recording") {
        camRecorderRef.current.stop()
        camRecorderRef.current = null
      }
    }

    hasVideoRef.current = wantVideo
    setHasVideo(wantVideo)
    wsSend({ type: wantVideo ? "voice_video_on" : "voice_video_off", roomSlug: roomSlugRef.current })
  }, [wsSend, selectedVideoInput, enumerateDevices, startCamRecorder])

  const toggleBgBlur = useCallback(() => setBgBlur(b => !b), [])

  const startScreenShare = useCallback(async () => {
    if (isScreenSharingRef.current) return
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } as any,
      })

      screenStreamRef.current = stream

      const audioTracks = stream.getAudioTracks()
      console.log(
        `[voice] screenshare: ${stream.getVideoTracks().length} video, ${audioTracks.length} audio tracks`,
        audioTracks.map(t => t.label),
      )

      stream.getVideoTracks()[0].addEventListener("ended", () => {
        stopScreenShareInternal()
      }, { once: true })

      isScreenSharingRef.current = true
      setIsScreenSharing(true)

      startScreenRecorder()
      if (audioTracks.length > 0) {
        startScreenAudioCapture()
      }

      wsSend({ type: "voice_screen_start", roomSlug: roomSlugRef.current })
    } catch (e) {
      console.warn("[voice] screenshare failed:", e)
    }
  }, [wsSend, startScreenRecorder, startScreenAudioCapture])

  function stopScreenShareInternal() {
    screenStreamRef.current?.getTracks().forEach(t => t.stop())
    screenStreamRef.current = null
    isScreenSharingRef.current = false
    setIsScreenSharing(false)

    if (screenRecorderRef.current?.state === "recording") {
      screenRecorderRef.current.stop()
      screenRecorderRef.current = null
    }
    if (screenProcessorRef.current) {
      try { screenProcessorRef.current.disconnect() } catch { }
      screenProcessorRef.current = null
    }
    if (screenAudioSrcRef.current) {
      try { screenAudioSrcRef.current.disconnect() } catch { }
      screenAudioSrcRef.current = null
    }

    wsSend({ type: "voice_screen_stop", roomSlug: roomSlugRef.current })
  }

  const stopScreenShare = useCallback(stopScreenShareInternal, [wsSend])

  const setPeerVolume = useCallback((peerId: string, volume: number) => {
    const v = Math.max(0, Math.min(1, volume))
    peerVolumesRef.current.set(peerId, v)
    micAudioPlayersRef.current.get(peerId)?.setVolume(v)
    setPeers(prev => prev.map(p => p.peerId === peerId ? { ...p, volume: v } : p))
  }, [])

  const setPeerScreenVolume = useCallback((peerId: string, volume: number) => {
    const v = Math.max(0, Math.min(1, volume))
    peerScreenVolumesRef.current.set(peerId, v)
    screenAudioPlayersRef.current.get(peerId)?.setVolume(v)
    setPeers(prev => prev.map(p => p.peerId === peerId ? { ...p, screenVolume: v } : p))
  }, [])

  const togglePeerMute = useCallback((peerId: string) => {
    const muted = !(peerMutesRef.current.get(peerId) ?? false)
    peerMutesRef.current.set(peerId, muted)
    micAudioPlayersRef.current.get(peerId)?.setMuted(muted || isDeafenedRef.current)
    setPeers(prev => prev.map(p => p.peerId === peerId ? { ...p, locallyMuted: muted } : p))
  }, [])

  const togglePeerScreenMute = useCallback((peerId: string) => {
    const muted = !(peerScreenMutesRef.current.get(peerId) ?? false)
    peerScreenMutesRef.current.set(peerId, muted)
    screenAudioPlayersRef.current.get(peerId)?.setMuted(muted || isDeafenedRef.current)
    setPeers(prev => prev.map(p => p.peerId === peerId ? { ...p, screenMuted: muted } : p))
  }, [])

  const joinRoom = useCallback(async (video = false) => {
    if (!roomSlug) return
    await acquireMicStream()

    if (video) {
      const vConstraints: MediaTrackConstraints = {
        width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 },
      }
      if (selectedVideoInput) vConstraints.deviceId = { exact: selectedVideoInput }
      try {
        const vs = await navigator.mediaDevices.getUserMedia({ video: vConstraints })
        camStreamRef.current = vs
        hasVideoRef.current = true
        setHasVideo(true)
      } catch (e) {
        console.warn("[voice] camera failed:", e)
      }
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/voice`)
    wsRef.current = ws

    ws.onopen = () => {
      console.log("[voice] connected, joining", roomSlug)
      ws.send(JSON.stringify({ type: "voice_join", roomSlug }))
      startMicCapture()
      if (video) startCamRecorder()
    }

    ws.onmessage = (evt) => {
      let data: any
      try { data = JSON.parse(evt.data) } catch { return }
      if (!data?.type) return

      switch (data.type) {
        case "voice_connected": {
          localPeerIdRef.current = data.peerId
          setLocalPeerId(data.peerId)
          console.log("[voice] my id:", data.peerId)
          break
        }

        case "voice_state": {
          const incoming: any[] = data.peers ?? []
          const remoteIds = new Set(incoming.map((p: any) => p.peerId))

          for (const [pid] of micAudioPlayersRef.current) {
            if (!remoteIds.has(pid)) cleanupPeer(pid)
          }

          setPeers(prev => {
            for (const [pid, vp] of camVideoPlayersRef.current) {
              const sp = incoming.find((p: any) => p.peerId === pid)
              if (!sp || !sp.hasVideo) {
                vp.destroy()
                camVideoPlayersRef.current.delete(pid)
              }
            }
            for (const [pid, vp] of screenVideoPlayersRef.current) {
              const sp = incoming.find((p: any) => p.peerId === pid)
              if (!sp || !sp.isScreenSharing) {
                vp.destroy()
                screenVideoPlayersRef.current.delete(pid)
              }
            }

            return incoming
              .filter((p: any) => p.peerId !== localPeerIdRef.current)
              .map((p: any) => {
                const existing = prev.find(ep => ep.peerId === p.peerId)
                const camPlayer = camVideoPlayersRef.current.get(p.peerId)
                const screenPlayer = screenVideoPlayersRef.current.get(p.peerId)
                return {
                  peerId: p.peerId,
                  isMuted: p.isMuted ?? false,
                  isDeafened: p.isDeafened ?? false,
                  hasVideo: p.hasVideo ?? false,
                  isScreenSharing: p.isScreenSharing ?? false,
                  isSpeaking: existing?.isSpeaking ?? false,
                  videoEl: p.hasVideo ? (camPlayer?.el ?? existing?.videoEl ?? null) : null,
                  screenVideoEl: p.isScreenSharing ? (screenPlayer?.el ?? existing?.screenVideoEl ?? null) : null,
                  volume: peerVolumesRef.current.get(p.peerId) ?? 1,
                  screenVolume: peerScreenVolumesRef.current.get(p.peerId) ?? 1,
                  locallyMuted: peerMutesRef.current.get(p.peerId) ?? false,
                  screenMuted: peerScreenMutesRef.current.get(p.peerId) ?? false,
                }
              })
          })
          break
        }

        case "voice_media": {
          const from: string = data.peerId
          if (!from || from === localPeerIdRef.current) return
          const kind: string = data.kind

          if (kind === "mic_audio" || kind === "screen_audio") {
            handleRemoteAudio(from, kind, data.chunk, data.senderTime, data.seq)
          } else if (kind === "camera_video" || kind === "screen_video") {
            handleRemoteVideo(from, kind, data.chunk, data.senderTime, data.seq)
          }
          break
        }

        case "voice_request_init": {
          console.log("[voice] peer requested init, restarting recorders")
          if (hasVideoRef.current) startCamRecorder()
          if (isScreenSharingRef.current) {
            startScreenRecorder()
            if (screenStreamRef.current?.getAudioTracks().length) {
              startScreenAudioCapture()
            }
          }
          startMicCapture()
          break
        }

        case "voice_ping": {
          wsSend({ type: "voice_pong", roomSlug: roomSlugRef.current })
          break
        }
      }
    }

    ws.onclose = (e) => {
      console.log("[voice] ws closed", e.code)
      stopAllCapture()
      setPeers([])
      setLocalPeerId(null)
      localPeerIdRef.current = null

      if (e.code !== 1000 && roomSlugRef.current) {
        console.log(`[voice] reconnecting in ${RECONNECT_DELAY_MS}ms…`)
        setTimeout(() => {
          const ws = wsRef.current
          if (!ws || ws.readyState >= WebSocket.CLOSING) {
            joinRoom(hasVideoRef.current)
          }
        }, RECONNECT_DELAY_MS)
      }
    }

    ws.onerror = (e) => console.warn("[voice] ws error:", e)
  }, [
    roomSlug, acquireMicStream, selectedVideoInput,
    startMicCapture, startCamRecorder, startScreenRecorder, startScreenAudioCapture,
    handleRemoteAudio, handleRemoteVideo, wsSend,
  ])

  const leaveRoom = useCallback(() => {
    wsSend({ type: "voice_leave", roomSlug: roomSlugRef.current })

    stopAllCapture()

    micStreamRef.current?.getTracks().forEach(t => t.stop())
    micStreamRef.current = null
    camStreamRef.current?.getTracks().forEach(t => t.stop())
    camStreamRef.current = null
    screenStreamRef.current?.getTracks().forEach(t => t.stop())
    screenStreamRef.current = null

    if (audioCtxRef.current) {
      audioCtxRef.current.close()
      audioCtxRef.current = null
    }

    cleanupAllPeers()
    screenSyncRef.current.clear()
    micSeqRef.current = 0
    screenSeqRef.current = 0

    if (wsRef.current) {
      try { wsRef.current.close(1000, "user left") } catch { }
      wsRef.current = null
    }

    setPeers([])
    setLocalPeerId(null)
    localPeerIdRef.current = null
    isMutedRef.current = false
    isDeafenedRef.current = false
    hasVideoRef.current = false
    isScreenSharingRef.current = false
    setIsMuted(false)
    setIsDeafened(false)
    setHasVideo(false)
    setIsScreenSharing(false)
  }, [wsSend])

  useEffect(() => {
    return () => { leaveRoom() }
  }, [roomSlug])

  useEffect(() => {
    if (!micStreamRef.current || !selectedAudioInput) return
    navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: selectedAudioInput },
        echoCancellation: true, noiseSuppression: true, autoGainControl: true,
        sampleRate: AUDIO_SAMPLE_RATE, channelCount: 1,
      },
    }).then(newStream => {
      micStreamRef.current?.getTracks().forEach(t => t.stop())
      micStreamRef.current = newStream
      startMicCapture()
    }).catch(console.warn)
  }, [selectedAudioInput, startMicCapture])

  useEffect(() => {
    if (!camStreamRef.current || !selectedVideoInput || !hasVideoRef.current) return
    navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: selectedVideoInput }, width: { ideal: 1280 }, height: { ideal: 720 } },
    }).then(newStream => {
      camStreamRef.current?.getTracks().forEach(t => t.stop())
      camStreamRef.current = newStream
      startCamRecorder()
    }).catch(console.warn)
  }, [selectedVideoInput, startCamRecorder])

  const localVideoStream = camStreamRef.current || screenStreamRef.current

  return {
    peers,
    localPeerId,
    localStream: micStreamRef.current,
    localVideoStream,
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
  }
}