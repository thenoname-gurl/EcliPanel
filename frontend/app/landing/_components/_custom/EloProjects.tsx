"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Trophy,
  Vote,
  TrendingUp,
  TrendingDown,
  Swords,
  Shield,
  Flame,
} from "lucide-react";
import Link from "next/link";

interface ProjectEntry {
  rank: number;
  id: number;
  userId: number;
  title: string;
  eloScore: number;
  totalVotes: number;
  wins: number;
  losses: number;
  winRate: number;
  ownerName: string;
  description?: string | null;
  isWellMade?: boolean;
}

function RankCard({
  project,
  index,
}: {
  project: ProjectEntry;
  index: number;
}) {
  return (
    <motion.div
      className="border border-white/20 p-6 flex flex-col gap-4"
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, ease: "easeOut", delay: index * 0.15 }}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 flex items-center justify-center border border-white/20 bg-white/5 text-white font-bold text-sm">
          #{project.rank}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <Link href={`/elo/projects/${project.id}`} className="text-white text-lg font-bold leading-tight truncate hover:text-primary transition-colors">
              {project.title}
            </Link>
            {project.isWellMade && (
              <span title="This project was marked as well done by hosting staff" className="shrink-0"><Flame className="h-4 w-4 text-orange-500" /></span>
            )}
          </div>
          <p className="text-white/40 text-xs font-mono mt-0.5">{project.eloScore} ELO</p>
        </div>
      </div>

      {project.description && (
        <p className="text-white/60 text-sm leading-relaxed">{project.description}</p>
      )}

      <div className="grid grid-cols-3 gap-3 mt-auto pt-2 text-center">
        <div className="border border-white/10 p-2.5">
          <p className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">Votes</p>
          <p className="text-white font-semibold text-sm tabular-nums">{project.totalVotes}</p>
        </div>
        <div className="border border-white/10 p-2.5">
          <p className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">W/L</p>
          <p className="text-xs tabular-nums">
            <span className="text-emerald-500 font-semibold">{project.wins}W</span>
            <span className="text-white/30 mx-0.5">/</span>
            <span className="text-red-500 font-semibold">{project.losses}L</span>
          </p>
        </div>
        <div className="border border-white/10 p-2.5">
          <p className="text-white/40 text-[10px] uppercase tracking-wider mb-0.5">Win%</p>
          <p className="text-white font-semibold text-sm tabular-nums">{project.winRate}%</p>
        </div>
      </div>

      <Link href={`/elo/users/${project.userId}`} className="text-white/30 text-[11px] font-mono text-center hover:text-white/60 transition-colors block">
        by {project.ownerName}
      </Link>
    </motion.div>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Deploy Your Server",
      body: "Create a new server with ELO enabled. Add a GitHub repo, description, screenshots, and README.",
    },
    {
      icon: <Swords className="w-6 h-6" />,
      title: "Pairwise Voting",
      body: "The community compares projects side by side and votes. Your ELO updates instantly.",
    },
    {
      icon: <TrendingUp className="w-6 h-6" />,
      title: "Resources Scale",
      body: "Higher ELO = more CPU, RAM, and disk. From 256 MB to 24 GB, hardware follows rank.",
    },
  ];

  return (
    <div className="mt-20 sm:mt-28">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="text-center mb-10"
      >
        <p className="text-white text-3xl sm:text-4xl font-bold font-flink" id="how-it-works">
          How It Works
        </p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {steps.map((step, i) => (
          <motion.div
            key={step.title}
            className="border border-white/20 p-6 flex flex-col gap-3"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5, ease: "easeOut", delay: i * 0.1 }}
          >
            <span className="text-white/70">{step.icon}</span>
            <p className="text-white text-lg font-semibold">{step.title}</p>
            <p className="text-white/60 text-sm leading-relaxed">{step.body}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function VotingRules() {
  const rules = [
    { label: "Daily limit", value: "20 votes" },
    { label: "Account age", value: "7+ days" },
    { label: "Feedback", value: "20+ words" },
    { label: "Cooldown", value: "10 seconds" },
    { label: "Vote weight", value: "1.0x (Hack Club 1.1x)" },
    { label: "Slots", value: "1 base +1 per 20 votes" },
    { label: "Decay grace", value: "30 days" },
    { label: "Decay rate", value: "5% per day" },
  ];

  return (
    <div className="mt-16 sm:mt-20">
      <motion.p
        className="text-white text-3xl sm:text-4xl font-bold text-center font-flink"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        Voting Rules
      </motion.p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
        {rules.map((rule, i) => (
          <motion.div
            key={rule.label}
            className="border border-white/20 p-4 flex flex-col gap-1"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-30px" }}
            transition={{ duration: 0.4, ease: "easeOut", delay: i * 0.06 }}
          >
            <p className="text-white/40 text-xs uppercase tracking-wider">{rule.label}</p>
            <p className="text-white font-semibold text-sm">{rule.value}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function EcoSystemLinks() {
  return (
    <motion.div
      className="mt-16 sm:mt-20 border border-white/20 p-6 sm:p-8"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-white text-xl font-semibold">Ready to compete?</p>
          <p className="text-white/60 text-sm mt-1">
            Not interested in ELO? We also have standard paid plans available.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/dashboard/elo/leaderboard">
            <button className="bg-white/10 border border-white/20 px-4 py-2 rounded-full text-sm font-flink text-white hover:bg-white/20 transition-colors flex items-center gap-2 cursor-pointer">
              <Trophy className="w-4 h-4" />
              Leaderboard
            </button>
          </Link>
          <Link href="/dashboard/elo/vote">
            <button className="bg-white text-black px-4 py-2 rounded-full text-sm font-flink hover:bg-white/65 transition-colors flex items-center gap-2 cursor-pointer">
              <Vote className="w-4 h-4" />
              Vote Now
            </button>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

export function EloProjects() {
  const [projects, setProjects] = useState<ProjectEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/elo/leaderboard?per=3")
      .then((r) => {
        if (!r.ok) throw new Error("not available");
        return r.json();
      })
      .then((data) => {
        if (data?.leaderboard?.length > 0) {
          setProjects(data.leaderboard);
        }
        setError(false);
      })
      .catch(() => {
        setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div id="projects" className="my-12 sm:my-20 px-6 sm:px-12 lg:px-40">
      <motion.p
        className="font-flink text-white font-bold text-4xl sm:text-5xl lg:text-[5.4rem] text-center"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        Top Projects
      </motion.p>
      <motion.p
        className="font-flink text-center text-lg sm:text-[22px] text-white/70 mt-2"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
      >
        Community-ranked servers earning resources through voting.
      </motion.p>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 sm:mt-10">
          {[0, 1, 2].map((i) => (
            <div key={i} className="border border-white/10 p-6 h-64 animate-pulse bg-white/[0.02]" />
          ))}
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 sm:mt-10">
          {projects.map((project, i) => (
            <RankCard key={project.rank ?? i} project={project} index={i} />
          ))}
        </div>
      ) : error ? (
        <motion.p
          className="text-center text-white/40 text-sm mt-10"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          Could not load projects right now.
        </motion.p>
      ) : (
        <motion.p
          className="text-center text-white/40 text-sm mt-10"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          No projects ranked yet. Be the first — deploy an ELO server.
        </motion.p>
      )}

      <HowItWorks />
      <VotingRules />
      <EcoSystemLinks />
    </div>
  );
}
