import fs from 'fs'
import path from 'path'

let initialized = false
let faceapi: any = null
let tf: any = null
let imageLib: any = null

const MODEL_PATH = process.env.FACE_API_MODEL_PATH
  ? String(process.env.FACE_API_MODEL_PATH)
  : path.join(process.cwd(), 'model')
const MODEL_BASE_URL = process.env.FACE_API_MODEL_BASE_URL || 'https://raw.githubusercontent.com/vladmandic/face-api/master/model'
const REQUIRED_MODEL_FILES = [
  'ssd_mobilenetv1_model-weights_manifest.json',
  'ssd_mobilenetv1_model.bin',
  'age_gender_model-weights_manifest.json',
  'age_gender_model.bin',
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model.bin',
]

async function downloadFile(filename: string): Promise<void> {
  const url = `${MODEL_BASE_URL}/${filename}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download FaceAPI model file ${filename}: ${response.status} ${response.statusText}`)
  }
  const data = Buffer.from(await response.arrayBuffer())
  fs.writeFileSync(path.join(MODEL_PATH, filename), data)
}

async function ensureModelFiles(): Promise<void> {
  if (!fs.existsSync(MODEL_PATH)) {
    fs.mkdirSync(MODEL_PATH, { recursive: true })
  }

  for (const filename of REQUIRED_MODEL_FILES) {
    const filePath = path.join(MODEL_PATH, filename)
    if (!fs.existsSync(filePath)) {
      await downloadFile(filename)
    }
  }
}

async function initFaceApi(): Promise<void> {
  if (initialized) return

  // @ts-ignore
  const tfModule = await import('@tensorflow/tfjs-node')
  // @ts-ignore
  const faceApiModule = await import('@vladmandic/face-api')
  // @ts-ignore
  const imageModule = await import('@canvas/image')

  tf = tfModule?.default || tfModule
  faceapi = faceApiModule?.default || faceApiModule
  imageLib = imageModule?.default || imageModule
  if (!faceapi.tf) {
    faceapi.tf = tf
  }

  await ensureModelFiles()

  await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_PATH)
  await faceapi.nets.ageGenderNet.loadFromDisk(MODEL_PATH)
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_PATH)

  initialized = true
}

export async function estimateAgeFromSelfie(buffer: Buffer): Promise<number | null> {
  await initFaceApi()

  const canvas = await imageLib.imageFromBuffer(buffer)
  const imageData = imageLib.getImageData(canvas)

  const tensor = tf.tidy(() => {
    const rgba = tf.tensor(Array.from(imageData?.data || []), [canvas.height, canvas.width, 4], 'int32')
    const channels = tf.split(rgba, 4, 2)
    const rgb = tf.stack([channels[0], channels[1], channels[2]], 2)
    const reshape = tf.reshape(rgb, [1, canvas.height, canvas.width, 3])
    return reshape
  })

  try {
    const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3, maxResults: 1 })
    const result = await faceapi.detectSingleFace(tensor, options).withFaceLandmarks().withAgeAndGender()
    if (!result || typeof result.age !== 'number') {
      return null
    }
    return Number(result.age)
  } finally {
    tensor.dispose()
  }
}