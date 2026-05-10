"use client";

import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../_shadcn/accordion";

const questions = [
  {
    question: "How does billing work?",
    answer:
      "Charged at the start of each period. Overage alerts fire before you hit limits - no surprise invoices.",
  },
  {
    question: "Is there a free trial for Pro?",
    answer:
      "Enterprise demos are available from billing. Pro trials are available via support for up to 3 days.",
  },
  {
    question: "What happens when a node goes offline?",
    answer:
      "Traffic can reroute to healthy nodes quickly when available. Pro and Enterprise deployments may also use replication across zones.",
  },
  {
    question: "Can I self host?",
    answer:
      "Yes. EcliPanel has an open-source core. Self-hosting is supported; review licensing details at https://ecli.app/license.",
  },
];

export function FAQ() {
  return (
    <motion.div
      id="faq"
      className="flex flex-col md:flex-row my-12 sm:my-20 mx-6 sm:mx-12 lg:mx-40 border border-white/20 p-4 md:min-h-[60vh]"
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
          className="text-white text-4xl sm:text-5xl lg:text-[4rem] font-bold leading-tight lg:leading-18"
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
        <Accordion defaultValue={["shipping"]} className="w-full">
          {questions.map((q, i) => (
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
              <AccordionItem value={q.question}>
                <AccordionTrigger>{q.question}</AccordionTrigger>
                <AccordionContent>{q.answer}</AccordionContent>
              </AccordionItem>
            </motion.div>
          ))}
        </Accordion>
      </div>
    </motion.div>
  );
}
