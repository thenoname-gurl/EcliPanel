import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(
  process.env.BROWSER_CHECK_SECRET ?? 'change-me-to-a-random-64-char-string-pls'
);
const VERIFIED_COOKIE = '__browser_verified';
const CHALLENGE_COOKIE = '__browser_challenge';
const COOKIE_MAX_AGE = 60 * 60;
const CHALLENGE_EXPIRY = 120;
const POW_DIFFICULTY = 4;
const RATE_LIMIT = 10;
const RATE_WINDOW = 60_000;

const BYPASS_PATHS = [
  '/api/browser-verify',
  '/api',
  '/health',
  '/uploads',
  '/public',
  '/_next',
  '/static',
  '/favicon.ico',
  '/robots.txt',
];

const STATIC_EXT =
  /\.(js|css|png|jpg|jpeg|webp|svg|ico|json|xml|txt|woff2?|ttf|eot|map)$/i;

const HEADLESS_RENDERERS = ['swiftshader', 'llvmpipe', 'mesa'];

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const usedChallenges = new Set<string>();

function shouldBypass(pathname: string): boolean {
  if (BYPASS_PATHS.some((p) => pathname.startsWith(p))) return true;
  return STATIC_EXT.test(pathname);
}

function isHtmlRequest(req: NextRequest): boolean {
  return (req.headers.get('accept') ?? '').includes('text/html');
}

function isGoogleBot(req: NextRequest): boolean {
  const ua = (req.headers.get('user-agent') ?? '').toLowerCase();
  return ua.includes('googlebot') || ua.includes('adsbot-google') || ua.includes('mediapartners-google');
}

function getIP(req: NextRequest): string {
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  const cfConnectingIpv6 = req.headers.get('cf-connecting-ipv6');
  const xForwardedFor = req.headers
    .get('x-forwarded-for')
    ?.split(',')[0]
    ?.trim();
  const xRealIp = req.headers.get('x-real-ip');

  if (cfConnectingIpv6) {
    return cfConnectingIpv6;
  }

  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  if (xForwardedFor) {
    return xForwardedFor;
  }

  if (xRealIp) {
    return xRealIp;
  }

  return 'unknown';
}

function randomHex(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(data)
  );
  return Array.from(new Uint8Array(buf), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function pruneRateLimitMap() {
  const now = Date.now();
  for (const [key, val] of rateLimitMap) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
}

function markChallengeUsed(id: string) {
  usedChallenges.add(id);
  if (usedChallenges.size > 50_000) {
    const iter = usedChallenges.values();
    for (let i = 0; i < 25_000; i++) {
      const v = iter.next().value;
      if (v) usedChallenges.delete(v);
    }
  }
}

async function createChallengeToken(ip: string) {
  const challengeId = randomHex(32);
  const token = await new SignJWT({ challengeId, ip, type: 'challenge' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${CHALLENGE_EXPIRY}s`)
    .sign(SECRET);
  return { challengeId, token };
}

async function createVerifiedToken(ip: string): Promise<string> {
  return new SignJWT({ ip, verified: true, type: 'verified' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${COOKIE_MAX_AGE}s`)
    .sign(SECRET);
}

async function isAlreadyVerified(
  cookieValue: string | undefined,
  ip: string
): Promise<boolean> {
  if (!cookieValue) return false;
  try {
    const { payload } = await jwtVerify(cookieValue, SECRET);
    return (
      payload.type === 'verified' &&
      payload.ip === ip &&
      payload.verified === true
    );
  } catch {
    return false;
  }
}

interface BrowserSignals {
  screen?: string;
  depth?: number;
  tz?: string;
  lang?: string;
  platform?: string;
  cores?: number;
  touch?: boolean;
  webgl?: string;
  canvas?: string;
}

function analyzeSignals(signals: BrowserSignals | undefined): {
  suspicious: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (!signals) return { suspicious: true, reasons: ['no_signals'] };

  if (signals.webgl === 'none' || signals.webgl === 'error')
    reasons.push('no_webgl');
  if (!signals.cores || signals.cores === 0)
    reasons.push('no_hardware_concurrency');
  if (!signals.tz || signals.tz === 'undefined')
    reasons.push('no_timezone');
  if (!signals.lang)
    reasons.push('no_language');
  if (
    signals.webgl &&
    HEADLESS_RENDERERS.some((r) => signals.webgl!.toLowerCase().includes(r))
  )
    reasons.push('headless_webgl_renderer');

  return { suspicious: reasons.length >= 2, reasons };
}

function buildChallengePage(
  challengeId: string,
  challengeToken: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Verifying your browser...</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#e2e8f0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden}
body::before{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.1) 0px,rgba(0,0,0,.1) 1px,transparent 1px,transparent 2px);pointer-events:none;z-index:0}
.grid-bg{position:fixed;inset:0;background:linear-gradient(rgba(168,85,247,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(168,85,247,.03) 1px,transparent 1px);background-size:50px 50px;z-index:0}
.glow-top{position:fixed;inset:0;background:radial-gradient(ellipse at top,rgba(168,85,247,.15),transparent 50%);z-index:0}
.glow-bottom{position:fixed;inset:0;background:radial-gradient(ellipse at bottom right,rgba(147,51,234,.1),transparent 50%);z-index:0}
.wrap{position:relative;z-index:10;width:100%;max-width:480px;padding:1.5rem}
.card{border-radius:.5rem;border:1px solid rgba(168,85,247,.2);background:rgba(0,0,0,.6);padding:1.25rem;backdrop-filter:blur(8px)}
.titlebar{display:flex;align-items:center;gap:.5rem;margin-bottom:1rem}
.dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.dot-r{background:#ef4444}.dot-y{background:#eab308}.dot-g{background:#22c55e}
.tlabel{margin-left:.5rem;font-size:.7rem;color:rgba(192,132,252,.5)}
.prompt{color:#6b7280;font-size:.75rem;margin-bottom:.75rem}
.line{font-size:.8rem;margin:.25rem 0;line-height:1.6}
.key{color:#f472b6}
.val{color:#a78bfa}
.val-ok{color:#34d399}
.val-err{color:#ef4444}
.spinner-row{display:flex;align-items:center;gap:.75rem;margin:1rem 0 .5rem}
.spinner{width:14px;height:14px;border:2px solid rgba(168,85,247,.2);border-top-color:#a78bfa;border-radius:50%;animation:spin .8s linear infinite;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}
.stext{font-size:.75rem;color:rgba(192,132,252,.7)}
.cursor{display:inline-block;animation:blink 1s step-end infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
.bar-wrap{margin-top:.75rem;height:3px;background:rgba(168,85,247,.15);border-radius:2px;overflow:hidden}
.bar-fill{height:100%;width:0%;background:linear-gradient(90deg,#a78bfa,#f472b6);border-radius:2px;transition:width .3s}
.binary{margin-top:1.25rem;font-size:.55rem;color:rgba(168,85,247,.25);word-break:break-all;user-select:none;line-height:1.4;letter-spacing:.05em}
.retry-row{margin-top:1rem;font-size:.7rem;color:rgba(168,85,247,.5)}
.retry-row a{color:#f472b6;text-decoration:underline;cursor:pointer}
noscript div{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:.375rem;padding:1rem;margin-top:1rem;font-size:.8rem;color:#fca5a5;text-align:center}
</style>
</head>
<body>
<div class="grid-bg"></div><div class="glow-top"></div><div class="glow-bottom"></div>
<div class="wrap">
  <div class="card">
    <div class="titlebar">
      <div class="dot dot-r"></div><div class="dot dot-y"></div><div class="dot dot-g"></div>
      <span class="tlabel">security</span>
    </div>
    <p class="prompt">eclipse@systems ~ % ./verify --browser --pow</p>
    <div class="line"><span class="key">challenge </span> <span class="val">${challengeId.slice(0, 16)}...</span></div>
    <div class="line"><span class="key">difficulty</span> <span class="val">${POW_DIFFICULTY} leading zeros</span></div>
    <div class="line"><span class="key">hashing   </span> <span class="val" id="hc">0</span></div>
    <div class="spinner-row">
      <div class="spinner" id="sp"></div>
      <span class="stext" id="st">Solving proof-of-work<span class="cursor">_</span></span>
    </div>
    <div class="bar-wrap"><div class="bar-fill" id="bar"></div></div>
    <div class="line" style="margin-top:.5rem">
      <span class="key">status </span>
      <span id="sv" class="val"> COMPUTING</span>
    </div>
    <div class="binary" id="bin"></div>
  </div>
  <p class="retry-row">Stuck? <a onclick="location.reload()">Reload</a></p>
  <noscript><div>JavaScript is required to verify your browser. Please enable it and reload.</div></noscript>
</div>
<script>
(function(){
  var b='';for(var i=0;i<200;i++)b+='01'[Math.random()>.5?1:0];
  document.getElementById('bin').textContent=b;

  var CID='${challengeId}';
  var TOKEN='${challengeToken}';
  var DIFF=${POW_DIFFICULTY};
  var URL=location.href;
  var PREFIX='';for(var i=0;i<DIFF;i++)PREFIX+='0';
  var VERIFY_ENDPOINT='/api/browser-verify';

  var elHC=document.getElementById('hc');
  var elSV=document.getElementById('sv');
  var elST=document.getElementById('st');
  var elBar=document.getElementById('bar');
  var elSp=document.getElementById('sp');

  var signals={
    screen:screen.width+'x'+screen.height,
    depth:screen.colorDepth,
    tz:Intl.DateTimeFormat().resolvedOptions().timeZone,
    lang:navigator.language,
    platform:navigator.platform,
    cores:navigator.hardwareConcurrency||0,
    touch:'ontouchstart' in window,
    webgl:(function(){
      try{
        var c=document.createElement('canvas');
        var gl=c.getContext('webgl')||c.getContext('experimental-webgl');
        if(!gl)return'none';
        var ext=gl.getExtension('WEBGL_debug_renderer_info');
        return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'generic';
      }catch(e){return'error';}
    })(),
    canvas:(function(){
      try{
        var c=document.createElement('canvas');c.width=200;c.height=50;
        var ctx=c.getContext('2d');
        ctx.textBaseline='top';ctx.font='14px Arial';
        ctx.fillText('browser-check-fp',2,2);
        return c.toDataURL().slice(-32);
      }catch(e){return'error';}
    })()
  };

  async function sha256(str){
    var buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
    var arr=new Uint8Array(buf);
    var hex='';for(var i=0;i<arr.length;i++)hex+=arr[i].toString(16).padStart(2,'0');
    return hex;
  }

  async function solve(){
    var nonce=0;
    var batch=5000;
    var max=50000000;

    while(nonce<max){
      for(var i=0;i<batch;i++){
        var h=await sha256(CID+':'+nonce);
        if(h.startsWith(PREFIX)){
          elBar.style.width='100%';
          elSV.textContent=' SOLVED';
          elSV.className='val-ok';
          elST.innerHTML='Verifying with server<span class="cursor">_</span>';
          await submit(String(nonce));
          return;
        }
        nonce++;
      }
      elHC.textContent=nonce.toLocaleString();
      elBar.style.width=Math.min((nonce/200000)*100,95)+'%';
      await new Promise(function(r){setTimeout(r,0);});
    }

    elSV.textContent=' FAILED';
    elSV.className='val-err';
    elST.textContent='Challenge failed — please reload.';
    elSp.style.display='none';
  }

  async function submit(nonce){
    try{
      var res=await fetch(VERIFY_ENDPOINT,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({token:TOKEN,nonce:nonce,signals:signals})
      });
      var data=await res.json();
      if(data.success){
        elSV.textContent=' VERIFIED';
        elSV.className='val-ok';
        elST.innerHTML='Redirecting<span class="cursor">_</span>';
        elSp.style.display='none';
        setTimeout(function(){window.location.replace(URL);},350);
      }else{
        elSV.textContent=' REJECTED';
        elSV.className='val-err';
        elST.textContent='Failed: '+(data.error||'unknown');
        elSp.style.display='none';
      }
    }catch(e){
      elSV.textContent=' ERROR';
      elSV.className='val-err';
      elST.textContent='Network error - please reload.';
      elSp.style.display='none';
    }
  }

  solve();
})();
</script>
</body>
</html>`;
}

async function handleVerify(req: NextRequest): Promise<NextResponse> {
  const ip = getIP(req);

  pruneRateLimitMap();

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { success: false, error: 'rate_limited' },
      { status: 429 }
    );
  }

  let body: { token?: string; nonce?: string; signals?: BrowserSignals };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'invalid_json' },
      { status: 400 }
    );
  }

  const { token, nonce, signals } = body;

  if (!token || nonce === undefined) {
    return NextResponse.json(
      { success: false, error: 'missing_fields' },
      { status: 400 }
    );
  }

  let payload: Record<string, unknown>;
  try {
    const result = await jwtVerify(token, SECRET);
    payload = result.payload as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: 'invalid_or_expired_token' },
      { status: 400 }
    );
  }

  if (payload.type !== 'challenge') {
    return NextResponse.json(
      { success: false, error: 'invalid_token_type' },
      { status: 400 }
    );
  }

  if (payload.ip !== ip) {
    return NextResponse.json(
      { success: false, error: 'ip_mismatch' },
      { status: 403 }
    );
  }

  const challengeId = payload.challengeId as string;

  if (usedChallenges.has(challengeId)) {
    return NextResponse.json(
      { success: false, error: 'challenge_already_used' },
      { status: 400 }
    );
  }

  const hash = await sha256Hex(`${challengeId}:${nonce}`);
  if (!hash.startsWith('0'.repeat(POW_DIFFICULTY))) {
    return NextResponse.json(
      { success: false, error: 'invalid_proof_of_work' },
      { status: 400 }
    );
  }

  const { suspicious, reasons } = analyzeSignals(signals);
  if (suspicious) {
    return NextResponse.json(
      { success: false, error: 'suspicious_browser', reasons },
      { status: 403 }
    );
  }

  markChallengeUsed(challengeId);

  const verifiedToken = await createVerifiedToken(ip);

  const res = NextResponse.json({ success: true });

  res.cookies.set(VERIFIED_COOKIE, verifiedToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });

  res.cookies.delete(CHALLENGE_COOKIE);

  return res;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  if (pathname === '/api/browser-verify' && req.method === 'POST') { //was lazy to make new file
    return handleVerify(req);
  }

  if (shouldBypass(pathname)) return NextResponse.next();

  if (isGoogleBot(req)) return NextResponse.next();

  if (!isHtmlRequest(req)) return NextResponse.next();

  const verifiedCookie = req.cookies.get(VERIFIED_COOKIE)?.value;
  const ip = getIP(req);

  if (await isAlreadyVerified(verifiedCookie, ip)) {
    return NextResponse.next();
  }

  const { challengeId, token } = await createChallengeToken(ip);

  const res = new NextResponse(
    buildChallengePage(challengeId, token),
    {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate',
        'x-robots-tag': 'noindex, nofollow',
      },
    }
  );

  res.cookies.set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: CHALLENGE_EXPIRY,
    path: '/',
  });

  return res;
}

export const config = {
  matcher: ['/((?!_next/|static/|uploads/|public/).*)'],
};