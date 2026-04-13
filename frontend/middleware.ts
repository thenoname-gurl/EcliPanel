import { NextRequest, NextResponse } from 'next/server';

const VERIFIED_COOKIE = '__browser_check_verified';
const COOKIE_MAX_AGE = 60 * 60;

const bypassPaths = [
  '/api',
  '/health',
  '/uploads',
  '/public',
  '/_next',
  '/static',
  '/favicon.ico',
  '/robots.txt',
];

function shouldBypass(pathname: string) {
  if (bypassPaths.some((prefix) => pathname.startsWith(prefix))) return true;
  return pathname.match(/\.(js|css|png|jpg|jpeg|webp|svg|ico|json|xml|txt|woff2?)$/i) !== null;
}

function isHtmlRequest(request: NextRequest) {
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

function browserCheckPage(url: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Verifying your browser...</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#e2e8f0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden}

body::before{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,0.1) 0px,rgba(0,0,0,0.1) 1px,transparent 1px,transparent 2px);pointer-events:none;z-index:0}
.grid-bg{position:fixed;inset:0;background:linear-gradient(rgba(168,85,247,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(168,85,247,0.03) 1px,transparent 1px);background-size:50px 50px;z-index:0}
.glow-top{position:fixed;inset:0;background:radial-gradient(ellipse at top,rgba(168,85,247,0.15),transparent 50%);z-index:0}
.glow-bottom{position:fixed;inset:0;background:radial-gradient(ellipse at bottom right,rgba(147,51,234,0.1),transparent 50%);z-index:0}

.wrap{position:relative;z-index:10;width:100%;max-width:480px;padding:1.5rem}

.card{border-radius:0.5rem;border:1px solid rgba(168,85,247,0.2);background:rgba(0,0,0,0.6);padding:1.25rem;backdrop-filter:blur(8px)}
.titlebar{display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem}
.dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.dot-r{background:#ef4444}.dot-y{background:#eab308}.dot-g{background:#22c55e}
.terminal-label{margin-left:0.5rem;font-size:0.7rem;color:rgba(192,132,252,0.5)}

.prompt{color:#6b7280;font-size:0.75rem;margin-bottom:0.75rem}
.line{font-size:0.8rem;margin:0.25rem 0;line-height:1.6}
.key{color:#f472b6}
.val{color:#a78bfa}
.val-ok{color:#34d399}

.spinner-row{display:flex;align-items:center;gap:0.75rem;margin:1rem 0 0.5rem}
.spinner{width:14px;height:14px;border:2px solid rgba(168,85,247,0.2);border-top-color:#a78bfa;border-radius:50%;animation:spin .8s linear infinite;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}
.spinner-text{font-size:0.75rem;color:rgba(192,132,252,0.7)}

.cursor{display:inline-block;animation:blink 1s step-end infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}

.binary{margin-top:1.25rem;font-size:0.55rem;color:rgba(168,85,247,0.25);word-break:break-all;user-select:none;line-height:1.4;letter-spacing:0.05em}

.retry-row{margin-top:1rem;font-size:0.7rem;color:rgba(168,85,247,0.5)}
.retry-row a{color:#f472b6;text-decoration:underline}
</style>
</head>
<body>
<div class="grid-bg"></div>
<div class="glow-top"></div>
<div class="glow-bottom"></div>

<div class="wrap">
  <div class="card">
    <div class="titlebar">
      <div class="dot dot-r"></div>
      <div class="dot dot-y"></div>
      <div class="dot dot-g"></div>
      <span class="terminal-label">Terminal</span>
    </div>

    <p class="prompt">eclipse@systems ~ % ./verify --browser</p>

    <div class="line"><span class="key">checking</span> <span class="val">javascript_engine</span></div>
    <div class="line"><span class="key">setting</span> <span class="val">session_token</span></div>

    <div class="spinner-row">
      <div class="spinner"></div>
      <span class="spinner-text">Verifying your browser<span class="cursor">_</span></span>
    </div>

    <div class="line" style="margin-top:0.5rem">
      <span class="key">status</span>
      <span class="val-ok" id="status-val"> CHECKING</span>
    </div>

    <div class="binary" id="binary"></div>
  </div>

  <p class="retry-row">Not redirected? <a id="retry" href="${url}">Reload</a></p>
</div>

<script>
(function(){
  var b='',chars='01';
  for(var i=0;i<180;i++) b+=chars[Math.random()>.5?1:0];
  document.getElementById('binary').textContent=b;

  var name='${VERIFIED_COOKIE}';
  var age=${COOKIE_MAX_AGE};
  document.cookie=name+'=1; Path=/; Max-Age='+age+'; SameSite=Lax; Secure';

  var url=location.href;
  document.getElementById('retry').href=url;
  document.getElementById('status-val').textContent=' VERIFIED';

  setTimeout(function(){ window.location.replace(url); }, 250);
})();
</script>
</body>
</html>`;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (shouldBypass(pathname)) return NextResponse.next();

  if (request.cookies.get(VERIFIED_COOKIE)?.value === '1') return NextResponse.next();

  if (!isHtmlRequest(request)) return NextResponse.next();

  return new NextResponse(browserCheckPage(request.nextUrl.href), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export const config = {
  matcher: ['/((?!_next/|static/|api/|uploads/|public/).*)'],
};