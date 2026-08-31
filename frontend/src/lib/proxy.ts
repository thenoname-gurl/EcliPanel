import { safePathSegment, safeUrl } from "../../lib/url-utils";

const BACKEND_URL = ((typeof process !== "undefined" && (process.env as any)?.BACKEND_URL) || "").replace(/\/+$/, "");

export async function proxyRequest(request: Request, targetPath: string): Promise<Response> {
  if (!BACKEND_URL) {
    return new Response(JSON.stringify({ error: "Backend not configured" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const safePath = safePathSegment(targetPath);
  const safeSearch = url.search.replace(/[\x00-\x1f\x7f]/g, "");
  const targetUrl = safeUrl(BACKEND_URL, safePath, safeSearch);

  try {
    const headers = new Headers();
    const cookie = request.headers.get("cookie");
    if (cookie) headers.set("cookie", cookie);
    const auth = request.headers.get("authorization");
    if (auth) headers.set("authorization", auth);
    const ct = request.headers.get("content-type");
    if (ct) headers.set("content-type", ct);
    const origin = request.headers.get("origin");
    if (origin) headers.set("origin", origin);
    const accept = request.headers.get("accept");
    if (accept) headers.set("accept", accept);
    for (const h of ["cf-connecting-ip", "cf-connecting-ipv6", "x-forwarded-for", "x-real-ip", "x-csrf-token", "x-api-key", "x-forwarded-proto", "x-forwarded-host", "host"]) {
      const v = request.headers.get(h);
      if (v) headers.set(h, v);
    }

    const isMultipart = (ct || "").includes("multipart/form-data");
    const body = request.method !== "GET" && request.method !== "HEAD"
      ? isMultipart ? await request.arrayBuffer() : await request.text()
      : undefined;

    const res = await fetch(targetUrl, { method: request.method, headers, body });

    const resHeaders = new Headers();
    res.headers.forEach((v, k) => {
      if (k.toLowerCase() === "set-cookie") return;
      resHeaders.set(k, v);
    });
    const setCookies = res.headers.getSetCookie?.();
    if (setCookies && setCookies.length) {
      for (const c of setCookies) resHeaders.append("set-cookie", c);
    }

    return new Response(res.body, { status: res.status, headers: resHeaders });
  } catch {
    return new Response(JSON.stringify({ error: "Backend unreachable" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}