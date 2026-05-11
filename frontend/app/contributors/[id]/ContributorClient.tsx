"use client";

import { apiFetch } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/panel-config";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion, type Variants } from "framer-motion";
import { ContributorsSnapshot } from "../ContributorsClient";
import { Menu } from "@/app/landing/_components/_custom/Menu";
import { ActivityChart } from "./ActivityChart";

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

const pageVariants: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.4,
      ease: "easeOut",
      staggerChildren: 0.12,
      delayChildren: 0.15,
    },
  },
};

const fadeUp: Variants = {
  hidden: {
    opacity: 0,
    y: 28,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

const fadeLeft: Variants = {
  hidden: {
    opacity: 0,
    x: -28,
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.55,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

const scaleIn: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.92,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.45,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

const statContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.25,
    },
  },
};

const statItem: Variants = {
  hidden: {
    opacity: 0,
    y: 18,
    scale: 0.96,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: "easeOut",
    },
  },
};

export function ContributorClient() {
  const [data, setData] = useState<ContributorsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

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

        setError(err?.message || "Failed to load contributors");
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

  const contributor = useMemo(
    () => sortedContributors.find((c) => c.login === id) ?? null,
    [sortedContributors, id],
  );

  useEffect(() => {
    if (!loading && !contributor) {
      router.replace("/not-found");
    }
  }, [loading, contributor, router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0a0a0f] text-white">
        <motion.div
          className="min-h-screen flex items-center justify-center font-mono text-white/60"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          Loading...
        </motion.div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-[#0a0a0f] text-white">
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

  if (!contributor) return null;

  return (
    <motion.main
      className="min-h-screen bg-[#0a0a0f] text-white"
      initial="hidden"
      animate="visible"
      variants={pageVariants}
    >
      <Menu
        customCTA={{
          href: contributor.profileUrl,
          label: "View Profile",
          newPage: true,
        }}
        customMenu={[]}
      />

      <motion.div
        className="mt-40 px-60 flex flex-col gap-10"
        variants={pageVariants}
      >
        <motion.div className="flex gap-4" variants={fadeUp}>
          <motion.img
            src={contributor.avatarUrl}
            alt={contributor.login}
            className="h-30"
            variants={scaleIn}
            whileHover={{
              scale: 1.04,
              rotate: -2,
              transition: { duration: 0.2, ease: "easeOut" },
            }}
          />

          <motion.span variants={fadeLeft}>
            <motion.p
              className="text-white text-4xl font-bold font-mono"
              variants={fadeUp}
            >
              @{contributor.login}
            </motion.p>

            <motion.p className="text-white/70 text-xl" variants={fadeUp}>
              Last commit at: {formatDate(contributor.lastCommitAt)}
            </motion.p>
          </motion.span>
        </motion.div>

        <motion.div
          className="border border-white/20 p-6 flex gap-8 justify-center"
          variants={statContainer}
        >
          <motion.span
            className="border-r pr-10 flex flex-col gap-2"
            variants={statItem}
            whileHover={{
              y: -4,
              transition: { duration: 0.2, ease: "easeOut" },
            }}
          >
            <p className="text-white/70 font-mono">Contributions</p>
            <p className="text-center font-bold text-3xl">
              {contributor.contributions}
            </p>
          </motion.span>

          <motion.span
            className="border-r pr-10 flex flex-col gap-2"
            variants={statItem}
            whileHover={{
              y: -4,
              transition: { duration: 0.2, ease: "easeOut" },
            }}
          >
            <p className="text-white/70 font-mono">Pull Requests</p>
            <p className="text-center font-bold text-3xl">
              {contributor.pullRequests}
            </p>
          </motion.span>

          <motion.span
            className="flex flex-col gap-2"
            variants={statItem}
            whileHover={{
              y: -4,
              transition: { duration: 0.2, ease: "easeOut" },
            }}
          >
            <p className="text-white/70 font-mono">Merged Pull Requests</p>
            <p className="text-center font-bold text-3xl">
              {contributor.mergedPullRequests}
            </p>
          </motion.span>
        </motion.div>

        <motion.div
          className="border border-white/20 p-6 flex flex-col gap-4"
          variants={fadeUp}
        >
          <motion.span
            className="font-mono text-3xl text-white/70"
            variants={fadeUp}
          >
            Activity
          </motion.span>

          <motion.div
            variants={scaleIn}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.15 }}
          >
            <ActivityChart history={contributor.commitHistory} />
          </motion.div>
        </motion.div>

        <motion.div
          className="border border-white/20 p-6 flex flex-col gap-4"
          variants={fadeUp}
        >
          <motion.p
            className="text-white/70 font-mono text-3xl"
            variants={fadeUp}
          >
            Recent Commits
          </motion.p>

          <motion.div
            className="flex flex-col gap-3"
            variants={{
              hidden: {},
              visible: {
                transition: {
                  staggerChildren: 0.06,
                  delayChildren: 0.2,
                },
              },
            }}
          >
            {contributor.recentCommits.map((rc, i) => (
              <motion.div
                key={i}
                className="border border-white/10 bg-white/2 px-4 py-3 text-white/70"
                variants={{
                  hidden: {
                    opacity: 0,
                    x: -18,
                  },
                  visible: {
                    opacity: 1,
                    x: 0,
                    transition: {
                      duration: 0.35,
                      ease: "easeOut",
                    },
                  },
                }}
                whileHover={{
                  x: 6,
                  borderColor: "rgba(255,255,255,0.25)",
                  backgroundColor: "rgba(255,255,255,0.05)",
                  transition: { duration: 0.2 },
                }}
              >
                {rc.message}
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.main>
  );
}
