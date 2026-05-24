import Link from "next/link";
import { Clock, Server, ShieldCheck, Mail, AlertTriangle } from "lucide-react";
import GradualBlurMemo from "@/app/landing/_components/_reacts-bits/GradualBlur";
import { Menu } from "@/app/landing/_components/_custom/Menu";

export default function SunsetPolicyPage() {
  return (
    <main className="px-auto w-full px-4 py-10 sm:px-6 lg:px-8 flex justify-center bg-black">
      <div className="space-y-8 max-w-6xl">
        <section className="text-center shadow-xl shadow-black/5">
          <div className="">
            <p className="text-[clamp(2.5rem,8vw,6.5rem)] leading-[0.95] font-semibold tracking-tight text-foreground">
              Account & server sunset policy
            </p>
            <p className="max-w-3xl mx-auto text-sm leading-7 text-white/70 sm:text-base">
              Sunset policies keep inactive accounts secure and prevent unused
              servers from consuming resources indefinitely. This page explains
              both the account sunset flow and the server sunset flow, including
              timelines, what triggers them, and how to keep your services
              active.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-40">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Account sunset
            policy
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Account sunset applies to accounts that have not been accessed for
            an extended period. The goal is to protect dormant accounts from
            unauthorized access and free up resources. This policy affects all
            account types — free, educational, and paid.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 mt-15">
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">
              Inactivity threshold
            </p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">
              If you have not logged in to the dashboard for approximately 1
              year, your account becomes eligible for an inactivity notice. The
              clock resets every time you log in.
            </p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">
              Inactivity notice
            </p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">
              When the threshold is reached, we send an email to your registered
              address notifying you of the upcoming account review. The email
              contains a direct link to the login page.
            </p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">
              Grace period
            </p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">
              After the notice is sent, you have 90 days to log in before
              deletion is scheduled. Logging in at any point during this period
              cancels the deletion process.
            </p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">
              Account deletion
            </p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">
              If you do not log in within the grace period, your account and
              associated data are scheduled for deletion. Certain records may be
              retained where required by law or for legitimate business
              purposes.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h3 className="text-xl font-semibold text-foreground">
            Frequently asked questions
          </h3>
          <ul className="mt-1 text-[16px] leading-10 text-white/70">
            <li>
              <b>What keeps an account active?</b> Any login to the dashboard
              resets the inactivity timer. API key usage alone does not count —
              you must log in through the web interface.
            </li>
            <li>
              <b>What happens to my servers if my account is deleted?</b> All
              servers, files, databases, and data associated with the account
              are removed as part of the deletion process. Backups are also
              deleted unless they are stored externally.
            </li>
            <li>
              <b>What if I return after deletion?</b> Once an account is
              deleted, it cannot be recovered. You would need to create a new
              account and redeploy your servers. We recommend logging in
              periodically to avoid this.
            </li>
            <li>
              <b>Where is the confirmation link?</b> The inactivity notice email
              contains a direct link to the login page. Click it and sign in to
              cancel the pending deletion.
            </li>
            <li>
              <b>Can I request early deletion?</b> Yes. You can request account
              deletion from Settings or by contacting support. See our{" "}
              <Link
                href="/legal/terms-of-service"
                className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              >
                Terms of Service
              </Link>{" "}
              for the deletion request process.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" /> Server sunset policy
            (free & educational)
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Server sunset applies only to free and educational accounts that
            have online servers. The purpose is to prevent abandoned servers
            from consuming node resources indefinitely. Paid and enterprise
            accounts are excluded from this policy.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h3 className="text-xl font-semibold text-foreground">
            How it works
          </h3>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            If your free or educational account has servers that are running but
            you have not been active on the dashboard, we will send you a
            confirmation notice asking you to verify that you are still using
            the service.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 mt-15">
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">
              New accounts
            </p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">
              If you have just created your account and have not yet been
              active, we send the first confirmation notice after approximately
              24 hours of server online time.
            </p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">
              Ongoing activity
            </p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">
              After you have actively used the panel, confirmation notices
              repeat approximately every 7 days if your servers remain online
              without dashboard activity.
            </p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">
              Grace window
            </p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">
              Once a notice is sent, you have 24 hours to confirm your usage by
              logging in or interacting with the dashboard. After this window,
              online servers are powered off.
            </p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">
              What counts as confirmation?
            </p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">
              Any dashboard activity resets the timer — logging in, opening a
              server, checking settings, or using any panel feature. API key
              usage alone does not count.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h3 className="text-xl font-semibold text-foreground">
            Important details
          </h3>
          <ul className="mt-1 text-[16px] leading-10 text-white/70">
            <li>
              <b>Only online servers are affected.</b> Servers that are stopped
              or hibernated are not targeted by sunset notices. If you stop your
              servers when not in use, they will not trigger sunset checks.
            </li>
            <li>
              <b>Free and educational accounts only.</b> Paid plans and
              enterprise accounts are excluded from server sunset policy. If you
              upgrade your plan, the policy no longer applies to your servers.
            </li>
            <li>
              <b>Servers are powered off, not deleted.</b> After the grace
              window expires, online servers receive a kill action (force stop).
              Your files and data remain intact. You can restart the servers
              after logging in.
            </li>
            <li>
              <b>Notices are sent via email.</b> Make sure your registered email
              address is current and that you are receiving emails from
              EcliPanel. Check your spam folder if you are not seeing notices.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" /> Admin-requested
            confirmation
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            In addition to the automated sunset process, administrators can
            manually trigger a confirmation request for any account. This is
            used when administrators notice unusual activity patterns or need to
            verify account usage.
          </p>
        </section>

        <section className="bg-white/10 p-6 mt-15">
          <p className="text-lg font-semibold text-foreground">
            What happens when an admin triggers a confirmation?
          </p>
          <ul className="mt-2 text-[16px] leading-7 text-white/70 space-y-1">
            <li>An email is sent to your registered address immediately.</li>
            <li>
              You have a 48-hour grace period to confirm usage by logging in to
              the dashboard.
            </li>
            <li>
              If you do not respond within 48 hours, your online servers may be
              powered off.
            </li>
            <li>
              Logging in at any point during the grace period clears the notice
              and resets the timer.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-primary" /> How to avoid
            sunset actions
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Here are practical steps to keep your account and servers active.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <ul className="text-[16px] leading-10 text-white/70">
            <li>
              <b>Log in regularly.</b> Even a quick visit to the dashboard
              resets the inactivity timer. Make it a habit to check in at least
              once a week if you have free or educational servers running.
            </li>
            <li>
              <b>Stop servers when not in use.</b> If you are not actively using
              a server, stop it. Stopped servers do not trigger sunset notices
              and do not consume node resources.
            </li>
            <li>
              <b>Keep your email current.</b> Update your email address in
              Settings if it changes. Sunset notices are sent to your registered
              email, and if it is invalid, you will not receive them.
            </li>
            <li>
              <b>Check your spam folder.</b> Some email providers may classify
              EcliPanel emails as spam. Add our email domain to your safe
              senders list to ensure you receive notices.
            </li>
            <li>
              <b>Consider upgrading.</b> If you need servers to run continuously
              without sunset checks, consider upgrading to a paid plan which is
              excluded from server sunset policy.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            What to do if you received a sunset email
          </h2>
          <ol className="mt-1 list-decimal list-inside text-[16px] leading-10 text-white/70">
            <li>
              <b>Do not panic.</b> Your account and servers are not immediately
              deleted. You have time to respond.
            </li>
            <li>
              <b>Log in to the dashboard.</b> Click the link in the email or go
              to ecli.app and sign in. This alone clears the notice for account
              sunset and resets the timer for server sunset.
            </li>
            <li>
              <b>Check your servers.</b> If you have online servers, make sure
              they are still running and functioning as expected.
            </li>
            <li>
              <b>Stop unused servers.</b> If you have servers you no longer
              need, stop them to prevent future sunset notices and free up
              resources.
            </li>
            <li>
              <b>Update your email.</b> If the email address on your account is
              no longer valid, update it in Settings → Profile so future notices
              reach you.
            </li>
          </ol>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <p className="text-[16px] leading-10 text-white/70">
            If you believe you received a sunset email in error, contact support
            from the dashboard or visit{" "}
            <Link
              href="/docs/support"
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
            >
              Support & policies
            </Link>
            . For the full terms governing account deletion, see our{" "}
            <Link
              href="/legal/terms-of-service"
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
            >
              Terms of Service
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
