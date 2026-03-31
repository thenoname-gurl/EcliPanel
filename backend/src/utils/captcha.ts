import crypto from 'crypto';

const SECRET = process.env.CAPTCHA_SECRET;
const TTL_MS = 5 * 60 * 1000;

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number) {
  return Math.random() * (max - min) + min;
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

  svg += `<text 
    x="0" y="0" 
    text-anchor="middle" 
    font-family="${font}" 
    font-size="${size + randomInt(0, 4)}" 
    font-weight="${weight}"
    font-style="${style}"
    fill="${similarColor(color, 40)}" 
    opacity="${randomFloat(0.1, 0.3)}"
    transform="${transform} translate(${randomInt(-3, 3)}, ${randomInt(-3, 3)})"
    filter="url(#blur${id})"
  >${escapedChar}</text>`;
  
  svg += `<text 
    x="0" y="0" 
    text-anchor="middle" 
    font-family="${font}" 
    font-size="${size}" 
    font-weight="${weight}"
    font-style="${style}"
    fill="url(#grad${id})" 
    stroke="${similarColor(color, 50)}"
    stroke-width="${randomFloat(0.3, 1.2)}"
    transform="${transform}"
  >${escapedChar}</text>`;
  
  if (Math.random() > 0.5) {
    svg += `<line 
      x1="${x - size/2}" y1="${y + randomInt(-size/3, size/3)}" 
      x2="${x + size/2}" y2="${y + randomInt(-size/3, size/3)}" 
      stroke="${similarColor(color, 60)}" 
      stroke-width="${randomFloat(1, 2.5)}" 
      opacity="${randomFloat(0.4, 0.7)}"
      transform="rotate(${randomInt(-20, 20)}, ${x}, ${y})"
    />`;
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
    
    svg += `<text 
      x="${x}" y="${y}" 
      text-anchor="middle" 
      font-family="${font}" 
      font-size="${size}" 
      fill="${randomColor(80, 200)}" 
      opacity="${opacity}"
      transform="rotate(${rotation}, ${x}, ${y})"
    >${escapeXml(char)}</text>`;
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
    
    svg += `<path 
      d="${path}" 
      stroke="${randomColor()}" 
      stroke-width="${randomFloat(1, 3)}" 
      fill="none" 
      opacity="${randomFloat(0.2, 0.5)}"
    />`;
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
    svg += `<rect 
      x="${x}" y="${y}" 
      width="${w}" height="${h}" 
      fill="${randomColor()}" 
      opacity="${randomFloat(0.1, 0.4)}"
      transform="rotate(${rotation}, ${x + w/2}, ${y + h/2})"
    />`;
  }
  
  for (let i = 0; i < randomInt(10, 25); i++) {
    const x = randomInt(0, width);
    const y = randomInt(0, height);
    const size = randomInt(3, 10);
    const points = `${x},${y - size} ${x - size},${y + size} ${x + size},${y + size}`;
    svg += `<polygon 
      points="${points}" 
      fill="${randomColor()}" 
      opacity="${randomFloat(0.1, 0.35)}"
      transform="rotate(${randomInt(0, 360)}, ${x}, ${y})"
    />`;
  }
  
  return svg;
}

function generateBezierCurves(width: number, height: number) {
  let svg = '';
  
  for (let i = 0; i < randomInt(15, 30); i++) {
    const x1 = randomInt(0, width);
    const y1 = randomInt(0, height);
    const cx1 = randomInt(0, width);
    const cy1 = randomInt(0, height);
    const cx2 = randomInt(0, width);
    const cy2 = randomInt(0, height);
    const x2 = randomInt(0, width);
    const y2 = randomInt(0, height);
    
    svg += `<path 
      d="M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}" 
      stroke="${randomColor()}" 
      stroke-width="${randomFloat(0.5, 2.5)}" 
      fill="none" 
      opacity="${randomFloat(0.2, 0.6)}"
    />`;
  }
  
  return svg;
}

function generateGridInterference(width: number, height: number) {
  let svg = '';
  
  const gridSize = randomInt(8, 15);
  const offset = randomInt(0, gridSize);
  
  for (let x = offset; x < width; x += gridSize + randomInt(-2, 2)) {
    const wobble = randomInt(-3, 3);
    svg += `<line 
      x1="${x + wobble}" y1="0" 
      x2="${x - wobble}" y2="${height}" 
      stroke="${randomColor(100, 200)}" 
      stroke-width="${randomFloat(0.3, 1)}" 
      opacity="${randomFloat(0.05, 0.15)}"
    />`;
  }
  
  for (let y = offset; y < height; y += gridSize + randomInt(-2, 2)) {
    const wobble = randomInt(-3, 3);
    svg += `<line 
      x1="0" y1="${y + wobble}" 
      x2="${width}" y2="${y - wobble}" 
      stroke="${randomColor(100, 200)}" 
      stroke-width="${randomFloat(0.3, 1)}" 
      opacity="${randomFloat(0.05, 0.15)}"
    />`;
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
    
    svg += `<text 
      x="${x}" y="${y}" 
      text-anchor="middle" 
      font-family="Arial" 
      font-size="${size}" 
      fill="${randomColor()}" 
      opacity="${randomFloat(0.08, 0.18)}"
      transform="rotate(${rotation}, ${x}, ${y})"
    >${escapeXml(fake)}</text>`;
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
    
    svg += `<path 
      d="${path}" 
      stroke="${randomColor()}" 
      stroke-width="${randomFloat(1, 2.5)}" 
      fill="none" 
      opacity="${randomFloat(0.3, 0.6)}"
    />`;
  }
  
  return svg;
}

export function generateCaptcha() {
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
    svg += `<path 
      d="M ${randomInt(0, width)} ${randomInt(0, height)} Q ${randomInt(0, width)} ${randomInt(0, height)}, ${randomInt(0, width)} ${randomInt(0, height)}" 
      stroke="${randomColor()}" 
      stroke-width="${randomFloat(1, 2)}" 
      fill="none" 
      opacity="${randomFloat(0.3, 0.6)}"
    />`;
  }
  
  const watermarks = ["ECLIPANEL", "VERIFY", "CAPTCHA", "HUMAN"];
  const corruptChars = "@#$%&*~?!<>{}[]|";
  
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
    
    svg += `<text 
      x="${x}" y="${y}" 
      text-anchor="middle" 
      font-family="Arial" 
      font-size="${size}" 
      fill="${randomColor()}" 
      opacity="${randomFloat(0.1, 0.25)}"
      transform="rotate(${rotation}, ${x}, ${y})"
    >${escapeXml(corrupted)}</text>`;
  }
  
  for (let i = 0; i < randomInt(50, 100); i++) {
    const x = randomInt(0, width);
    const y = randomInt(0, height);
    svg += `<circle cx="${x}" cy="${y}" r="${randomFloat(0.3, 1.5)}" fill="${randomColor()}" opacity="${randomFloat(0.2, 0.5)}"/>`;
  }
  
  for (let i = 0; i < randomInt(8, 15); i++) {
    const edge = randomInt(0, 3);
    let x1, y1, x2, y2;
    
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

  return { token, image };
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