import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const SECRET = process.env.CAPTCHA_SECRET!;
const CAPTCHAS_INVISIBLE_SECRET = process.env.CAPTCHA_INVISIBLE_SECRET;
const TTL_MS = 5 * 60 * 1000;
const INVISIBLE_TTL_MS = 5 * 60 * 1000;
const INVISIBLE_MIN_TIME_MS = 1500;
const INVISIBLE_MAX_TIME_MS = 60 * 60 * 1000;
const SAMPLE_RATE = 22050;
const TTS_VOICE = process.env.CAPTCHA_TTS_VOICE || 'en';
const TTS_SPEED = Number(process.env.CAPTCHA_TTS_SPEED || '150');

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export function generateInvisibleCaptcha() {
  const nonce = crypto.randomBytes(8).toString('hex');
  const created = Date.now();
  const payload = `${nonce}|${created}`;
  const signature = crypto.createHmac('sha256', CAPTCHAS_INVISIBLE_SECRET).update(payload).digest('hex');
  const token = Buffer.from(`${payload}|${signature}`).toString('base64');
  return { token, created };
}

export function validateInvisibleCaptcha(token: string, elapsedMs: number | undefined): boolean {
  if (!token || !elapsedMs || elapsedMs < INVISIBLE_MIN_TIME_MS || elapsedMs > INVISIBLE_MAX_TIME_MS) {
    return false;
  }

  let decoded: string;
  try {
    decoded = Buffer.from(token, 'base64').toString('utf8');
  } catch {
    return false;
  }

  const parts = decoded.split('|');
  if (parts.length !== 3) return false;

  const [nonce, createdRaw, signature] = parts;
  const created = Number(createdRaw);
  if (!nonce || !Number.isFinite(created) || created <= 0) return false;
  if (created + INVISIBLE_TTL_MS < Date.now()) return false;

  const payload = `${nonce}|${created}`;
  const expectedSignature = crypto.createHmac('sha256', CAPTCHAS_INVISIBLE_SECRET).update(payload).digest('hex');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

function randomColor(minBrightness = 60, maxBrightness = 180) {
  const r = randomInt(minBrightness, maxBrightness);
  const g = randomInt(minBrightness, maxBrightness);
  const b = randomInt(minBrightness, maxBrightness);
  return `rgb(${r},${g},${b})`;
}

function similarColor(baseColor: string, variance = 30) {
  const match = baseColor.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!match) return randomColor();
  const r = Math.min(255, Math.max(0, parseInt(match[1]) + randomInt(-variance, variance)));
  const g = Math.min(255, Math.max(0, parseInt(match[2]) + randomInt(-variance, variance)));
  const b = Math.min(255, Math.max(0, parseInt(match[3]) + randomInt(-variance, variance)));
  return `rgb(${r},${g},${b})`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getGlyphVariant(char: string, x: number, y: number, size: number, color: string, id: string) {
  const rotation = randomInt(-25, 25);
  const skewX = randomInt(-15, 15);
  const skewY = randomInt(-8, 8);
  const scaleX = randomFloat(0.85, 1.15);
  const scaleY = randomFloat(0.85, 1.15);

  const fonts = [
    'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New',
    'Verdana', 'Impact', 'Comic Sans MS', 'Trebuchet MS', 'Arial Black'
  ];
  const font = fonts[randomInt(0, fonts.length - 1)];

  const weights = ['normal', 'bold', '600', '700', '800'];
  const weight = weights[randomInt(0, weights.length - 1)];
  const style = Math.random() > 0.7 ? 'italic' : 'normal';

  const transform = `translate(${x}, ${y}) rotate(${rotation}) skewX(${skewX}) skewY(${skewY}) scale(${scaleX}, ${scaleY})`;

  let svg = '';
  const escapedChar = escapeXml(char);

  svg += `<text x="0" y="0" text-anchor="middle" font-family="${font}" font-size="${size + randomInt(0, 4)}" font-weight="${weight}" font-style="${style}" fill="${similarColor(color, 40)}" opacity="${randomFloat(0.1, 0.3)}" transform="${transform} translate(${randomInt(-3, 3)}, ${randomInt(-3, 3)})" filter="url(#blur${id})">${escapedChar}</text>`;
  svg += `<text x="0" y="0" text-anchor="middle" font-family="${font}" font-size="${size}" font-weight="${weight}" font-style="${style}" fill="url(#grad${id})" stroke="${similarColor(color, 50)}" stroke-width="${randomFloat(0.3, 1.2)}" transform="${transform}">${escapedChar}</text>`;

  if (Math.random() > 0.5) {
    svg += `<line x1="${x - size / 2}" y1="${y + randomInt(-size / 3, size / 3)}" x2="${x + size / 2}" y2="${y + randomInt(-size / 3, size / 3)}" stroke="${similarColor(color, 60)}" stroke-width="${randomFloat(1, 2.5)}" opacity="${randomFloat(0.4, 0.7)}" transform="rotate(${randomInt(-20, 20)}, ${x}, ${y})"/>`;
  }

  return svg;
}

function generateDecoys(width: number, height: number, realChars: string) {
  let svg = '';
  const decoyChars = '0123456789+-=×÷abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ@#$%&*';
  const availableDecoys = decoyChars.split('').filter(c => !realChars.includes(c));

  for (let i = 0; i < randomInt(8, 15); i++) {
    const char = availableDecoys[randomInt(0, availableDecoys.length - 1)];
    const x = randomInt(10, width - 10);
    const y = randomInt(15, height - 10);
    const size = randomInt(14, 28);
    const rotation = randomInt(-45, 45);
    const opacity = randomFloat(0.08, 0.25);
    const fonts = ['Arial', 'Helvetica', 'Georgia', 'Verdana', 'Times New Roman'];
    const font = fonts[randomInt(0, fonts.length - 1)];
    svg += `<text x="${x}" y="${y}" text-anchor="middle" font-family="${font}" font-size="${size}" fill="${randomColor(80, 200)}" opacity="${opacity}" transform="rotate(${rotation}, ${x}, ${y})">${escapeXml(char)}</text>`;
  }

  return svg;
}

function generateWaves(width: number, height: number) {
  let svg = '';
  for (let i = 0; i < randomInt(4, 8); i++) {
    const amplitude = randomInt(5, 20);
    const frequency = randomFloat(0.02, 0.08);
    const phase = randomFloat(0, Math.PI * 2);
    const yOffset = randomInt(10, height - 10);
    let path = `M 0 ${yOffset}`;
    for (let x = 0; x <= width; x += 5) {
      const y = yOffset + Math.sin(x * frequency + phase) * amplitude;
      path += ` L ${x} ${y}`;
    }
    svg += `<path d="${path}" stroke="${randomColor()}" stroke-width="${randomFloat(1, 3)}" fill="none" opacity="${randomFloat(0.2, 0.5)}"/>`;
  }
  return svg;
}

function generateNoise(width: number, height: number) {
  let svg = '';
  for (let i = 0; i < randomInt(40, 80); i++) {
    const x = randomInt(0, width);
    const y = randomInt(0, height);
    const r = randomFloat(0.5, 4);
    svg += `<circle cx="${x}" cy="${y}" r="${r}" fill="${randomColor()}" opacity="${randomFloat(0.15, 0.5)}"/>`;
  }
  for (let i = 0; i < randomInt(20, 40); i++) {
    const x = randomInt(0, width);
    const y = randomInt(0, height);
    const w = randomInt(2, 8);
    const h = randomInt(2, 8);
    const rotation = randomInt(0, 360);
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${randomColor()}" opacity="${randomFloat(0.1, 0.4)}" transform="rotate(${rotation}, ${x + w / 2}, ${y + h / 2})"/>`;
  }
  for (let i = 0; i < randomInt(10, 25); i++) {
    const x = randomInt(0, width);
    const y = randomInt(0, height);
    const size = randomInt(3, 10);
    const points = `${x},${y - size} ${x - size},${y + size} ${x + size},${y + size}`;
    svg += `<polygon points="${points}" fill="${randomColor()}" opacity="${randomFloat(0.1, 0.35)}" transform="rotate(${randomInt(0, 360)}, ${x}, ${y})"/>`;
  }
  return svg;
}

function generateBezierCurves(width: number, height: number) {
  let svg = '';
  for (let i = 0; i < randomInt(15, 30); i++) {
    svg += `<path d="M ${randomInt(0, width)} ${randomInt(0, height)} C ${randomInt(0, width)} ${randomInt(0, height)}, ${randomInt(0, width)} ${randomInt(0, height)}, ${randomInt(0, width)} ${randomInt(0, height)}" stroke="${randomColor()}" stroke-width="${randomFloat(0.5, 2.5)}" fill="none" opacity="${randomFloat(0.2, 0.6)}"/>`;
  }
  return svg;
}

function generateGridInterference(width: number, height: number) {
  let svg = '';
  const gridSize = randomInt(8, 15);
  const offset = randomInt(0, gridSize);
  for (let x = offset; x < width; x += gridSize + randomInt(-2, 2)) {
    const wobble = randomInt(-3, 3);
    svg += `<line x1="${x + wobble}" y1="0" x2="${x - wobble}" y2="${height}" stroke="${randomColor(100, 200)}" stroke-width="${randomFloat(0.3, 1)}" opacity="${randomFloat(0.05, 0.15)}"/>`;
  }
  for (let y = offset; y < height; y += gridSize + randomInt(-2, 2)) {
    const wobble = randomInt(-3, 3);
    svg += `<line x1="0" y1="${y + wobble}" x2="${width}" y2="${y - wobble}" stroke="${randomColor(100, 200)}" stroke-width="${randomFloat(0.3, 1)}" opacity="${randomFloat(0.05, 0.15)}"/>`;
  }
  return svg;
}

function generateFakeQuestion(width: number, height: number, realQuestion: string) {
  let svg = '';
  const fakeQuestions = [
    '9 + 1', '3 + 4', '2 + 5', '8 + 1', '4 + 3', '6 + 2', '1 + 7', '5 + 3',
    '7 - 2', '9 - 4', '8 - 3', '6 - 1', '5 x 2', '3 x 3', '2 x 4', '4 x 2'
  ].filter(q => q !== realQuestion);

  for (let i = 0; i < randomInt(2, 4); i++) {
    const fake = fakeQuestions[randomInt(0, fakeQuestions.length - 1)];
    const x = randomInt(20, width - 20);
    const y = randomInt(15, height - 15);
    const size = randomInt(16, 26);
    const rotation = randomInt(-30, 30);
    svg += `<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial" font-size="${size}" fill="${randomColor()}" opacity="${randomFloat(0.08, 0.18)}" transform="rotate(${rotation}, ${x}, ${y})">${escapeXml(fake)}</text>`;
  }
  return svg;
}

function generateStrikethroughs(width: number, height: number, textStartX: number, textEndX: number) {
  let svg = '';
  for (let i = 0; i < randomInt(3, 7); i++) {
    const y = height / 2 + randomInt(-15, 15);
    const startX = textStartX - randomInt(5, 20);
    const endX = textEndX + randomInt(5, 20);
    let path = `M ${startX} ${y}`;
    for (let x = startX; x <= endX; x += randomInt(8, 15)) {
      path += ` Q ${x + randomInt(3, 8)} ${y + randomInt(-5, 5)}, ${x + randomInt(10, 20)} ${y + randomInt(-3, 3)}`;
    }
    svg += `<path d="${path}" stroke="${randomColor()}" stroke-width="${randomFloat(1, 2.5)}" fill="none" opacity="${randomFloat(0.3, 0.6)}"/>`;
  }
  return svg;
}

async function synthesizeSpeechToFile(text: string): Promise<Buffer> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'captcha-tts-'));
  const outPath = path.join(tmpDir, `speech-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`);

  try {
    await new Promise<void>((resolve, reject) => {
      const espeak = spawn('espeak', [
        '-v', TTS_VOICE,
        '-s', String(TTS_SPEED),
        '-w', outPath,
        text
      ]);

      const stderrChunks: Buffer[] = [];
      espeak.stderr.on('data', (chunk) => stderrChunks.push(Buffer.from(chunk)));

      espeak.on('error', (err) => {
        reject(new Error(`espeak spawn failed: ${err.message}. Is espeak installed? Run: sudo apt-get install espeak`));
      });

      espeak.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`espeak exited with code ${code}: ${Buffer.concat(stderrChunks).toString()}`));
        } else {
          resolve();
        }
      });
    });

    const stat = await fs.stat(outPath).catch(() => null);
    if (!stat || stat.size === 0) {
      throw new Error(`espeak produced no output for "${text}"`);
    }

    return await fs.readFile(outPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function decodeAudioBufferToFloat32(audioBuf: Buffer, targetRate = SAMPLE_RATE): Promise<Float32Array> {
  return await new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      'pipe:0',
      '-f',
      's16le',
      '-acodec',
      'pcm_s16le',
      '-ar',
      String(targetRate),
      '-ac',
      '1',
      'pipe:1',
    ]);

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    ffmpeg.stdout.on('data', (chunk) => stdoutChunks.push(Buffer.from(chunk)));
    ffmpeg.stderr.on('data', (chunk) => stderrChunks.push(Buffer.from(chunk)));
    ffmpeg.on('error', (err) => reject(new Error(`ffmpeg spawn failed: ${err.message}`)));

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`ffmpeg exited with code ${code}: ${Buffer.concat(stderrChunks).toString()}`));
      }

      const raw = Buffer.concat(stdoutChunks);
      if (raw.length < 2) {
        return reject(new Error('ffmpeg produced no output'));
      }

      const samples = new Float32Array(Math.floor(raw.length / 2));
      for (let i = 0; i < samples.length; i++) {
        samples[i] = raw.readInt16LE(i * 2) / 0x7fff;
      }

      resolve(samples);
    });

    ffmpeg.stdin.on('error', (err) => reject(new Error(`ffmpeg stdin error: ${err.message}`)));
    ffmpeg.stdin.write(audioBuf);
    ffmpeg.stdin.end();
  });
}

function concatFloat32(buffers: Float32Array[]): Float32Array {
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
  const out = new Float32Array(totalLength);
  let offset = 0;
  for (const buf of buffers) {
    out.set(buf, offset);
    offset += buf.length;
  }
  return out;
}

function generateSilence(durationMs: number, sampleRate = SAMPLE_RATE): Float32Array {
  return new Float32Array(Math.floor((sampleRate * durationMs) / 1000));
}

function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): Buffer {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 0x7fff), offset);
    offset += 2;
  }
  return buffer;
}

function applyPitchWobble(samples: Float32Array, sampleRate = SAMPLE_RATE): Float32Array {
  const lfoFreq = randomFloat(0.3, 1.5);
  const lfoDepth = randomFloat(0.03, 0.10);
  const baseSpeed = randomFloat(0.88, 1.12);

  const estLength = Math.floor(samples.length / baseSpeed) + sampleRate;
  const out = new Float32Array(estLength);

  let readPos = 0;
  let writePos = 0;

  while (readPos < samples.length - 1 && writePos < estLength) {
    const t = writePos / sampleRate;
    const speed = baseSpeed + Math.sin(2 * Math.PI * lfoFreq * t) * lfoDepth;

    const idx = Math.floor(readPos);
    const frac = readPos - idx;

    if (idx + 1 < samples.length) {
      out[writePos] = samples[idx] * (1 - frac) + samples[idx + 1] * frac;
    } else {
      out[writePos] = samples[idx] ?? 0;
    }

    readPos += speed;
    writePos++;
  }

  return out.slice(0, writePos);
}

function addEcho(samples: Float32Array, sampleRate = SAMPLE_RATE): Float32Array {
  const out = new Float32Array(samples.length);
  const delays = [
    { d: Math.floor(sampleRate * randomFloat(0.06, 0.12)), g: randomFloat(0.15, 0.3) },
    { d: Math.floor(sampleRate * randomFloat(0.15, 0.30)), g: randomFloat(0.08, 0.18) },
    { d: Math.floor(sampleRate * randomFloat(0.30, 0.50)), g: randomFloat(0.03, 0.10) },
  ];

  for (let i = 0; i < samples.length; i++) {
    let val = samples[i];
    for (const { d, g } of delays) {
      if (i >= d) val += samples[i - d] * g;
    }
    out[i] = val;
  }
  return out;
}

function applyBandpass(samples: Float32Array, centerFreq: number, q: number, sampleRate = SAMPLE_RATE): Float32Array {
  const w0 = (2 * Math.PI * centerFreq) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha;

  const out = new Float32Array(samples.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    out[i] = y;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
  }

  const mix = randomFloat(0.25, 0.5);
  for (let i = 0; i < samples.length; i++) {
    out[i] = samples[i] * (1 - mix) + out[i] * mix;
  }
  return out;
}

function normalize(samples: Float32Array, targetPeak = 0.85): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  if (peak === 0) return samples;
  const gain = targetPeak / peak;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    out[i] = samples[i] * gain;
  }
  return out;
}

function generateAudioNoise(length: number, sampleRate = SAMPLE_RATE): Float32Array {
  const buf = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    buf[i] += (Math.random() * 2 - 1) * 0.06;
  }

  let brown = 0;
  for (let i = 0; i < length; i++) {
    brown += (Math.random() * 2 - 1) * 0.02;
    brown *= 0.998;
    buf[i] += brown * 0.5;
  }

  for (let b = 0; b < randomInt(6, 14); b++) {
    const freq = randomFloat(150, 2000);
    const startSample = randomInt(0, Math.max(0, length - sampleRate));
    const dur = randomInt(Math.floor(sampleRate * 0.05), Math.floor(sampleRate * 0.4));
    const amp = randomFloat(0.03, 0.12);
    for (let i = 0; i < dur && startSample + i < length; i++) {
      const t = i / sampleRate;
      const env = Math.sin(Math.PI * (i / dur));
      buf[startSample + i] += Math.sin(2 * Math.PI * freq * t) * env * amp;
    }
  }

  for (let i = 0; i < length; i++) {
    if (Math.random() < 0.0008) {
      const impulseLen = randomInt(2, 20);
      const impulseAmp = randomFloat(0.1, 0.3);
      for (let j = 0; j < impulseLen && i + j < length; j++) {
        buf[i + j] += (Math.random() * 2 - 1) * impulseAmp * (1 - j / impulseLen);
      }
    }
  }

  for (let c = 0; c < randomInt(1, 3); c++) {
    const startFreq = randomFloat(200, 800);
    const endFreq = randomFloat(800, 2500);
    const startSample = randomInt(0, Math.max(0, length - Math.floor(sampleRate * 0.5)));
    const dur = randomInt(Math.floor(sampleRate * 0.2), Math.floor(sampleRate * 0.8));
    const amp = randomFloat(0.02, 0.08);
    for (let i = 0; i < dur && startSample + i < length; i++) {
      const progress = i / dur;
      const freq = startFreq + (endFreq - startFreq) * progress;
      const t = i / sampleRate;
      const env = Math.sin(Math.PI * progress);
      buf[startSample + i] += Math.sin(2 * Math.PI * freq * t) * env * amp;
    }
  }

  return buf;
}

function questionToSpeechWords(question: string): string[] {
  return question
    .replace(/×/g, 'times')
    .replace(/\+/g, 'plus')
    .replace(/-/g, 'minus')
    .split(' ')
    .map((token) => {
      if (/^\d+$/.test(token)) {
        const n = Number(token);
        const words: Record<number, string> = {
          0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four',
          5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine',
          10: 'ten', 11: 'eleven', 12: 'twelve', 13: 'thirteen',
          14: 'fourteen', 15: 'fifteen',
        };
        return words[n] ?? token;
      }
      return token;
    });
}

const ALL_SPOKEN_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'plus', 'minus', 'times',
];

async function fetchWordPCM(word: string): Promise<Float32Array> {
  const audioFile = await synthesizeSpeechToFile(word);
  const pcm = await decodeAudioBufferToFloat32(audioFile, SAMPLE_RATE);
  if (pcm.length < 100) {
    throw new Error(`TTS produced insufficient audio for "${word}"`);
  }
  return pcm;
}

async function generateCaptchaAudio(question: string): Promise<string> {
  const words = questionToSpeechWords(question);
  const wordSamples: Float32Array[] = [];

  const fullPhrase = words.join(' ');
  const fullPhrasePCM = await fetchWordPCM(fullPhrase);

  if (fullPhrasePCM.length > 500) {
    wordSamples.push(applyPitchWobble(fullPhrasePCM));
  } else {
    for (const word of words) {
      const pcm = await fetchWordPCM(word);
      wordSamples.push(applyPitchWobble(pcm));
    }
  }

  const timedParts: Float32Array[] = [];
  timedParts.push(generateSilence(randomInt(300, 800)));

  if (Math.random() > 0.4) {
    const burstLen = Math.floor(SAMPLE_RATE * randomFloat(0.1, 0.3));
    const burst = new Float32Array(burstLen);
    const bFreq = randomFloat(300, 1500);
    for (let i = 0; i < burstLen; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.sin(Math.PI * (i / burstLen));
      burst[i] = Math.sin(2 * Math.PI * bFreq * t) * env * 0.15;
    }
    timedParts.push(burst);
    timedParts.push(generateSilence(randomInt(100, 300)));
  }

  for (const seg of wordSamples) {
    const vol = randomFloat(0.7, 1.0);
    const modified = new Float32Array(seg.length);
    for (let i = 0; i < seg.length; i++) {
      modified[i] = seg[i] * vol;
    }
    timedParts.push(modified);
    timedParts.push(generateSilence(randomInt(80, 450)));
  }

  timedParts.push(generateSilence(randomInt(300, 700)));
  let combined = concatFloat32(timedParts);

  const realSet = new Set(words);
  const availableDecoys = ALL_SPOKEN_WORDS.filter(w => !realSet.has(w));

  const decoyCount = randomInt(2, Math.min(5, availableDecoys.length));
  const shuffled = [...availableDecoys].sort(() => Math.random() - 0.5);
  const chosenDecoys = shuffled.slice(0, decoyCount);

  const decoyResults = await Promise.all(chosenDecoys.map(w => fetchWordPCM(w)));

  for (let decoyPcm of decoyResults) {
    decoyPcm = applyPitchWobble(decoyPcm);

    const decoyVol = randomFloat(0.06, 0.20);
    const quietDecoy = new Float32Array(decoyPcm.length);
    for (let j = 0; j < decoyPcm.length; j++) {
      quietDecoy[j] = decoyPcm[j] * decoyVol;
    }

    const insertPos = randomInt(0, Math.max(0, combined.length - quietDecoy.length));
    for (let i = 0; i < quietDecoy.length && insertPos + i < combined.length; i++) {
      combined[insertPos + i] += quietDecoy[i];
    }
  }

  if (Math.random() > 0.3) {
    const repeatGap = generateSilence(randomInt(400, 900));
    const repeat = applyPitchWobble(fullPhrasePCM);
    const repeatVol = randomFloat(0.6, 0.9);
    const quietRepeat = new Float32Array(repeat.length);
    for (let i = 0; i < repeat.length; i++) {
      quietRepeat[i] = repeat[i] * repeatVol;
    }
    combined = concatFloat32([combined, repeatGap, quietRepeat, generateSilence(randomInt(200, 500))]);
  }

  combined = addEcho(combined, SAMPLE_RATE);
  combined = applyBandpass(combined, randomFloat(500, 1400), randomFloat(0.5, 1.5), SAMPLE_RATE);

  const noise = generateAudioNoise(combined.length, SAMPLE_RATE);
  const noiseLevel = randomFloat(0.12, 0.30);
  for (let i = 0; i < combined.length; i++) {
    combined[i] += noise[i] * noiseLevel;
  }

  combined = normalize(combined, 0.85);
  for (let i = 0; i < combined.length; i++) {
    combined[i] = Math.tanh(combined[i] * 1.3);
  }
  combined = normalize(combined, 0.9);

  const wav = encodeWav(combined, SAMPLE_RATE);
  return `data:audio/wav;base64,${wav.toString('base64')}`;
}

export async function generateCaptcha() {
  const operations = [
    { gen: () => { const a = randomInt(1, 9); const b = randomInt(1, 9); return { q: `${a} + ${b}`, a: a + b }; } },
    { gen: () => { const a = randomInt(5, 15); const b = randomInt(1, a - 1); return { q: `${a} - ${b}`, a: a - b }; } },
    { gen: () => { const a = randomInt(2, 6); const b = randomInt(2, 5); return { q: `${a} × ${b}`, a: a * b }; } },
  ];

  const op = operations[randomInt(0, operations.length - 1)];
  const { q: question, a: answer } = op.gen();

  const expires = Date.now() + TTL_MS;
  const payload = `${answer}|${expires}`;
  const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  const token = Buffer.from(`${payload}|${signature}`).toString('base64');

  const width = 220;
  const height = 90;
  const captchaId = crypto.randomBytes(4).toString('hex');

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;
  svg += `<defs>`;

  const questionChars = question.split('');
  questionChars.forEach((_, idx) => {
    const color1 = randomColor(80, 200);
    const color2 = randomColor(80, 200);
    const angle = randomInt(0, 360);
    svg += `<linearGradient id="grad${captchaId}${idx}" gradientTransform="rotate(${angle})">
      <stop offset="0%" stop-color="${color1}"/>
      <stop offset="100%" stop-color="${color2}"/>
    </linearGradient>`;
    svg += `<filter id="blur${captchaId}${idx}">
      <feGaussianBlur stdDeviation="${randomFloat(1, 3)}"/>
    </filter>`;
  });

  svg += `<filter id="noise${captchaId}">
    <feTurbulence type="fractalNoise" baseFrequency="${randomFloat(0.6, 0.9)}" numOctaves="3" result="noise"/>
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="${randomInt(2, 5)}" xChannelSelector="R" yChannelSelector="G"/>
  </filter>`;

  svg += `</defs>`;

  const bgColor1 = randomColor(40, 100);
  const bgColor2 = randomColor(40, 100);
  svg += `<rect width="100%" height="100%" fill="${bgColor1}"/>`;
  svg += `<rect width="100%" height="100%" fill="url(#bgGrad${captchaId})" opacity="0.5"/>`;
  svg += `<defs><linearGradient id="bgGrad${captchaId}" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="${bgColor1}"/>
    <stop offset="100%" stop-color="${bgColor2}"/>
  </linearGradient></defs>`;

  svg += generateGridInterference(width, height);
  svg += generateWaves(width, height);
  svg += generateFakeQuestion(width, height, question);
  svg += generateDecoys(width, height, question);
  svg += generateBezierCurves(width, height);
  svg += generateNoise(width, height);

  const glyphSpacing = randomInt(20, 28);
  const startX = (width - (questionChars.length - 1) * glyphSpacing) / 2;
  const baseY = height / 2 + randomInt(-5, 10);

  questionChars.forEach((ch, idx) => {
    const charX = startX + idx * glyphSpacing + randomInt(-3, 3);
    const charY = baseY + randomInt(-8, 8);
    const size = randomInt(28, 38);
    const color = randomColor(100, 220);
    svg += getGlyphVariant(ch, charX, charY, size, color, `${captchaId}${idx}`);
  });

  svg += generateStrikethroughs(width, height, startX - 10, startX + (questionChars.length - 1) * glyphSpacing + 10);

  for (let i = 0; i < randomInt(5, 10); i++) {
    svg += `<path d="M ${randomInt(0, width)} ${randomInt(0, height)} Q ${randomInt(0, width)} ${randomInt(0, height)}, ${randomInt(0, width)} ${randomInt(0, height)}" stroke="${randomColor()}" stroke-width="${randomFloat(1, 2)}" fill="none" opacity="${randomFloat(0.3, 0.6)}"/>`;
  }

  const watermarks = ['ECLIPANEL', 'VERIFY', 'CAPTCHA', 'HUMAN'];
  const corruptChars = '@#$%&*~?!<>{}[]|';

  for (let i = 0; i < randomInt(4, 8); i++) {
    const text = watermarks[randomInt(0, watermarks.length - 1)];
    const corrupted = text.split('').map(ch => {
      if (Math.random() < 0.3) return corruptChars[randomInt(0, corruptChars.length - 1)];
      if (Math.random() < 0.2) return String.fromCharCode(ch.charCodeAt(0) + randomInt(-3, 3));
      return ch;
    }).join('');
    const x = randomInt(10, width - 10);
    const y = randomInt(15, height - 10);
    const size = randomInt(8, 14);
    const rotation = randomInt(-45, 45);
    svg += `<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial" font-size="${size}" fill="${randomColor()}" opacity="${randomFloat(0.1, 0.25)}" transform="rotate(${rotation}, ${x}, ${y})">${escapeXml(corrupted)}</text>`;
  }

  for (let i = 0; i < randomInt(50, 100); i++) {
    const x = randomInt(0, width);
    const y = randomInt(0, height);
    svg += `<circle cx="${x}" cy="${y}" r="${randomFloat(0.3, 1.5)}" fill="${randomColor()}" opacity="${randomFloat(0.2, 0.5)}"/>`;
  }

  for (let i = 0; i < randomInt(8, 15); i++) {
    const edge = randomInt(0, 3);
    let x1: number, y1: number, x2: number, y2: number;
    switch (edge) {
      case 0: x1 = randomInt(0, width); y1 = 0; x2 = randomInt(0, width); y2 = randomInt(10, 30); break;
      case 1: x1 = width; y1 = randomInt(0, height); x2 = width - randomInt(10, 30); y2 = randomInt(0, height); break;
      case 2: x1 = randomInt(0, width); y1 = height; x2 = randomInt(0, width); y2 = height - randomInt(10, 30); break;
      default: x1 = 0; y1 = randomInt(0, height); x2 = randomInt(10, 30); y2 = randomInt(0, height); break;
    }
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${randomColor()}" stroke-width="${randomFloat(1, 3)}" opacity="${randomFloat(0.3, 0.7)}"/>`;
  }

  svg += `</svg>`;

  const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const audio = await generateCaptchaAudio(question);

  return { token, image, audio };
}

export function validateCaptcha(token: string, answer: number | string): boolean {
  if (!token || answer === undefined || answer === null || answer === '') return false;

  let decoded: string;
  try {
    decoded = Buffer.from(token, 'base64').toString('utf8');
  } catch {
    return false;
  }

  const parts = decoded.split('|');
  if (parts.length !== 3) return false;

  const [expectedAnswer, expiresRaw, signature] = parts;
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires < Date.now()) return false;

  const payload = `${expectedAnswer}|${expires}`;
  const expectedSignature = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');

  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))) {
      return false;
    }
  } catch {
    return false;
  }

  const normalizedAnswer = String(answer).trim();
  const normalizedExpected = String(expectedAnswer).trim();

  return normalizedAnswer === normalizedExpected;
}

export function scoreBehavior(behavior: any): number {
  if (!behavior || typeof behavior !== 'object') return 0;

  const mouseMoves = Number(behavior.mouseMoves || 0);
  const mouseClicks = Number(behavior.mouseClicks || 0);
  const keyboardEvents = Number(behavior.keyboardEvents || 0);
  const firstInteraction = Number(behavior.firstInteraction || 0);
  const lastInteraction = Number(behavior.lastInteraction || 0);
  const duration = lastInteraction > firstInteraction ? lastInteraction - firstInteraction : 0;

  let score = 0;
  if (mouseMoves >= 20) score += 0.4;
  else if (mouseMoves >= 8) score += 0.25;

  if (mouseClicks >= 1) score += 0.2;

  if (keyboardEvents >= 10) score += 0.25;
  else if (keyboardEvents >= 3) score += 0.15;

  if (duration >= 2500) score += 0.2;
  else if (duration >= 1000) score += 0.1;

  if (score > 1) score = 1;
  return Number(score.toFixed(2));
}
