import type { Metadata } from "next";

export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_API_BASE?.replace(/\/api.*$/, "") ||
    "https://ecli.app"
  ).replace(/\/+$/, "");
}

export const BRAND = {
  name: "EclipseSystems",
  tagline: "Next-Gen Hosting Provider",
  ogImage: "https://ecli.app/assets/banners/og.webp",
  twitter: "@ecliapp",
};

interface CreateMetadataOptions {
  title: string;
  description: string;
  path?: string;
  ogImage?: string;
  ogType?: "website" | "article" | "profile" | "product";
  keywords?: string[];
  publishedTime?: string;
  authors?: { name: string; url?: string }[];
}

export function createMetadata({
  title,
  description,
  path,
  ogImage,
  ogType = "website",
  keywords,
  publishedTime,
  authors,
}: CreateMetadataOptions): Metadata {
  const url = path ? `${siteUrl()}${path}` : siteUrl();
  const image = ogImage || BRAND.ogImage;
  const imageUrl = image.startsWith("http") ? image : `${siteUrl()}${image}`;

  return {
    title,
    description,
    keywords,
    authors,
    metadataBase: new URL(siteUrl()),
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: BRAND.name,
      type: ogType,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      locale: "en_US",
    } as Metadata["openGraph"],
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
      creator: BRAND.twitter,
    },
  };
}
