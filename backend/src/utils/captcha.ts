import crypto from 'crypto';

const SECRET = process.env.CAPTCHA_SECRET || 'eclipanel-captcha-secret';
const TTL_MS = 5 * 60 * 1000;

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomColor() {
  const r = randomInt(70, 180);
  const g = randomInt(70, 180);
  const b = randomInt(70, 180);
  return `rgb(${r},${g},${b})`;
}

export function generateCaptcha() {
  const a = randomInt(0, 9);
  const b = randomInt(0, 9);
  const answer = a + b;
  const expires = Date.now() + TTL_MS;

  const payload = `${answer}|${expires}`;
  const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  const token = Buffer.from(`${payload}|${signature}`).toString('base64');

  const question = `${a} + ${b}`;

  const width = 180;
  const height = 70;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;

  svg += `<rect width="100%" height="100%" fill="${randomColor()}"/>`;

  for (let i = 0; i < 20; i++) {
    svg += `<path d="M${randomInt(0, width)} ${randomInt(0, height)} C ${randomInt(0, width)} ${randomInt(0, height)} ${randomInt(0, width)} ${randomInt(0, height)} ${randomInt(0, width)} ${randomInt(0, height)}" stroke="${randomColor()}" stroke-width="${randomInt(1, 2)}" fill="none" opacity="0.4"/>`;
  }

  for (let i = 0; i < 60; i++) {
    svg += `<circle cx="${randomInt(0, width)}" cy="${randomInt(0, height)}" r="${randomInt(1, 4)}" fill="${randomColor()}" opacity="${(randomInt(30, 70) / 100).toFixed(2)}"/>`;
  }

  for (let i = 0; i < 30; i++) {
    svg += `<line x1="${randomInt(0, width)}" y1="${randomInt(0, height)}" x2="${randomInt(0, width)}" y2="${randomInt(0, height)}" stroke="${randomColor()}" stroke-width="${randomInt(1, 2)}" opacity="${(randomInt(35, 80) / 100).toFixed(2)}"/>`;
  }

  const textAngle = randomInt(-25, 25);
  const questionChars = question.split('');
  const glyphSpacing = 22;
  const startX = (width - (questionChars.length - 1) * glyphSpacing) / 2;

  questionChars.forEach((ch, idx) => {
    const charX = startX + idx * glyphSpacing;
    svg += `<text x="${charX}" y="${height / 2 + 8}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="${randomColor()}" transform="rotate(${randomInt(-15, 15)}, ${charX}, ${height / 2})">${ch}</text>`;
  });

  const label = 'ECLIPANEL CAPTCHA';
  let labelX = 10;
  for (const c of label) {
    svg += `<text x="${labelX}" y="${height - 8}" font-family="Arial, Helvetica, sans-serif" font-size="10" fill="${randomColor()}">${c}</text>`;
    labelX += 10;
  }

  for (let i = 0; i < 8; i++) {
    svg += `<line x1="${randomInt(0, width)}" y1="${randomInt(0, height)}" x2="${randomInt(0, width)}" y2="${randomInt(0, height)}" stroke="${randomColor()}" stroke-width="${randomInt(1, 2)}" opacity="${(randomInt(50, 85) / 100).toFixed(2)}"/>`;
  }

  svg += `</svg>`;
  const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

  return { token, image };
}

export function validateCaptcha(token: string, answer: number | string): boolean {
  if (!token || !answer) return false;

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
  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))) {
    return false;
  }

  return Number(answer) === Number(expectedAnswer);
}
