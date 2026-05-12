"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { apiFetch } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/panel-config";
import { Menu } from "../landing/_components/_custom/Menu";
import { Hero } from "./_components/Hero";

export type ContributorCommit = {
  sha: string;
  message: string;
  url: string;
  committedAt: string;
};

export type ContributorPullRequest = {
  number: number;
  title: string;
  url: string;
  state: string;
  createdAt: string;
  mergedAt?: string;
  merged: boolean;
};

export type ContributorCommitHistoryPoint = {
  date: string;
  count: number;
};

export type Contributor = {
  login: string;
  avatarUrl: string;
  profileUrl: string;
  source?: "github" | "manual";
  userId?: number;
  displayName?: string;
  title?: string | null;
  githubLogin?: string | null;
  githubProfileUrl?: string | null;
  githubAvatarUrl?: string | null;
  activity?: Array<{
    date: string;
    label: string;
    details?: string;
    points?: number;
    url?: string;
  }>;
  contributions: number;
  pullRequests: number;
  mergedPullRequests: number;
  isBot: boolean;
  lastCommitAt?: string;
  recentCommits: ContributorCommit[];
  recentPullRequests: ContributorPullRequest[];
  commitHistory: ContributorCommitHistoryPoint[];
};

export type ContributorsSnapshot = {
  repo: {
    owner: string;
    name: string;
    url: string;
  };
  generatedAt: string;
  totalContributors: number;
  totalTrackedCommits: number;
  totalTrackedPullRequests: number;
  totalMergedPullRequests: number;
  contributors: Contributor[];
};

const fadeUp: any = {
  hidden: { opacity: 0, y: 24 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay, duration: 0.5, ease: "easeOut" },
  }),
};

function formatDate(value?: string) {
  if (!value) return "No commits tracked yet";
  try {
    return new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function formatShortDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatCompactDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "numeric",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function ContributorsClient() {
  const t = useTranslations("contributorsPage");
  const [data, setData] = useState<ContributorsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const snapshot = await apiFetch(API_ENDPOINTS.contributorsPublic, {
          retries: 1,
        });
        if (!mounted) return;
        setData(snapshot);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || t("loadError"));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const sortedContributors = useMemo(() => data?.contributors ?? [], [data]);

  const statLabels = data
    ? [
        t("stats.contributors", { count: data.totalContributors }),
        t("stats.trackedCommits", { count: data.totalTrackedCommits }),
        t("stats.trackedPullRequests", { count: data.totalTrackedPullRequests }),
        t("stats.mergedPullRequests", { count: data.totalMergedPullRequests }),
        t("stats.lastSynced", { date: formatDate(data.generatedAt) }),
      ]
    : [
        t("loadingContributors"),
        t("loadingCommitHistory"),
        t("loadingPullRequests"),
        t("loadingMergeStats"),
        t("loadingSyncing"),
      ];

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white font-flink">
      <Menu
        customCTA={{
          href: "https://github.com/thenoname-gurl/EcliPanel",
          label: t("hero.repoCta"),
          newPage: true,
        }}
        customMenu={[]}
      />
      <div>
        <Hero />

        {error ? (
          <motion.div
            className="mx-6 sm:mx-12 lg:mx-40 mt-8 border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-100 font-flink"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {error}
          </motion.div>
        ) : null}

        <motion.section
          className="mt-12 mb-20"
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={0.25}
        >
          {loading && !data ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 px-6 sm:px-12 lg:px-40">
              {Array.from({ length: 8 }).map((_, index) => (
                <motion.div
                  key={index}
                  className="flex flex-col gap-3"
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.4,
                    delay: index * 0.05,
                    ease: "easeOut",
                  }}
                >
                  <div
                    className="w-full aspect-square bg-white/5 border border-white/10"
                    style={{
                      animation: `pulse 2s ease-in-out ${index * 0.1}s infinite`,
                    }}
                  />
                  <div className="h-3 w-2/3 mx-auto bg-white/5 border border-white/10" />
                </motion.div>
              ))}
            </div>
          ) : null}

          {!loading && sortedContributors.length === 0 ? (
            <motion.div
              className="mx-6 sm:mx-12 lg:mx-40 mt-8 border border-white/20 p-8 text-center text-white/70"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              {t("noContributorsYet")}
            </motion.div>
          ) : null}

          {!loading && sortedContributors.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 px-6 sm:px-12 lg:px-40 mt-12">
              {sortedContributors.map((s, i) => (
                <motion.a
                  key={s.login}
                  href={`/contributors/${s.login}`}
                  className="cursor-pointer flex flex-col gap-3"
                  initial={{ opacity: 0, y: 40, rotate: i % 2 === 0 ? -3 : 3 }}
                  animate={{ opacity: 1, y: 0, rotate: 0 }}
                  transition={{
                    duration: 0.5,
                    delay: i * 0.07,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  whileHover={{
                    y: -16,
                    rotate: i % 2 === 0 ? -3 : 3,
                    transition: { duration: 0.25, ease: "easeOut" },
                  }}
                >
                  <img
                    src={s.avatarUrl}
                    alt={s.login}
                    className="w-full h-auto aspect-square object-cover"
                  />
                  <p className="text-center font-mono text-sm truncate text-white/70">
                    {s.displayName ?? s.login}
                  </p>
                </motion.a>
              ))}
            </div>
          ) : null}
        </motion.section>
      </div>
    </main>
  );
}
