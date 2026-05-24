import { Md } from "./_components/md";

const content = `
# EcliPanel Documentation

Learn how to set up your account, deploy servers, manage resources, and get help. Each guide walks you through the exact screens and features in the panel — from your first login to running production workloads.

## Guides

- [Getting started](/docs/getting-started) — Create an account, verify your email, secure it with 2FA, and deploy your first server in under 10 minutes.
- [Server management](/docs/server-management) — Console access, file management, databases, port forwarding, power controls, and troubleshooting guides.
- [KVM & Linux beginner guide](/docs/kvm) — Deploy the Debian 13 VM, set up SSH, harden security, configure the firewall, and learn essential Linux commands.
- [Deploying apps & games](/docs/deploying-apps) — Every available template explained, how to choose the right one, and step-by-step deployment workflows.
- [Sunset policy](/docs/sunset) — How inactivity notices work, grace periods, what happens to idle accounts and servers, and how to stay active.
- [Support & policies](/docs/support) — Open tickets, track responses, and access the full legal center for terms, privacy, and acceptable use.

## What this docs center contains

Use these pages to learn how the panel works, what each page does, and what you can do without logging in.

**Account & security** — Register, sign in, verify email, enable 2FA or passkeys, configure notifications, and customize your theme and appearance.

**Servers & templates** — Create servers, choose templates, use the console, manage files, configure startup commands, set up databases, and monitor resource usage.

**Linux & KVM** — Deploy the Debian 13 VM, set up SSH key authentication, harden your server with UFW, manage services with systemd, and learn essential Linux commands.

**Sunset policy** — How inactivity notices work for accounts and servers, grace periods, what triggers sunset actions, and how to keep your services active.

**Support & policies** — Open support tickets, track conversations, and access the legal center for terms of service, privacy policy, acceptable use, and more.

## How to use this guide

Start with the page that matches your goal. If you are new to the panel, begin with Getting Started. If you already have a server running, jump to Server Management or the KVM Guide. Each page explains the exact panel screens and features you will use.

## Legal documents

For the full terms of service, privacy policy, acceptable use policy, and other legal documents, visit the [Legal Center](/legal). These documents define your rights and responsibilities as a user of EcliPanel.
`;

export default function Page() {
  return <Md>{content}</Md>;
}
