import type { Metadata } from "next";
import { ChangelogClient } from "./ChangelogClient";

export const metadata: Metadata = {
  description: "Latest changelogs of EcliPanel from its contributors <3",
};

export default function ChangelogPage() {
  return <ChangelogClient />;
}
