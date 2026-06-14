import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createMetadata } from "@/lib/metadata";
import LandingClient from "./LandingClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing");
  return createMetadata({
    title: `${t("hero.titleLine1")} — EclipseSystems`,
    description: t("hero.subtitle"),
    path: "/",
  });
}

export default function Page() {
  return <LandingClient />;
}
