import type { Metadata } from "next";
import { ChangelogClient } from "./ChangelogClient";
import { createMetadata } from "@/lib/metadata";

export const metadata: Metadata = createMetadata({
  title: "Changelogs — EclipseSystems",
  description: "Latest changelogs of EcliPanel from its contributors <3",
  path: "/changelogs",
});

export default function ChangelogPage() {
  return <ChangelogClient />;
}
