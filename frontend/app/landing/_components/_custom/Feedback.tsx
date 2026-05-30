"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Star, Quote } from "lucide-react";
import { useTranslations } from "next-intl";

interface PublicFeedback {
  averageRating: number;
  reviewCount: number;
}

function usePublicFeedback() {
  const [feedback, setFeedback] = useState<PublicFeedback | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await fetch("https://backend.ecli.app/public/feedback", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as PublicFeedback;
        if (mounted) setFeedback(data);
      } catch {
        // buh
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  return feedback;
}

function StarDisplay({ filled }: { filled: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`h-5 w-5 ${
            i < filled
              ? "text-amber-300 fill-amber-300"
              : "text-white/15"
          }`}
        />
      ))}
    </div>
  );
}

export function Feedback() {
  const t = useTranslations("landing");
  const feedback = usePublicFeedback();
  const averageRating = feedback?.averageRating ?? 0;
  const reviewCount = feedback?.reviewCount ?? 0;
  const filledStars = Math.round(averageRating);
  const isLoading = feedback === null;

  const displayRating = useMemo(
    () => (isLoading ? "--" : averageRating.toFixed(1)),
    [averageRating, isLoading]
  );

  return (
    <div id="feedback" className="my-12 sm:my-20 px-6 sm:px-12 lg:px-40">
      <motion.p
        className="font-flink text-white font-bold text-4xl sm:text-5xl lg:text-[5.4rem] text-center"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        {t("feedback.eyebrow")}
      </motion.p>
      <motion.p
        className="font-flink text-center text-lg sm:text-[22px] text-white/70 mt-2"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
      >
        {t("feedback.heading")}
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="border border-white/20 mt-8 sm:mt-10"
      >
        <div className="grid lg:grid-cols-[1.4fr_1fr]">
          <div className="p-8 sm:p-10 lg:p-12">
            <Quote className="h-8 w-8 sm:h-10 sm:w-10 text-white/15 mb-4 sm:mb-5" />
            <p className="text-xl sm:text-2xl text-white/90 font-medium leading-relaxed sm:leading-[1.65]">
              &ldquo;{t("feedback.quote")}&rdquo;
            </p>
            <p className="text-white/50 text-sm sm:text-base mt-5 sm:mt-6">
              &mdash; {t("feedback.quoteSource")}
            </p>
          </div>

          <div className="flex flex-col justify-center gap-4 border-t lg:border-t-0 lg:border-l border-white/20 p-8 sm:p-10 lg:p-12">
            <p className="text-white/50 text-sm uppercase tracking-[0.2em] font-semibold">
              {t("feedback.averageLabel")}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white tabular-nums leading-none">
                {displayRating}
              </span>
              <span className="text-white/40 text-lg">/ 5</span>
            </div>
            <StarDisplay filled={filledStars} />
            <p className="text-white/60 text-sm">
              {isLoading
                ? t("feedback.loadingReviews")
                : t("feedback.reviewCount", { count: reviewCount })}
            </p>
          </div>
        </div>
      </motion.div>

      <div className="grid sm:grid-cols-2 mt-6">
        {[
          { label: t("feedback.panelCardTitle"), text: t("feedback.panelCardDescription") },
          { label: "Trusted Infrastructure", text: "95% uptime ready infrastructure" },
        ].map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.15 + i * 0.08 }}
            className="border border-white/20 p-6 sm:p-8"
          >
            <p className="text-white font-flink text-base sm:text-lg font-semibold">
              {item.label}
            </p>
            <p className="text-white/60 text-sm sm:text-base mt-1.5 leading-relaxed">
              {item.text}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
