"use client";

import ReactMarkdown from "react-markdown";
import Link from "next/link";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { useEffect, useState } from "react";
import { codeToHtml } from "shiki";

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [html, setHtml] = useState("");

  useEffect(() => {
    codeToHtml(code, {
      lang: lang || "plaintext",
      theme: "github-dark",
    })
      .then(setHtml)
      .catch(() => setHtml(`<pre><code>${code}</code></pre>`));
  }, [code, lang]);

  if (!html) {
    return (
      <pre className="bg-white/5 border border-white/10 p-4 text-sm font-mono overflow-x-auto">
        <code>{code}</code>
      </pre>
    );
  }

  return (
    <div
      className="not-prose text-sm overflow-x-auto [&>pre]:bg-transparent! [&>pre]:m-0"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function Md({ children }: { children: string }) {
  return (
    <div
      className="prose prose-sm prose-invert max-w-none
        prose-headings:font-semibold prose-headings:tracking-tight
        prose-h1:text-3xl prose-h1:mb-2
        prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-2 prose-h2:border-b prose-h2:border-white/10 prose-h2:pb-2
        prose-h3:text-base prose-h3:mt-6
        prose-p:text-white/70 prose-p:leading-7
        prose-li:text-white/70 prose-li:leading-7
        prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:text-indigo-300
        prose-strong:text-white
        prose-code:text-pink-400 prose-code:bg-white/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
        prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10
        prose-blockquote:border-l-white/20 prose-blockquote:text-white/50
        prose-hr:border-white/10
        prose-table:text-sm
        prose-th:text-white/50 prose-th:font-medium
        prose-td:text-white/70"
    >
      <ReactMarkdown
        rehypePlugins={[rehypeSlug]}
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => <Link href={href ?? "#"}>{children}</Link>,
          code: ({ className, children, ...props }: any) => {
            const lang = className?.replace("language-", "") ?? "";
            const isBlock = !props.inline;
            if (isBlock && lang) {
              return (
                <CodeBlock code={String(children).trimEnd()} lang={lang} />
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
