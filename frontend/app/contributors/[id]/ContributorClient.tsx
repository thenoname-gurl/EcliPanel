"use client";

import { apiFetch } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/panel-config";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ContributorsSnapshot } from "../ContributorsClient";
import { Menu } from "@/app/landing/_components/_custom/Menu";

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
  }, [loading, contributor]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>{error}</div>;
  if (!contributor) return null;

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white font-flink">
      <Menu
        customCTA={{
          href: contributor.profileUrl,
          label: "View Profile",
          newPage: true,
        }}
        customMenu={[]}
      />
      <div className="mt-40 px-60 flex flex-col gap-10">
        <div className="flex items-center gap-4">
          <img
            src={contributor.avatarUrl}
            alt={contributor.login}
            className="h-30"
          />
          <span>
            <p className="text-white text-2xl font-bold font-flink">
              @{contributor.login}
            </p>
            <p className="text-white/70 text-xl">
              Last commit at: {contributor.lastCommitAt}
            </p>
          </span>
        </div>
        <div className="border border-white/20 p-6 flex gap-8">
          <span className="border-r pr-10">
            <p>Contributions</p>
            <p>{contributor.contributions}</p>
          </span>
          more data
        </div>
        <div className="border border-white/20 p-6">
          <p>Recent Commits</p>
          {contributor.recentCommits.map((rc, i) => (
            <div key={i}>{rc.message}</div>
          ))}
        </div>
      </div>
    </main>
  );
}
