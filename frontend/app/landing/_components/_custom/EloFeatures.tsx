"use client";

import { motion } from "framer-motion";
import {
  Swords,
  TrendingUp,
  FileText,
  SkipForward,
  Vote,
  Gift,
} from "lucide-react";

const FEATURES = [
  {
    icon: <Swords className="w-7 h-7" />,
    title: "Pairwise Voting",
    body: "Two projects side by side — you pick the better one. Chess-style Elo keeps rankings fair and accurate.",
  },
  {
    icon: <TrendingUp className="w-7 h-7" />,
    title: "Resources Scale With Rank",
    body: "From 256 MB RAM at 200 ELO up to 24 GB at 12,000 ELO. Every vote changes your hardware.",
  },
  {
    icon: <FileText className="w-7 h-7" />,
    title: "Devlogs",
    body: "Post markdown updates with images to show voters what's new and reset your skip tokens.",
  },
  {
    icon: <SkipForward className="w-7 h-7" />,
    title: "Skip Tokens",
    body: "Each project gets 5 skip tokens. No devlog? Burn a token to start. Publish to refill.",
  },
  {
    icon: <Vote className="w-7 h-7" />,
    title: "Vote to Unlock Slots",
    body: "Cast 20 votes and earn +1 ELO server slot. The more you contribute, the more you host.",
  },
  {
    icon: <Gift className="w-7 h-7" />,
    title: "Student Bonus",
    body: "+20% bonus resources and 1.1× vote weight for verified students.",
  },
];

const RESOURCE_TABLE = [
  { elo: "200 (min)", cpu: "20%", ram: "256 MB", disk: "2 GB" },
  { elo: "1,000 (base)", cpu: "100%", ram: "2 GB", disk: "40 GB" },
  { elo: "2,000", cpu: "200%", ram: "4 GB", disk: "80 GB" },
  { elo: "5,000", cpu: "500%", ram: "10 GB", disk: "200 GB" },
  { elo: "12,000 (max)", cpu: "1,200%", ram: "24 GB", disk: "500 GB" },
];

interface CardProps {
  icon: React.ReactNode;
  title: string;
  body: string;
  index: number;
}

function Card({ icon, title, body, index }: CardProps) {
  return (
    <motion.div
      className="flex flex-col gap-5 border p-6 border-white/20 w-full relative overflow-hidden"
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, ease: "easeOut", delay: index * 0.1 }}
    >
      <div className="text-white/70">{icon}</div>
      <p className="text-white text-2xl sm:text-3xl">{title}</p>
      <p className="text-white/70 text-base sm:text-[18px]">{body}</p>
    </motion.div>
  );
}

export function EloFeatures() {
  return (
    <div id="features" className="my-12 sm:my-20 px-6 sm:px-12 lg:px-40">
      <motion.p
        className="font-flink text-white font-bold text-4xl sm:text-5xl lg:text-[5.4rem] text-center"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        How ELO Works
      </motion.p>
      <motion.p
        className="font-flink text-center text-lg sm:text-[22px] text-white/70 mt-2"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
      >
        Pairwise rankings. Real resource scaling. Community-governed hosting.
      </motion.p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8 sm:mt-10">
        {FEATURES.map((f, i) => (
          <Card {...f} index={i} key={i} />
        ))}
      </div>

      <motion.div
        className="border border-white/20 mt-12 overflow-hidden"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
      >
        <div className="p-4 sm:p-6 border-b border-white/10">
          <p className="text-white font-semibold text-lg">Resource Scaling Table</p>
          <p className="text-white/50 text-sm mt-1">Your ELO score determines your server resources.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/40 text-[11px] uppercase tracking-wider">
                <th className="p-4 sm:p-5 font-medium">ELO Score</th>
                <th className="p-4 sm:p-5 font-medium">CPU</th>
                <th className="p-4 sm:p-5 font-medium">RAM</th>
                <th className="p-4 sm:p-5 font-medium">Disk</th>
              </tr>
            </thead>
            <tbody>
              {RESOURCE_TABLE.map((row, i) => (
                <tr
                  key={row.elo}
                  className="border-b border-white/[0.04] last:border-0"
                >
                  <td className="p-4 sm:p-5 text-white font-medium">{row.elo}</td>
                  <td className="p-4 sm:p-5 text-white/70">{row.cpu}</td>
                  <td className="p-4 sm:p-5 text-white/70">{row.ram}</td>
                  <td className="p-4 sm:p-5 text-white/70">{row.disk}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
