"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { apiFetch } from '@/lib/api-client';
import { API_ENDPOINTS, BRAND } from '@/lib/panel-config';
import { ArrowLeft, ExternalLink, GitCommitVertical, Users } from 'lucide-react';

type ContributorCommit = {
  sha: string;
  message: string;
  url: string;
  committedAt: string;
};

type Contributor = {
  login: string;
  avatarUrl: string;
  profileUrl: string;
  contributions: number;
  isBot: boolean;
  lastCommitAt?: string;
  recentCommits: ContributorCommit[];
};

type ContributorsSnapshot = {
  repo: {
    owner: string;
    name: string;
    url: string;
  };
  generatedAt: string;
  totalContributors: number;
  totalTrackedCommits: number;
  contributors: Contributor[];
};

const fadeUp: any = {
  hidden: { opacity: 0, y: 24 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay, duration: 0.5, ease: 'easeOut' },
  }),
} as const;

const fadeIn: any = {
  hidden: { opacity: 0 },
  visible: (delay = 0) => ({
    opacity: 1,
    transition: { delay, duration: 0.4, ease: 'easeOut' },
  }),
} as const;

const cardVariants: any = {
  hidden: { opacity: 0, y: 18 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: index * 0.05, duration: 0.35, ease: 'easeOut' },
  }),
} as const;

function formatDate(value?: string) {
  if (!value) return 'No commits tracked yet';

  try {
    return new Date(value).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return value;
  }
}

export function ContributorsClient() {
  const [data, setData] = useState<ContributorsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setError(err?.message || 'Failed to load contributors');
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

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white font-flink">
      <div className="relative mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <motion.div
          className="flex items-center justify-between gap-4 pt-8"
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={0.05}
        >
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-white/70 transition-colors hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
          <motion.a
            href={BRAND.repoUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.98 }}
          >
            View repository
            <ExternalLink className="h-4 w-4" />
          </motion.a>
        </motion.div>

        <motion.section
          className="relative mt-8 overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20 sm:p-10"
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={0.15}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,125,184,0.24),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(78,130,255,0.18),transparent_30%)]" />
          <div className="relative z-10 max-w-3xl">
            <motion.p
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/60"
              initial="hidden"
              animate="visible"
              variants={fadeIn}
              custom={0.05}
            >
              <Users className="h-3.5 w-3.5" />
              Contributors
            </motion.p>

            <motion.h1
              className="text-4xl font-semibold tracking-tight sm:text-5xl"
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              custom={0.12}
            >
              Community contributors, ranked by impact.
            </motion.h1>

            <motion.p
              className="mt-4 max-w-2xl text-base leading-7 text-white/70 sm:text-lg"
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              custom={0.18}
            >
              Synced from GitHub on a schedule, filtered to remove bots, and grouped by contribution count with linked recent commits.
            </motion.p>

            <motion.div
              className="mt-6 flex flex-wrap gap-3 text-sm text-white/70"
              initial="hidden"
              animate="visible"
              variants={fadeIn}
              custom={0.25}
            >
              {[
                data ? `${data.totalContributors} contributors` : 'Loading contributors...',
                data ? `${data.totalTrackedCommits} tracked commits` : 'Fetching commit history...',
                data ? `Last synced ${formatDate(data.generatedAt)}` : 'Syncing from GitHub...',
              ].map((label, index) => (
                <motion.div
                  key={label}
                  className="rounded-full border border-white/10 bg-black/20 px-4 py-2"
                  whileHover={{ borderColor: 'rgba(255,255,255,0.25)', y: -1 }}
                  transition={{ duration: 0.2 }}
                >
                  {label}
                </motion.div>
              ))}
            </motion.div>
          </div>
        </motion.section>

        {error ? (
          <motion.div
            className="mt-8 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-100"
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
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <motion.div
                  key={index}
                  className="h-72 rounded-3xl border border-white/10 bg-white/5"
                  initial={{ opacity: 0.45 }}
                  animate={{ opacity: [0.45, 0.8, 0.45] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
              ))}
            </div>
          ) : null}

          {!loading && sortedContributors.length === 0 ? (
            <motion.div
              className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-white/70"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              No contributors have been synced yet.
            </motion.div>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {sortedContributors.map((contributor, index) => (
              <motion.article
                key={contributor.login}
                className="group rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition-colors duration-300 hover:border-white/20 hover:bg-white/[0.07]"
                initial="hidden"
                animate="visible"
                variants={cardVariants}
                custom={index}
                whileHover={{ y: -4 }}
                whileTap={{ y: -2 }}
              >
                <div className="flex items-start gap-4">
                  <img
                    src={contributor.avatarUrl}
                    alt={contributor.login}
                    className="h-16 w-16 rounded-2xl border border-white/10 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-lg font-semibold">{contributor.login}</h2>
                      {index === 0 ? (
                        <motion.span
                          className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-200"
                          initial={{ scale: 0.7, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ delay: 0.25, duration: 0.3 }}
                        >
                          Top
                        </motion.span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-white/60">{contributor.contributions} contributions</p>
                    <motion.a
                      href={contributor.profileUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-2 inline-flex items-center gap-1 text-sm text-white/70 transition-colors hover:text-white"
                      whileHover={{ x: 3 }}
                    >
                      Open profile
                      <ExternalLink className="h-3.5 w-3.5" />
                    </motion.a>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-white/35">
                    <GitCommitVertical className="h-3.5 w-3.5" />
                    Recent commits
                  </div>

                  {contributor.recentCommits?.length ? (
                    <div className="space-y-2">
                      {contributor.recentCommits.slice(0, 3).map((commit, commitIndex) => (
                        <motion.a
                          key={commit.sha}
                          href={commit.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="block rounded-2xl border border-white/10 bg-black/20 p-3 transition-colors hover:border-white/20 hover:bg-black/30"
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.15 + commitIndex * 0.05, duration: 0.3 }}
                          whileHover={{ x: 4 }}
                        >
                          <p className="line-clamp-2 text-sm text-white/90">{commit.message}</p>
                          <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-white/45">
                            <span>{commit.sha.slice(0, 7)}</span>
                            <span>{formatDate(commit.committedAt)}</span>
                          </div>
                        </motion.a>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-2xl border border-dashed border-white/10 bg-black/15 p-3 text-sm text-white/45">
                      No linked commits cached yet.
                    </p>
                  )}
                </div>
              </motion.article>
            ))}
          </div>
        </motion.section>
      </div>
    </main>
  );
}
