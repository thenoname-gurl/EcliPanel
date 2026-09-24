"use client"
import { Shield, Eye, Bell, Lock, Server, Users, AlertTriangle, FileSearch, Globe } from "lucide-react";
import GradualBlurMemo from "@/app/landing/_components/_reacts-bits/GradualBlur";
import { Menu } from "@/app/landing/_components/_custom/Menu";

export default function SecurityPage() {
  return (
    <main className="px-auto w-full px-4 py-10 sm:px-6 lg:px-8 flex justify-center bg-black">
      <GradualBlurMemo
        target="page"
        position="top"
        height="13rem"
        strength={2}
        divCount={5}
        curve="bezier"
        exponential
        opacity={1}
      />

      <Menu
        customMenu={[
          { label: "Legal Center", href: "/legal" },
          { label: "Privacy Policy", href: "/legal/privacy-policy" },
          { label: "Terms of Service", href: "/legal/terms-of-service" },
        ]}
        customCTA={{ label: "Home", href: "/" }}
      />

      <div className="space-y-8 max-w-6xl mt-15">
        {/* Hero */}
        <section className="text-center shadow-xl shadow-black/5 mt-10">
          <div className="">
            <p className="text-[clamp(2.5rem,8vw,6.5rem)] leading-[0.95] font-semibold tracking-tight text-foreground">
              Security
            </p>
            <p className="max-w-3xl mx-auto mt-6 text-[16px] leading-7 text-white/70">
              Our commitment to protecting personal data, yours and everyone
              else's, against internal and external threats. Security is a core
              part of how we operate.
            </p>
          </div>
        </section>

        {/* Mission */}
        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            1. Our mission
          </h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            We believe every person has the right to digital safety. Our mission
            extends beyond protecting the data entrusted to us by our users. We
            actively work to protect personal data wherever it is at risk. We
            investigate breaches we become aware of, we notify affected
            individuals even when we have no legal obligation to do so, and we
            advocate for stronger data protection practices across the industry.
          </p>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            This means we do not limit our security efforts to our own
            infrastructure. When we discover vulnerabilities in third-party
            systems, exposed datasets, or evidence that personal data has been
            compromised elsewhere, we take action: we notify the responsible
            parties, we alert affected individuals when feasible, and we
            publicly document our findings when doing so serves the public
            interest.
          </p>
        </section>

        {/* How we protect data on our platform */}
        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            2. How we protect data on our platform
          </h2>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="bg-white/10 p-6">
              <div className="flex items-center gap-3">
                <Lock className="h-5 w-5 text-indigo-400" />
                <h3 className="text-lg font-semibold text-foreground">
                  Argon2id password hashing
                </h3>
              </div>
              <p className="mt-3 text-[16px] leading-7 text-white/70">
                Passwords are stored exclusively as argon2id hashes, a
                memory-hard algorithm designed to resist GPU cracking. Legacy
                bcrypt hashes are detected and flagged for upgrade whenever a
                password is reset or changed.
              </p>
            </div>

            <div className="bg-white/10 p-6">
              <div className="flex items-center gap-3">
                <Server className="h-5 w-5 text-indigo-400" />
                <h3 className="text-lg font-semibold text-foreground">
                  Post-quantum cryptography
                </h3>
              </div>
              <p className="mt-3 text-[16px] leading-7 text-white/70">
                Our stack uses ML-KEM-768 (Kyber-768) key encapsulation for
                key exchange and ML-DSA-65 post-quantum signatures for session
                JWTs, designed to remain secure against future quantum
                computers.
              </p>
            </div>

            <div className="bg-white/10 p-6">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-indigo-400" />
                <h3 className="text-lg font-semibold text-foreground">
                  Passkey and two-factor authentication
                </h3>
              </div>
              <p className="mt-3 text-[16px] leading-7 text-white/70">
                We support WebAuthn passkeys (including hardware security keys)
                for passwordless and second-factor authentication, verified
                server-side against attestation data.
              </p>
            </div>

            <div className="bg-white/10 p-6">
              <div className="flex items-center gap-3">
                <Eye className="h-5 w-5 text-indigo-400" />
                <h3 className="text-lg font-semibold text-foreground">
                  CSRF protection and constant-time checks
                </h3>
              </div>
              <p className="mt-3 text-[16px] leading-7 text-white/70">
                Every session receives a unique CSRF token, validated with
                timing-safe comparisons. Sensitive operations use
                constant-time crypto throughout the stack.
              </p>
            </div>

            <div className="bg-white/10 p-6">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-indigo-400" />
                <h3 className="text-lg font-semibold text-foreground">
                  Automated security scanning and threat intel
                </h3>
              </div>
              <p className="mt-3 text-[16px] leading-7 text-white/70">
                We continuously scan our infrastructure for security findings,
                score IP reputation against threat-intelligence feeds, and
                route alerts to a dedicated SOC dashboard for rapid response.
              </p>
            </div>

            <div className="bg-white/10 p-6">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-indigo-400" />
                <h3 className="text-lg font-semibold text-foreground">
                  Full audit logging
                </h3>
              </div>
              <p className="mt-3 text-[16px] leading-7 text-white/70">
                Administrative and security-sensitive actions are written to
                immutable audit logs, giving us a complete record of who did
                what and when. This enables post-incident investigation.
              </p>
            </div>

            <div className="bg-white/10 p-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-indigo-400" />
                <h3 className="text-lg font-semibold text-foreground">
                  CAPTCHA, KYC, and fraud prevention
                </h3>
              </div>
              <p className="mt-3 text-[16px] leading-7 text-white/70">
                Registration and abuse-prone actions are protected by our
                self-hosted CAPTCHA (including audio and invisible variants),
                identity verification, and automated fraud detection.
              </p>
            </div>

            <div className="bg-white/10 p-6">
              <div className="flex items-center gap-3">
                <Server className="h-5 w-5 text-indigo-400" />
                <h3 className="text-lg font-semibold text-foreground">
                  Infrastructure hardening
                </h3>
              </div>
              <p className="mt-3 text-[16px] leading-7 text-white/70">
                Our infrastructure runs on hardened systems with a minimal
                attack surface and strict firewall rules. Security patches are
                applied within 24 hours of release.
              </p>
            </div>

            <div className="bg-white/10 p-6">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-indigo-400" />
                <h3 className="text-lg font-semibold text-foreground">
                  Internal threat protection
                </h3>
              </div>
              <p className="mt-3 text-[16px] leading-7 text-white/70">
                All staff undergo background checks and mandatory security
                training. Two-factor authentication is required for
                administrative access, and separation of duties is enforced
                throughout.
              </p>
            </div>

            <div className="bg-white/10 p-6">
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-indigo-400" />
                <h3 className="text-lg font-semibold text-foreground">
                  EU data protection compliance
                </h3>
              </div>
              <p className="mt-3 text-[16px] leading-7 text-white/70">
                We comply with EU data protection regulations and give you the
                ability to disable telemetry and tracking entirely. Privacy is
                the default, and you stay in control.
              </p>
            </div>
          </div>
        </section>

        {/* Pentesting and external work */}
        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            3. Penetration testing and external security research
          </h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            We conduct and commission regular penetration tests against our own
            infrastructure. Beyond our own systems, we may perform authorized
            security testing on third-party systems, with explicit permission
            from the system owners, to identify vulnerabilities that could
            expose personal data. A breach anywhere in the ecosystem can
            cascade into real harm.
          </p>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            Third-party security researchers are welcome to test our systems
            under a responsible disclosure framework. We maintain a dedicated
            testing environment at{" "}
            <span className="font-medium text-foreground">canary.ecli.app</span>{" "}
            for this purpose. Researchers must obtain prior written
            authorization before testing against production systems.
            Unauthorized testing remains prohibited under our{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="/legal/acceptable-use-policy"
            >
              Acceptable Use Policy
            </a>
            .
          </p>
        </section>

        {/* Vulnerability disclosure */}
        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            4. Vulnerability disclosure
          </h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            If you discover a security vulnerability in our systems, report it
            to{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="mailto:security@ecli.app"
            >
              security@ecli.app
            </a>
            . We acknowledge reports within 24 hours and provide a timeline for
            resolution. We do not pursue legal action against researchers who
            act in good faith under our disclosure guidelines. We may offer
            monetary rewards in some cases.
          </p>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            Do not open a public GitHub issue. Do not disclose the vulnerability
            publicly before we have had a reasonable opportunity to address it.
            See our{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="https://github.com/thenoname-gurl/EcliPanel/blob/main/SECURITY.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              full security policy
            </a>{" "}
            for detailed expectations and scope.
          </p>
        </section>

        {/* Breach notification */}
        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            5. Breach notification
          </h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            In the event of a confirmed data breach involving personal data on
            our platform, we will notify affected individuals without undue
            delay, no later than 72 hours after becoming aware of the breach.
            Notifications will describe the nature of the breach, the categories
            of data concerned, the likely consequences, and the measures we have
            taken or propose to take.
          </p>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            Our commitment to notification extends beyond our own systems. If we
            become aware of a breach at a third-party service that affects
            individuals, whether or not they are our customers, we will make a
            reasonable effort to notify those affected. We will not stay silent
            about a breach we become aware of.
          </p>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            If you have evidence of a data breach involving EclipseSystems or
            believe personal data has been exposed through our infrastructure,
            contact{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="mailto:security@ecli.app"
            >
              security@ecli.app
            </a>{" "}
            immediately.
          </p>
        </section>

        {/* External advocacy */}
        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            6. Beyond our walls
          </h2>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            Data protection does not stop at our network boundary. We monitor
            for exposed datasets, misconfigured services, and leaked credentials
            across the public internet. When we find personal data exposed
            through no fault of the individuals it belongs to, we take
            reasonable steps to ensure it is secured, by notifying the data
            controller, the hosting provider, or the affected individuals
            directly.
          </p>
          <p className="mt-4 text-[16px] leading-7 text-white/70">
            We also engage with the broader security community, contribute to
            open-source security tooling, and support initiatives that advance
            data protection rights. If you run an organization that shares these
            values and wants to collaborate on data protection efforts, reach
            out to{" "}
            <a
              className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors"
              href="mailto:noname@ecli.app"
            >
              noname@ecli.app
            </a>
            .
          </p>
        </section>

        {/* Contact */}
        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            7. Report a security concern
          </h2>
          <div className="mt-6 bg-white/10 p-8 text-center">
            <p className="text-[16px] leading-7 text-white/70">
              If you believe you have found a security vulnerability or have
              evidence of a data breach involving our systems, contact us
              immediately. We treat every report with urgency.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="mailto:security@ecli.app"
                className="inline-flex items-center gap-2 bg-white px-6 py-3 font-semibold text-black transition-all hover:bg-white/80"
              >
                <Bell className="h-4 w-4" />
                security@ecli.app
              </a>
              <a
                href="https://github.com/thenoname-gurl/EcliPanel/blob/main/SECURITY.md"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 border border-white/20 px-6 py-3 font-semibold text-white transition-all hover:bg-white/10"
              >
                <Shield className="h-4 w-4" />
                Full security policy
              </a>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
