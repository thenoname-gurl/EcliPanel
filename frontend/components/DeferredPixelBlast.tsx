"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const PixelBlast = dynamic(
  () => import("@/app/landing/_components/_reacts-bits/PixelBlast"),
  { ssr: false, loading: () => null }
);

type PixelBlastProps = React.ComponentProps<typeof PixelBlast>;

export default function DeferredPixelBlast(props: PixelBlastProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const schedule =
      typeof requestIdleCallback !== "undefined"
        ? (cb: () => void) => requestIdleCallback(cb, { timeout: 3000 })
        : (cb: () => void) => setTimeout(cb, 2000);
    const id = schedule(() => setShow(true));
    return () => {
      if (typeof requestIdleCallback !== "undefined")
        cancelIdleCallback(id as number);
      else clearTimeout(id as ReturnType<typeof setTimeout>);
    };
  }, []);

  if (!show) return null;

  return <PixelBlast {...props} />;
}
