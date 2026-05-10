"use client";

import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../_shadcn/accordion";
import { useMemo } from "react";
import { useTranslations } from "next-intl";

export function FAQ() {
  const t = useTranslations("landing");

  const faqs = useMemo(
    () => [
      { q: t("faq.q1"), a: t("faq.a1") },
      { q: t("faq.q2"), a: t("faq.a2") },
      { q: t("faq.q3"), a: t("faq.a3") },
      { q: t("faq.q4"), a: t("faq.a4") },
    ],
    [t],
  );

  return (
    <motion.div
      id="faq"
      className="flex flex-col md:flex-row my-12 sm:my-20 mx-6 sm:mx-12 lg:mx-40 border border-white/20 p-4 md:min-h-[60vh] **:font-flink"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex flex-col gap-4 w-full md:w-[40%] pb-6 md:pb-0">
        <motion.p
          className="text-white/70"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
        >
          FAQ
        </motion.p>
        <motion.p
          className="text-white text-4xl sm:text-5xl font-flink lg:text-[4rem] font-bold leading-tight lg:leading-18"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        >
          Your questions,
          <br /> answered.
        </motion.p>
      </div>

      <div className="border-t md:border-t-0 md:border-l border-white/20 w-full md:w-[60%] flex pt-4 md:pt-0 md:pl-6">
        <Accordion defaultValue={[faqs[0]?.q]} className="w-full">
          {faqs.map((faq, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{
                duration: 0.5,
                ease: [0.22, 1, 0.36, 1],
                delay: 0.2 + i * 0.1,
              }}
            >
              <AccordionItem value={faq.q}>
                <AccordionTrigger>{faq.q}</AccordionTrigger>
                <AccordionContent>{faq.a}</AccordionContent>
              </AccordionItem>
            </motion.div>
          ))}
        </Accordion>
      </div>
    </motion.div>
  );
}
