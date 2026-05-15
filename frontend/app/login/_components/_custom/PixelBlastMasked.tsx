import React, { useEffect, useRef } from "react";

type PixelBlastVariant = "square" | "circle" | "diamond";

type PixelBlastMaskedProps = {
  imageSrc?: string;
  variant?: PixelBlastVariant;
  pixelSize?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
  patternScale?: number;
  patternDensity?: number;
  enableRipples?: boolean;
  rippleIntensityScale?: number;
  rippleThickness?: number;
  rippleSpeed?: number;
  speed?: number;
  transparent?: boolean;
  edgeFade?: number;
};

const SHAPE_MAP: Record<PixelBlastVariant, number> = {
  square: 0,
  circle: 1,
  diamond: 3,
};

const MAX_CLICKS = 10;

const VERT_SRC = `#version 300 es
in vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;

// FBM with 5 octaves, gain=1 → amplitude sum = 5, so we divide by 5 to normalize to [0,1].
// Then: base = value * 0.5 - 0.65 maps [0,1] → [-0.65, -0.15]
// density uniform shifts this: at density=1.3 the offset adds +0.24, giving feed up to ~+0.09
// Bayer dithering (±0.5 range) then creates the scattered pixel pattern.
const FRAG_SRC = `#version 300 es
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform float uPixel;
uniform float uScale;
uniform float uDensity;
uniform vec3  uColor;
uniform int   uShape;
uniform float uEdgeFade;
uniform int   uHasMask;
uniform sampler2D uMask;
uniform vec2  uClickPos[10];
uniform float uClickTimes[10];

out vec4 fragColor;

float hash11(float n){ return fract(sin(n)*43758.5453); }

float vnoise(vec3 p){
  vec3 ip=floor(p), fp=fract(p);
  float v[8];
  for(int i=0;i<8;i++)
    v[i]=hash11(dot(ip+vec3(float(i&1),float((i>>1)&1),float((i>>2)&1)),vec3(1.0,57.0,113.0)));
  vec3 w=fp*fp*fp*(fp*(fp*6.0-15.0)+10.0);
  return mix(
    mix(mix(v[0],v[1],w.x),mix(v[2],v[3],w.x),w.y),
    mix(mix(v[4],v[5],w.x),mix(v[6],v[7],w.x),w.y),
    w.z);  // returns [0,1]
}

// Normalized FBM: 5 octaves, gain=1 → divide by octave count → [0,1]
float fbm(vec2 uv, float t){
  vec3 p   = vec3(uv * uScale, t);
  float sum = 0.0;
  float freq = 1.0;
  for(int i=0;i<5;i++){
    sum  += vnoise(p * freq);
    freq *= 1.25;
  }
  return sum / 5.0; // [0,1]
}

float Bayer2(vec2 a){a=floor(a);return fract(a.x/2.+a.y*a.y*.75);}
float Bayer4(vec2 a){return Bayer2(.5*a)*.25+Bayer2(a);}
float Bayer8(vec2 a){return Bayer4(.5*a)*.25+Bayer2(a);}

void main(){
  vec2 fc  = gl_FragCoord.xy - uRes*0.5;
  vec2 puv = fract(fc/uPixel);

  float cellSz = 8.0*uPixel;
  vec2 uv = floor(fc/cellSz)*cellSz/uRes*vec2(uRes.x/uRes.y,1.0);

  // fbm in [0,1]; shift so ~50% pixels show at density=1.0
  // base range: [0,1]*0.5 - 0.65 = [-0.65, -0.15]
  // density offset: (density - 0.5)*0.3, so density=1.0 → +0.15, density=1.3 → +0.24
  // combined range at density=1.3: [-0.41, +0.09]
  // Bayer8 adds ±0.5, so step(0.5, feed+bayer) fires for ~40-60% of pixels
  float base = fbm(uv, uTime*0.05)*0.5 - 0.65;
  float feed = base + (uDensity - 0.5)*0.3;

  for(int i=0;i<10;i++){
    vec2 pos=uClickPos[i];
    if(pos.x<0.0) continue;
    vec2 cuv=((pos-uRes*0.5)/uRes)*vec2(uRes.x/uRes.y,1.0);
    float t=max(uTime-uClickTimes[i],0.0);
    float r=distance(uv,cuv);
    float ring=exp(-pow((r-0.3*t)/0.08,2.0));
    float atten=exp(-1.0*t)*exp(-10.0*r);
    feed=max(feed,ring*atten*1.2);
  }

  // Bayer8 returns [0,1]; subtract 0.5 → [-0.5, +0.5]
  float bayer = Bayer8(fc/uPixel) - 0.5;
  float bw    = step(0.5, feed + bayer);

  float M;
  if(uShape==1){
    float r=sqrt(bw)*0.25;
    float d=length(puv-0.5)-r;
    float aa=0.5*fwidth(d);
    M=bw*(1.0-smoothstep(-aa,aa,d*2.0));
  } else if(uShape==3){
    float r=sqrt(bw)*0.564;
    M=step(abs(puv.x-0.49)+abs(puv.y-0.49),r);
  } else {
    M=bw;
  }

  if(uEdgeFade>0.0){
    vec2 n=gl_FragCoord.xy/uRes;
    float edge=min(min(n.x,n.y),min(1.0-n.x,1.0-n.y));
    M*=smoothstep(0.0,uEdgeFade,edge);
  }

  if(uHasMask==1){
    vec2 maskUV=vec2(gl_FragCoord.x/uRes.x, 1.0-gl_FragCoord.y/uRes.y);
    vec4 s=texture(uMask,maskUV);
    float maskVal = s.a > 0.01 ? s.a : (1.0-dot(s.rgb,vec3(0.299,0.587,0.114)));
    M *= 1.0 - clamp(maskVal,0.0,1.0);
  }

  vec3 col=uColor;
  vec3 srgb=mix(col*12.92,1.055*pow(col,vec3(1.0/2.4))-0.055,step(0.0031308,col));
  fragColor=vec4(srgb,M);
}`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    console.error("Shader compile error:", gl.getShaderInfoLog(s));
  return s;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

interface GLState {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  prog: WebGLProgram;
  U: Record<string, WebGLUniformLocation | null>;
  maskTex: WebGLTexture | null;
  hasMask: number;
  clickPos: Float32Array;
  clickTimes: Float32Array;
  clickIx: number;
  t: number;
  last: number;
  raf: number;
  ro: ResizeObserver;
}

const PixelBlastMasked: React.FC<PixelBlastMaskedProps> = ({
  imageSrc,
  variant = "square",
  pixelSize = 4,
  color = "#B497CF",
  className,
  style,
  patternScale = 2,
  patternDensity = 1,
  speed = 0.5,
  edgeFade = 0.05,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const glStateRef = useRef<GLState | null>(null);
  const loadedImgRef = useRef<HTMLImageElement | null>(null);

  // Live prop refs — no re-init on prop change
  const speedRef = useRef(speed);
  const pixelSizeRef = useRef(pixelSize);
  const patternScaleRef = useRef(patternScale);
  const patternDensityRef = useRef(patternDensity);
  const edgeFadeRef = useRef(edgeFade);
  const variantRef = useRef(variant);
  const colorRef = useRef(color);
  const imageSrcRef = useRef(imageSrc);

  speedRef.current = speed;
  pixelSizeRef.current = pixelSize;
  patternScaleRef.current = patternScale;
  patternDensityRef.current = patternDensity;
  edgeFadeRef.current = edgeFade;
  variantRef.current = variant;
  colorRef.current = color;
  imageSrcRef.current = imageSrc;

  const uploadMask = (img: HTMLImageElement) => {
    const state = glStateRef.current;
    if (!state) return;
    const { gl, canvas } = state;
    const cw = canvas.width,
      ch = canvas.height;

    const off = document.createElement("canvas");
    off.width = cw;
    off.height = ch;
    const ctx = off.getContext("2d")!;
    ctx.clearRect(0, 0, cw, ch);

    const aspect = img.naturalWidth / img.naturalHeight;
    let dw: number, dh: number;
    if (aspect > cw / ch) {
      dw = cw * 0.45;
      dh = dw / aspect;
    } else {
      dh = ch * 0.45;
      dw = dh * aspect;
    }
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);

    if (state.maskTex) gl.deleteTexture(state.maskTex);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, off);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    state.maskTex = tex;
    state.hasMask = 1;
  };

  const loadMask = (src: string) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      loadedImgRef.current = img;
      uploadMask(img);
    };
    img.onerror = () => console.warn("[PixelBlastMasked] Failed to load:", src);
    img.src = src;
  };

  useEffect(() => {
    const container = containerRef.current!;
    const canvas = document.createElement("canvas");
    canvas.style.cssText =
      "position:absolute;top:0;left:0;width:100%;height:100%;";
    container.appendChild(canvas);

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
    })!;
    if (!gl) {
      container.textContent = "WebGL2 not supported";
      return;
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      console.error("Link error:", gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    const vbuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const U: Record<string, WebGLUniformLocation | null> = {};
    [
      "uRes",
      "uTime",
      "uPixel",
      "uScale",
      "uDensity",
      "uColor",
      "uShape",
      "uEdgeFade",
      "uHasMask",
      "uMask",
      "uClickPos",
      "uClickTimes",
    ].forEach((n) => {
      U[n] = gl.getUniformLocation(prog, n);
    });

    const clickPos = new Float32Array(MAX_CLICKS * 2).fill(-1);
    const clickTimes = new Float32Array(MAX_CLICKS);

    function syncSize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const nw = Math.round((container.clientWidth || 300) * dpr);
      const nh = Math.round((container.clientHeight || 300) * dpr);
      if (canvas.width === nw && canvas.height === nh) return;
      canvas.width = nw;
      canvas.height = nh;
      gl.viewport(0, 0, nw, nh);
      if (loadedImgRef.current) uploadMask(loadedImgRef.current);
    }
    syncSize();

    const ro = new ResizeObserver(syncSize);
    ro.observe(container);

    glStateRef.current = {
      gl,
      canvas,
      prog,
      U,
      maskTex: null,
      hasMask: 0,
      clickPos,
      clickTimes,
      clickIx: 0,
      t: Math.random() * 1000,
      last: performance.now(),
      raf: 0,
      ro,
    };

    function canvasXY(e: PointerEvent): [number, number] {
      const rect = canvas.getBoundingClientRect();
      return [
        (e.clientX - rect.left) * (canvas.width / rect.width),
        canvas.height - (e.clientY - rect.top) * (canvas.height / rect.height),
      ];
    }
    function addClick(e: PointerEvent) {
      const s = glStateRef.current;
      if (!s) return;
      const [x, y] = canvasXY(e);
      s.clickPos[s.clickIx * 2] = x;
      s.clickPos[s.clickIx * 2 + 1] = y;
      s.clickTimes[s.clickIx] = s.t;
      s.clickIx = (s.clickIx + 1) % MAX_CLICKS;
    }
    canvas.addEventListener("pointerdown", addClick, { passive: true });
    canvas.addEventListener(
      "pointermove",
      (e: PointerEvent) => {
        if (e.buttons) addClick(e);
      },
      { passive: true },
    );

    if (imageSrcRef.current) loadMask(imageSrcRef.current);

    function frame(now: number) {
      const s = glStateRef.current;
      if (!s) return;
      s.raf = requestAnimationFrame(frame);
      s.t += ((now - s.last) / 1000) * speedRef.current * 3;
      s.last = now;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, s.t);
      gl.uniform1f(U.uPixel, pixelSizeRef.current * dpr);
      gl.uniform1f(U.uScale, patternScaleRef.current);
      gl.uniform1f(U.uDensity, patternDensityRef.current);
      gl.uniform1f(U.uEdgeFade, edgeFadeRef.current);
      gl.uniform1i(U.uShape, SHAPE_MAP[variantRef.current] ?? 0);
      gl.uniform1i(U.uHasMask, s.hasMask);

      const [r, g, b] = hexToRgb(colorRef.current);
      gl.uniform3f(U.uColor, r, g, b);

      if (s.hasMask && s.maskTex) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, s.maskTex);
        gl.uniform1i(U.uMask, 0);
      }

      const cp: number[] = [];
      for (let i = 0; i < MAX_CLICKS; i++)
        cp.push(s.clickPos[i * 2], s.clickPos[i * 2 + 1]);
      gl.uniform2fv(U.uClickPos, cp);
      gl.uniform1fv(U.uClickTimes, s.clickTimes);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    glStateRef.current.raf = requestAnimationFrame(frame);

    return () => {
      const s = glStateRef.current;
      if (!s) return;
      cancelAnimationFrame(s.raf);
      s.ro.disconnect();
      if (s.maskTex) gl.deleteTexture(s.maskTex);
      gl.deleteProgram(prog);
      canvas.remove();
      glStateRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!imageSrc) {
      const s = glStateRef.current;
      if (s?.maskTex) {
        s.gl.deleteTexture(s.maskTex);
        s.maskTex = null;
      }
      if (s) s.hasMask = 0;
      loadedImgRef.current = null;
      return;
    }
    if (glStateRef.current) loadMask(imageSrc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full relative overflow-hidden ${className ?? ""}`}
      style={style}
      aria-label="PixelBlast interactive background"
    />
  );
};

export default PixelBlastMasked;
