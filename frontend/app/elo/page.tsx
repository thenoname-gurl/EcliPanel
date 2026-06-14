import type { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import EloClient from "./EloClient";

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: "ELO Servers — EclipseSystems",
    description:
      "Deploy your open-source server, climb the ranks, and scale from 256 MB to 24 GB RAM. World's first competitive hosting.",
    path: "/elo",
  });
}

export default function Page() {
  return <EloClient />;
}
