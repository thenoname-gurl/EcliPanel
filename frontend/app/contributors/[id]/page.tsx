import type { Metadata } from "next";
import { ContributorClient } from "./ContributorClient";

export const metadata: Metadata = {
  description: "People who helped EclipseSystems to make EcliPanel better!",
};

export default function ContributorsPage() {
  return <ContributorClient />;
}
