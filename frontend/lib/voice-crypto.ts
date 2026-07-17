const KEY_ALGO: EcKeyGenParams = { name: "ECDH", namedCurve: "P-256" }
const AES_ALGO = "AES-GCM"
const AES_LEN = 256

export interface VoiceCrypto {
  ownPublicKey: JsonWebKey
  encryptChunk(plaintext: ArrayBuffer): Promise<ArrayBuffer>
  decryptChunk(ciphertext: ArrayBuffer): Promise<ArrayBuffer>
  getEncryptedRoomKey(peerPublicKey: JsonWebKey): Promise<{ encryptedKey: string; iv: string; exporterPublicKey: JsonWebKey }>
  ingestEncryptedRoomKey(encryptedKey: string, iv: string, senderPublicKey: JsonWebKey): Promise<void>
  hasRoomKey(): boolean
}

export async function createVoiceCrypto(): Promise<VoiceCrypto> {
  const keypair = await crypto.subtle.generateKey(KEY_ALGO, true, ["deriveBits"])
  const ownPublicKey = await crypto.subtle.exportKey("jwk", keypair.publicKey)

  let roomKey: CryptoKey | null = null
  let roomKeyRaw: ArrayBuffer | null = null

  async function deriveAesKey(privateKey: CryptoKey, peerPublicJwk: JsonWebKey): Promise<CryptoKey> {
    const peerPublic = await crypto.subtle.importKey("jwk", peerPublicJwk, KEY_ALGO, true, [])
    const sharedBits = await crypto.subtle.deriveBits(
      { name: "ECDH", public: peerPublic },
      privateKey,
      256,
    )
    return crypto.subtle.importKey("raw", sharedBits, { name: AES_ALGO, length: AES_LEN }, false, ["encrypt", "decrypt"])
  }

  async function generateRoomKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey({ name: AES_ALGO, length: AES_LEN }, true, ["encrypt", "decrypt"])
  }

  async function exportKey(key: CryptoKey): Promise<ArrayBuffer> {
    return crypto.subtle.exportKey("raw", key)
  }

  async function importAesKey(raw: ArrayBuffer): Promise<CryptoKey> {
    return crypto.subtle.importKey("raw", raw, { name: AES_ALGO, length: AES_LEN }, false, ["encrypt", "decrypt"])
  }

  let encryptChunkImpl: (plaintext: ArrayBuffer) => Promise<ArrayBuffer>
  let decryptChunkImpl: (ciphertext: ArrayBuffer) => Promise<ArrayBuffer>

  encryptChunkImpl = async (plaintext: ArrayBuffer): Promise<ArrayBuffer> => {
    if (!roomKey) throw new Error("No room key")
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = await crypto.subtle.encrypt({ name: AES_ALGO, iv }, roomKey, plaintext)
    const out = new Uint8Array(iv.length + ciphertext.byteLength)
    out.set(iv, 0)
    out.set(new Uint8Array(ciphertext), iv.length)
    return out.buffer
  }

  decryptChunkImpl = async (ciphertext: ArrayBuffer): Promise<ArrayBuffer> => {
    if (!roomKey) throw new Error("No room key")
    const iv = new Uint8Array(ciphertext.slice(0, 12))
    const data = ciphertext.slice(12)
    return crypto.subtle.decrypt({ name: AES_ALGO, iv }, roomKey, data)
  }

  return {
    ownPublicKey,

    encryptChunk(plaintext) {
      if (!roomKey) return Promise.resolve(plaintext)
      return encryptChunkImpl(plaintext)
    },

    decryptChunk(ciphertext) {
      if (!roomKey) return Promise.resolve(ciphertext)
      return decryptChunkImpl(ciphertext)
    },

    hasRoomKey() {
      return roomKey !== null
    },

    async getEncryptedRoomKey(peerPublicKey) {
      if (!roomKey) {
        roomKey = await generateRoomKey()
        roomKeyRaw = await exportKey(roomKey)
      }
      const derivedKey = await deriveAesKey(keypair.privateKey, peerPublicKey)
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const encrypted = await crypto.subtle.encrypt({ name: AES_ALGO, iv }, derivedKey, roomKeyRaw!)
      const encryptedBytes = new Uint8Array(encrypted)
      const ivStr = btoa(String.fromCharCode(...iv))
      const keyStr = btoa(String.fromCharCode(...encryptedBytes))
      return { encryptedKey: keyStr, iv: ivStr, exporterPublicKey: ownPublicKey }
    },

    async ingestEncryptedRoomKey(encryptedKey, iv, senderPublicKey) {
      const derivedKey = await deriveAesKey(keypair.privateKey, senderPublicKey)
      const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0))
      const encryptedBytes = Uint8Array.from(atob(encryptedKey), c => c.charCodeAt(0))
      roomKeyRaw = await crypto.subtle.decrypt({ name: AES_ALGO, iv: ivBytes }, derivedKey, encryptedBytes.buffer)
      roomKey = await importAesKey(roomKeyRaw)
    },
  }
}