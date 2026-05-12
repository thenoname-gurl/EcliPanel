"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { motion, type Variants } from "framer-motion";
import { apiFetch } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/panel-config";
import { Menu } from "../landing/_components/_custom/Menu";
import {
  type ContributorsSnapshot,
  type ContributorCommit,
  type ContributorPullRequest,
} from "../contributors/ContributorsClient";
import { GitCommit, GitPullRequest, ExternalLink, Star } from "lucide-react";
import { ActivityChart } from "../contributors/[id]/ActivityChart";
import type { ContributorCommitHistoryPoint } from "../contributors/ContributorsClient";

type ChangelogEntry = {
  id: string;
  type: "commit" | "pull-request";
  date: string;
  contributor: {
    login: string;
    avatarUrl: string;
    profileUrl: string;
    displayName?: string;
  };
  data: ContributorCommit | ContributorPullRequest;
};

type GroupedEntries = Record<string, ChangelogEntry[]>;

function isCommit(data: ContributorCommit | ContributorPullRequest): data is ContributorCommit {
  return "sha" in data;
}

function formatEntryDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (hours < 1) return "just now";
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatGroupHeader(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (target.getTime() === today.getTime()) return "Today";
  if (target.getTime() === yesterday.getTime()) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function truncateCommitMessage(msg: string, max = 72) {
  const firstLine = msg.split("\n")[0];
  return firstLine.length > max ? firstLine.slice(0, max) + "…" : firstLine;
}

const pageVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.4, ease: "easeOut", staggerChildren: 0.08, delayChildren: 0.15 },
  },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

const fadeLeft: Variants = {
  hidden: { opacity: 0, x: -28 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

type FilterMode = "all" | "commits" | "pull-requests";

export function ChangelogClient() {
  const t = useTranslations("changelogsPage");
  const [data, setData] = useState<ContributorsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [starCount, setStarCount] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const snapshot = await apiFetch(API_ENDPOINTS.contributorsPublic, { retries: 1 });
        if (!mounted) return;
        setData(snapshot);
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || t("error"));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!data?.repo) return;
    const { owner, name } = data.repo;
    fetch(`https://api.github.com/repos/${owner}/${name}`)
      .then((res) => res.json() as Promise<{ stargazers_count?: number }>)
      .then((json) => {
        if (typeof json.stargazers_count === "number") setStarCount(json.stargazers_count);
      })
      .catch(() => {});
  }, [data]);

  const aggregatedHistory = useMemo(() => {
    if (!data) return [];
    const map: Record<string, number> = {};
    for (const c of data.contributors) {
      for (const point of c.commitHistory) {
        const date = point.date.slice(0, 10);
        map[date] = (map[date] ?? 0) + point.count;
      }
    }
    return Object.entries(map).map(
      ([date, count]) => ({ date, count }) as ContributorCommitHistoryPoint,
    );
  }, [data]);

  const entries = useMemo(() => {
    if (!data) return [];
    const all: ChangelogEntry[] = [];
    for (const c of data.contributors) {
      for (const commit of c.recentCommits) {
        all.push({
          id: `commit-${commit.sha}`,
          type: "commit",
          date: commit.committedAt,
          contributor: {
            login: c.login,
            avatarUrl: c.avatarUrl,
            profileUrl: c.profileUrl,
            displayName: c.displayName,
          },
          data: commit,
        });
      }
      for (const pr of c.recentPullRequests) {
        all.push({
          id: `pr-${c.login}-${pr.number}`,
          type: "pull-request",
          date: pr.createdAt,
          contributor: {
            login: c.login,
            avatarUrl: c.avatarUrl,
            profileUrl: c.profileUrl,
            displayName: c.displayName,
          },
          data: pr,
        });
      }
    }
    all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return all;
  }, [data]);

  const filtered = useMemo(() => {
    if (filter === "commits") return entries.filter((e) => e.type === "commit");
    if (filter === "pull-requests") return entries.filter((e) => e.type === "pull-request");
    return entries;
  }, [entries, filter]);

  const grouped = useMemo(() => {
    const groups: GroupedEntries = {};
    for (const entry of filtered) {
      const key = new Date(entry.date).toISOString().slice(0, 10);
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    }
    return groups;
  }, [filtered]);

  const sortedDates = useMemo(
    () => Object.keys(grouped).sort((a, b) => new Date(b).getTime() - new Date(a).getTime()),
    [grouped],
  );

  const totalCommits = useMemo(
    () => entries.filter((e) => e.type === "commit").length,
    [entries],
  );
  const totalPrs = useMemo(
    () => entries.filter((e) => e.type === "pull-request").length,
    [entries],
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0a0a0f] text-white font-flink">
        <Menu customMenu={[]} />
        <motion.div
          className="min-h-screen flex items-center justify-center font-mono text-white/60"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          {t("loading")}
        </motion.div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[#0a0a0f] text-white font-flink">
        <Menu customMenu={[]} />
        <motion.div
          className="min-h-screen flex items-center justify-center font-mono text-red-300"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          {error}
        </motion.div>
      </main>
    );
  }

  const repoUrl = data?.repo?.url ?? "https://github.com/thenoname-gurl/EcliPanel";

  return (
    <motion.main
      className="min-h-screen bg-[#0a0a0f] text-white font-flink"
      initial="hidden"
      animate="visible"
      variants={pageVariants}
    >
      <Menu
        customCTA={{ href: repoUrl, label: t("repoCta"), newPage: true }}
        customMenu={[]}
      />

      <motion.div
        className="mt-24 sm:mt-32 lg:mt-40 px-4 sm:px-8 lg:px-16 xl:px-32 2xl:px-60 flex flex-col gap-6 sm:gap-8 lg:gap-10 pb-20"
        variants={pageVariants}
      >
        <motion.div className="flex flex-col gap-3" variants={fadeUp}>
          <motion.h1
            className="text-white font-heading font-bold text-4xl sm:text-5xl lg:text-6xl"
            variants={fadeUp}
          >
            {t("title")}
          </motion.h1>
          <motion.p className="text-white/60 text-base sm:text-lg max-w-2xl" variants={fadeUp}>
            {t("subtitle")}
          </motion.p>
        </motion.div>

        <motion.div
          className="border border-white/20 p-4 sm:p-6 flex flex-col sm:flex-row gap-4 sm:gap-0 sm:justify-center"
          variants={scaleIn}
        >
          <div className="sm:border-r sm:pr-8 lg:pr-10 flex flex-col gap-1 items-start sm:items-center border-b sm:border-b-0 pb-3 sm:pb-0">
            <p className="text-white/70 font-mono text-xs sm:text-sm">{t("stats.commits")}</p>
            <p className="font-bold text-xl sm:text-2xl">{totalCommits}</p>
          </div>
          <div className="sm:border-r sm:px-8 lg:px-10 flex flex-col gap-1 items-start sm:items-center border-b sm:border-b-0 pb-3 sm:pb-0">
            <p className="text-white/70 font-mono text-xs sm:text-sm">{t("stats.pullRequests")}</p>
            <p className="font-bold text-xl sm:text-2xl">{totalPrs}</p>
          </div>
          <div className="sm:border-r sm:px-8 lg:px-10 flex flex-col gap-1 items-start sm:items-center border-b sm:border-b-0 pb-3 sm:pb-0">
            <p className="text-white/70 font-mono text-xs sm:text-sm">{t("stats.contributors")}</p>
            <p className="font-bold text-xl sm:text-2xl">{data?.totalContributors ?? 0}</p>
          </div>
          <div className="sm:pl-8 lg:pl-10 flex flex-col gap-1 items-start sm:items-center">
            <p className="text-white/70 font-mono text-xs sm:text-sm">{t("stats.stars")}</p>
            <p className="font-bold text-xl sm:text-2xl flex items-center gap-1.5">
              {starCount !== null ? starCount.toLocaleString() : "—"}
              <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
            </p>
          </div>
        </motion.div>

        <motion.div variants={fadeUp}>
          <ActivityChart history={aggregatedHistory} />
        </motion.div>

        <motion.div className="flex items-center gap-2" variants={fadeUp}>
          {(["all", "commits", "pull-requests"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className={`px-4 py-1.5 text-sm font-mono transition-colors duration-200 ${
                filter === mode
                  ? "bg-white/10 text-white border border-white/30"
                  : "text-white/40 border border-white/10 hover:text-white/70 hover:border-white/20"
              }`}
            >
              {mode === "all" && t("filterAll")}
              {mode === "commits" && t("filterCommits")}
              {mode === "pull-requests" && t("filterPullRequests")}
            </button>
          ))}
        </motion.div>

        {sortedDates.length === 0 ? (
          <motion.div
            className="border border-white/10 p-8 text-center text-white/40 font-mono text-sm"
            variants={fadeUp}
          >
            {t("noEntries")}
          </motion.div>
        ) : (
          sortedDates.map((dateKey) => (
            <motion.div key={dateKey} className="flex flex-col gap-3" variants={fadeUp}>
              <motion.div
                className="font-mono text-xs uppercase tracking-widest text-white/30 border-b border-white/10 pb-2"
                variants={fadeLeft}
              >
                {formatGroupHeader(dateKey)}
              </motion.div>
              {grouped[dateKey].map((entry, i) => (
                <motion.div
                  key={entry.id}
                  className="border border-white/10 bg-white/[0.02] px-3 sm:px-4 py-3 flex items-start gap-3 hover:border-white/20 transition-colors"
                  variants={{
                    hidden: { opacity: 0, x: -18 },
                    visible: { opacity: 1, x: 0, transition: { duration: 0.35, ease: "easeOut", delay: i * 0.02 } },
                  }}
                  whileHover={{ x: 4, transition: { duration: 0.2 } }}
                >
                  <a
                    href={entry.contributor.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 mt-0.5"
                  >
                    <img
                      src={entry.contributor.avatarUrl}
                      alt={entry.contributor.login}
                      className="h-6 w-6 sm:h-7 sm:w-7 rounded object-cover"
                    />
                  </a>

                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      {isCommit(entry.data) ? (
                        <GitCommit className="h-4 w-4 shrink-0 mt-0.5 text-[#e594c7]" />
                      ) : (
                        <GitPullRequest className="h-4 w-4 shrink-0 mt-0.5 text-[#10b981]" />
                      )}
                      <a
                        href={isCommit(entry.data) ? entry.data.url : (entry.data as ContributorPullRequest).url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm sm:text-base text-white/80 hover:text-white transition-colors break-words min-w-0 flex-1"
                      >
                        {isCommit(entry.data)
                          ? truncateCommitMessage(entry.data.message)
                          : `${(entry.data as ContributorPullRequest).title}`}
                      </a>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-white/20 mt-1" />
                    </div>

                    <div className="flex items-center gap-2 text-[11px] sm:text-xs text-white/40 font-mono flex-wrap">
                      <span className="text-white/60">{entry.contributor.displayName ?? entry.contributor.login}</span>
                      {!isCommit(entry.data) && (
                        <span
                          className={`px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                            (entry.data as ContributorPullRequest).merged
                              ? "text-[#10b981] bg-[#10b981]/10"
                              : (entry.data as ContributorPullRequest).state === "closed"
                                ? "text-[#ef4444] bg-[#ef4444]/10"
                                : "text-[#e594c7] bg-[#e594c7]/10"
                          }`}
                        >
                          {(entry.data as ContributorPullRequest).merged
                            ? "merged"
                            : (entry.data as ContributorPullRequest).state}
                        </span>
                      )}
                      <span>{formatEntryDate(entry.date)}</span>
                      {isCommit(entry.data) && (
                        <span className="text-white/20">{entry.data.sha.slice(0, 7)}</span>
                      )}
                      {!isCommit(entry.data) && (
                        <span className="text-white/20">#{entry.data.number}</span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          ))
        )}
      </motion.div>
    </motion.main>
  );
}
