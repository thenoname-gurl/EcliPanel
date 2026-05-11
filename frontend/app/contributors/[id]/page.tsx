import type { Metadata } from "next";
import { ContributorClient } from "./ContributorClient";
import {
  formatContributorDescription,
  getContributorMetaById,
  getPublicSiteUrl,
} from "./contributor-meta";

type ContributorPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: ContributorPageProps): Promise<Metadata> {
  const { id } = await params;
  const siteUrl = getPublicSiteUrl();
  const canonicalPath = `/contributors/${encodeURIComponent(id)}`;
  const canonicalUrl = `${siteUrl}${canonicalPath}`;
  const imageUrl = `${siteUrl}${canonicalPath}/twitter-image`;

  const fallbackDescription = "People who helped EclipseSystems make EcliPanel better.";
  const { contributor, snapshot } = await getContributorMetaById(id);

  if (!contributor) {
    return {
      metadataBase: new URL(siteUrl),
      title: "Eclipse Systems - Contributor",
      description: fallbackDescription,
      alternates: {
        canonical: canonicalPath,
      },
      openGraph: {
        title: "Eclipse Systems - Contributor",
        description: fallbackDescription,
        url: canonicalUrl,
        type: "profile",
        images: [
          {
            url: imageUrl,
            width: 1200,
            height: 630,
            alt: "EclipseSystems contributor stats card",
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: "Eclipse Systems - Contributor",
        description: fallbackDescription,
        images: [imageUrl],
      },
    };
  }

  const displayName = contributor.displayName || contributor.login;
  const repoName = snapshot?.repo?.name;
  const title = `${displayName} · Contributor Stats`;
  const description = formatContributorDescription(contributor, repoName);

  return {
    title,
    description,
    keywords: [
      "EcliPanel",
      "EclipseSystems",
      "contributors",
      contributor.login,
      "open source",
      "github",
    ],
    metadataBase: new URL(siteUrl),
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: "profile",
      siteName: "Eclipse Systems",
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: `${displayName} contributor stats card`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function ContributorsPage() {
  return <ContributorClient />;
}
