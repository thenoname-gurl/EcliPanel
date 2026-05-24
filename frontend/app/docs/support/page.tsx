import Link from "next/link";
import { LifeBuoy, Info } from "lucide-react";
import GradualBlurMemo from "@/app/landing/_components/_reacts-bits/GradualBlur";
import { Menu } from "@/app/landing/_components/_custom/Menu";

export default function SupportPage() {
  return (
    <main className="px-auto w-full px-4 py-10 sm:px-6 lg:px-8 flex justify-center bg-black">
      <div className="space-y-8 max-w-6xl">
        <section className="text-center shadow-xl shadow-black/5">
          <div className="">
            <p className="text-[clamp(2.5rem,8vw,6.5rem)] leading-[0.95] font-semibold tracking-tight text-foreground">
              Help, support, and policy resources
            </p>
            <p className="max-w-3xl mx-auto text-sm leading-7 text-white/70 sm:text-base">
              How to get help when you need it, how the ticket system works, and
              where to find all legal and policy documents for the platform.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-40">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" /> Support channels
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            EcliPanel provides multiple ways to get help. Choose the channel
            that best matches your issue.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 mt-15">
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">
              In-app tickets (primary)
            </p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">
              Open and manage support tickets directly from the dashboard. This
              is the fastest and most reliable channel for technical issues,
              billing questions, account problems, and feature requests. All
              conversations are tracked and searchable.
            </p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">
              Email (legal & compliance)
            </p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">
              Use{" "}
              <a
                href="mailto:legal@ecli.app"
                className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              >
                legal@ecli.app
              </a>{" "}
              for legal questions, compliance inquiries, DMCA notices, or data
              protection requests. This is not for technical support.
            </p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">
              Documentation (self-serve)
            </p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">
              Browse the public{" "}
              <Link
                href="/docs"
                className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              >
                documentation
              </Link>{" "}
              for guides on every feature. Most common questions are answered
              here before you need to open a ticket.
            </p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">
              Legal center
            </p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">
              Read our{" "}
              <Link
                href="/legal"
                className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              >
                terms of service
              </Link>
              , privacy policy, acceptable use policy, and other legal
              documents. These define your rights and responsibilities as a
              user.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            How to open a support ticket
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Opening a well-written ticket helps support resolve your issue
            faster. Follow these steps.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <ol className="list-decimal list-inside text-[16px] leading-10 text-white/70">
            <li>
              <b>Log in to the dashboard.</b> You must be authenticated to
              create tickets.
            </li>
            <li>
              <b>Navigate to Tickets.</b> Find the Tickets section in your
              dashboard sidebar or navigation.
            </li>
            <li>
              <b>Click New Ticket.</b> This opens the ticket creation form.
            </li>
            <li>
              <b>Choose a category.</b> Select the category that best matches
              your issue: Technical, Billing, Account, Abuse Report, or Other.
              Choosing the right category routes your ticket to the right team.
            </li>
            <li>
              <b>Write a clear description.</b> Include the following details:
              <ul className="list-disc list-inside ml-4 mt-2">
                <li>What you were trying to do</li>
                <li>What actually happened</li>
                <li>Server ID or name (if applicable)</li>
                <li>Error messages (copy the full text, not just a summary)</li>
                <li>Steps to reproduce the issue</li>
                <li>Screenshots or logs if available</li>
              </ul>
            </li>
            <li>
              <b>Submit the ticket.</b> You will receive a confirmation and can
              track the conversation from the Tickets page.
            </li>
            <li>
              <b>Check back for replies.</b> Support will respond within the
              ticket thread. You can reply directly from the panel. Keep an eye
              on your notification settings so you do not miss responses.
            </li>
          </ol>
          <p className="mt-3 text-sm text-white/50">
            Tip: Attach screenshots, console logs, or config files when
            possible. A picture of an error message is often more helpful than a
            description of it.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            Ticket lifecycle
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Understanding how tickets move through the system helps you know
            what to expect.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <ul className="text-[16px] leading-10 text-white/70">
            <li>
              <b>Open:</b> Your ticket has been received and is waiting in the
              queue. A support agent will be assigned based on the category.
            </li>
            <li>
              <b>In Progress:</b> A support agent is actively working on your
              issue. They may ask for additional information or clarification.
            </li>
            <li>
              <b>Pending:</b> Support has replied and is waiting for your
              response. The ticket may be auto-closed if you do not reply within
              a certain period. Reply promptly to keep the conversation active.
            </li>
            <li>
              <b>Resolved:</b> The issue has been fixed or answered. The ticket
              is marked as resolved but remains readable for reference.
            </li>
            <li>
              <b>Closed:</b> The ticket is archived. If the issue returns, open
              a new ticket and reference the old one.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            Writing effective tickets
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            The quality of your ticket directly affects how quickly it gets
            resolved.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 mt-15">
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Do this</p>
            <ul className="mt-2 text-[16px] leading-7 text-white/70 space-y-1">
              <li>Include server ID and name</li>
              <li>Paste full error messages</li>
              <li>Describe what you expected vs. what happened</li>
              <li>List steps to reproduce</li>
              <li>Attach screenshots or logs</li>
              <li>Mention what you have already tried</li>
            </ul>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Avoid this</p>
            <ul className="mt-2 text-[16px] leading-7 text-white/70 space-y-1">
              <li>"It's broken" with no details</li>
              <li>Vague descriptions like "not working"</li>
              <li>Multiple unrelated issues in one ticket</li>
              <li>Demanding immediate responses</li>
              <li>Sharing sensitive data (passwords, keys)</li>
              <li>Opening duplicate tickets for the same issue</li>
            </ul>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            Legal and policy references
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            These documents define the rules of the platform. Familiarize
            yourself with them.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <ul className="text-[16px] leading-10 text-white/70">
            <li>
              <b>
                <Link
                  href="/legal/terms-of-service"
                  className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
                >
                  Terms of Service:
                </Link>
              </b>{" "}
              The full terms governing your use of EcliPanel, including
              registration, payments, SLA, acceptable use, and account deletion.
            </li>
            <li>
              <b>
                <Link
                  href="/legal/privacy-policy"
                  className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
                >
                  Privacy Policy:
                </Link>
              </b>{" "}
              How we collect, store, and process your personal data. Covers data
              retention, third-party processors, and your rights under GDPR and
              other regulations.
            </li>
            <li>
              <b>
                <Link
                  href="/legal/acceptable-use-policy"
                  className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
                >
                  Acceptable Use Policy:
                </Link>
              </b>{" "}
              What you can and cannot do on the platform. Covers prohibited
              content, mining restrictions, AI usage rules, and consequences for
              violations.
            </li>
            <li>
              <b>
                <Link
                  href="/legal/cookies-policy"
                  className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
                >
                  Cookies Policy:
                </Link>
              </b>{" "}
              Information about cookies and tracking technologies used on
              ecli.app.
            </li>
            <li>
              <b>
                <Link
                  href="/legal/ai-policy"
                  className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
                >
                  AI Policy:
                </Link>
              </b>{" "}
              Rules around AI usage on the platform, including what is allowed
              in AI Studio and what is prohibited on infrastructure.
            </li>
            <li>
              <b>
                <Link
                  href="/legal/email-policy"
                  className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
                >
                  Email Policy:
                </Link>
              </b>{" "}
              Guidelines for email communications, anti-spam rules, and
              email-related restrictions.
            </li>
            <li>
              <b>
                <Link
                  href="/legal/minimum-age"
                  className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
                >
                  Minimum Age Policy:
                </Link>
              </b>{" "}
              Country-by-country age requirements for account registration and
              parental consent rules.
            </li>
            <li>
              <b>
                <Link
                  href="/legal/dmca-copyright-policy"
                  className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
                >
                  DMCA Copyright Policy:
                </Link>
              </b>{" "}
              How we handle copyright infringement reports and takedown
              requests.
            </li>
            <li>
              <b>
                <Link
                  href="/docs/sunset"
                  className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
                >
                  Sunset Policy:
                </Link>
              </b>{" "}
              How inactive accounts and idle servers are handled, including
              inactivity notices, grace periods, and deletion timelines.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            Troubleshooting workflow
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Before opening a ticket, try these steps to solve the problem
            yourself.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <ol className="list-decimal list-inside text-[16px] leading-10 text-white/70">
            <li>
              <b>Read the docs:</b> Check the relevant documentation page for
              the feature you are using. Most common issues are covered in{" "}
              <Link
                href="/docs"
                className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              >
                the docs
              </Link>
              .
            </li>
            <li>
              <b>Check the console:</b> Open your server console and look for
              error messages. The console output often tells you exactly what is
              wrong — missing files, port conflicts, configuration errors, or
              resource limits.
            </li>
            <li>
              <b>Verify your configuration:</b> Double-check startup commands,
              environment variables, port mappings, and file permissions. A
              single typo in a config file can prevent a server from starting.
            </li>
            <li>
              <b>Try a restart:</b> Sometimes a simple restart resolves
              transient issues. Use the Restart button on the server card or
              detail page.
            </li>
            <li>
              <b>Check resource usage:</b> If your server is slow or crashing,
              look at the resource rings on the server card. If CPU or RAM is
              maxed out, you may need to increase your allocation.
            </li>
            <li>
              <b>Open a ticket:</b> If none of the above works, open a support
              ticket. Include all the details you gathered during
              troubleshooting — this helps support skip the initial diagnostic
              steps and get straight to solving the problem.
            </li>
          </ol>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <p className="text-[16px] leading-10 text-white/70">
            For onboarding, see{" "}
            <Link
              href="/docs/getting-started"
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
            >
              Getting started
            </Link>
            . For server control and troubleshooting, visit{" "}
            <Link
              href="/docs/server-management"
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
            >
              Server management
            </Link>
            . For account inactivity and server sunset rules, see the{" "}
            <Link
              href="/docs/sunset"
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
            >
              Sunset policy
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
