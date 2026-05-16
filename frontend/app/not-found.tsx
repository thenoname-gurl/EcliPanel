"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";

const chars = ".,-~:;=!*#$@";

export default function NotFound() {
  const { isLoggedIn } = useAuth();
  const router = useRouter();
  const canvasRef = useRef<HTMLPreElement>(null);
  const A = useRef(0);
  const B = useRef(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    A.current = 0;
    B.current = 0;

    const cvs = canvas as HTMLPreElement;

    function render() {
      const fontSize = Math.max(8, Math.min(14, window.innerWidth / 80));
      const charWidth = fontSize * 0.6;
      const charHeight = fontSize * 1.2;
      const width = Math.floor(window.innerWidth / charWidth);
      const height = Math.floor(window.innerHeight / charHeight);

      cvs.style.fontSize = fontSize + "px";
      cvs.style.lineHeight = charHeight + "px";
      cvs.style.letterSpacing = "0px";

      const b = new Array(width * height).fill(" ");
      const z = new Array(width * height).fill(0);
      const sinA = Math.sin(A.current);
      const cosA = Math.cos(A.current);
      const sinB = Math.sin(B.current);
      const cosB = Math.cos(B.current);
      const chipRadius = 2.5;
      const waveHeight = 0.4;
      const K2 = 5;
      const K1 = Math.min(width, height * 2) * K2 * 0.15;

      for (let u = -1; u <= 1; u += 0.03) {
        for (let v = -1; v <= 1; v += 0.03) {
          if (u * u + v * v > 1) continue;

          const x0 = u * chipRadius;
          const y0 = v * chipRadius * 0.7;
          const z0 = waveHeight * (u * u - v * v);
          const x1 = x0;
          const y1 = y0 * cosA - z0 * sinA;
          const z1 = y0 * sinA + z0 * cosA;
          const x2 = x1 * cosB + z1 * sinB;
          const y2 = y1;
          const z2 = -x1 * sinB + z1 * cosB + K2;
          const ooz = 1 / z2;
          const xp = Math.floor(width / 2 + K1 * ooz * x2);
          const yp = Math.floor(height / 2 - K1 * ooz * y2);
          const nx0 = (-2 * waveHeight * u) / chipRadius;
          const ny0 = (2 * waveHeight * v) / (chipRadius * 0.7);
          const nz0 = 1;
          const nLen = Math.sqrt(nx0 * nx0 + ny0 * ny0 + nz0 * nz0);
          const nx = nx0 / nLen;
          const ny = ny0 / nLen;
          const nz = nz0 / nLen;
          const ny1 = ny * cosA - nz * sinA;
          const nz1 = ny * sinA + nz * cosA;
          const nx2 = nx * cosB + nz1 * sinB;
          const nz2 = -nx * sinB + nz1 * cosB;
          const L = nx2 * 0.5 + ny1 * 0.5 + nz2 * 0.7;

          if (L > -0.3) {
            const idx = xp + yp * width;
            if (
              xp >= 0 &&
              xp < width &&
              yp >= 0 &&
              yp < height &&
              ooz > z[idx]
            ) {
              z[idx] = ooz;
              const luminanceIdx = Math.floor((L + 0.3) * 8);
              b[idx] =
                chars[Math.max(0, Math.min(luminanceIdx, chars.length - 1))];
            }
          }
        }
      }

      let output = "";
      for (let j = 0; j < height; j++) {
        for (let i = 0; i < width; i++) {
          output += b[i + j * width];
        }
        if (j < height - 1) output += "\n";
      }

      cvs.textContent = output;

      A.current += 0.018;
      B.current += 0.012;

      frameRef.current = requestAnimationFrame(render);
    }

    frameRef.current = requestAnimationFrame(render);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <div className="relative h-screen overflow-hidden bg-black">
      <div className="pointer-events-none absolute inset-0 z-50 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.1)_0px,rgba(0,0,0,0.1)_1px,transparent_1px,transparent_2px)]" />
      <pre
        ref={canvasRef}
        id="canvas"
        className="absolute inset-0 flex items-center justify-center text-white font-mono whitespace-pre"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.08),transparent_60%)]" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-2xl font-bold text-white sm:text-4xl md:text-5xl">
          404
        </p>
        <p className="max-w-md font-mono text-sm text-zinc-400 sm:text-base">
          Are you sure you are where you want to be?
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 font-mono text-sm text-zinc-500">
          <span>maybe return to</span>
          <Link
            href={isLoggedIn ? "/dashboard" : "/"}
            className="text-purple-400 underline underline-offset-4 transition-colors hover:text-purple-300"
          >
            reality
          </Link>
          <span>or go back into</span>
          <button
            onClick={() => router.back()}
            className="text-purple-400 underline underline-offset-4 transition-colors hover:text-purple-300"
          >
            outer space
          </button>
        </div>
        <p className="mt-2 max-w-md font-mono text-xs text-zinc-600">
          The page you are looking for does not exist, has been moved, or is
          currently lost in the void between universes
        </p>
      </div>
    </div>
  );
}
