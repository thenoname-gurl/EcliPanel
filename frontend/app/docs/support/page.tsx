import { Md } from "../_components/md";

const content = `
# Help, support, and policy resources

## Support channels

| Channel | Use it for |
|---|---|
| In-app tickets (primary) | Technical issues, billing questions, account problems, and feature requests. Fastest and most reliable channel. All conversations are tracked and searchable. |
| Email — [legal@ecli.app](mailto:legal@ecli.app) | Legal questions, compliance inquiries, DMCA notices, or data protection requests. Not for technical support. |
| Documentation | Browse the [docs](/docs) for guides on every feature. Most common questions are answered here before you need to open a ticket. |
| Legal center | Read our [terms of service](/legal), privacy policy, acceptable use policy, and other legal documents. |

## How to open a support ticket

1. **Log in to the dashboard.** You must be authenticated to create tickets.
2. **Navigate to Tickets.** Find the Tickets section in your dashboard sidebar or navigation.
3. **Click New Ticket.** This opens the ticket creation form.
4. **Choose a category.** Select Technical, Billing, Account, Abuse Report, or Other. Choosing the right category routes your ticket to the right team.
5. **Write a clear description.** Include: what you were trying to do, what actually happened, server ID or name, full error messages, steps to reproduce, and screenshots or logs if available.
6. **Submit the ticket.** You will receive a confirmation and can track the conversation from the Tickets page.
7. **Check back for replies.** Support will respond within the ticket thread. Keep an eye on your notification settings so you do not miss responses.

> Tip: Attach screenshots, console logs, or config files when possible. A picture of an error message is often more helpful than a description of it.

## Ticket lifecycle

- **Open** — Your ticket has been received and is waiting in the queue.
- **In Progress** — A support agent is actively working on your issue and may ask for additional information.
- **Pending** — Support has replied and is waiting for your response. Reply promptly to keep the conversation active.
- **Resolved** — The issue has been fixed or answered. The ticket remains readable for reference.
- **Closed** — The ticket is archived. If the issue returns, open a new ticket and reference the old one.

## Writing effective tickets

| Do this | Avoid this |
|---|---|
| Include server ID and name | "It's broken" with no details |
| Paste full error messages | Vague descriptions like "not working" |
| Describe what you expected vs. what happened | Multiple unrelated issues in one ticket |
| List steps to reproduce | Demanding immediate responses |
| Attach screenshots or logs | Sharing sensitive data (passwords, keys) |
| Mention what you have already tried | Opening duplicate tickets for the same issue |

## Legal and policy references

- [**Terms of Service**](/legal/terms-of-service) — The full terms governing your use of EcliPanel, including registration, payments, SLA, acceptable use, and account deletion.
- [**Privacy Policy**](/legal/privacy-policy) — How we collect, store, and process your personal data. Covers data retention, third-party processors, and your rights under GDPR.
- [**Acceptable Use Policy**](/legal/acceptable-use-policy) — What you can and cannot do on the platform. Covers prohibited content, mining restrictions, AI usage rules, and consequences for violations.
- [**Cookies Policy**](/legal/cookies-policy) — Information about cookies and tracking technologies used on ecli.app.
- [**AI Policy**](/legal/ai-policy) — Rules around AI usage on the platform, including what is allowed in AI Studio and what is prohibited on infrastructure.
- [**Email Policy**](/legal/email-policy) — Guidelines for email communications, anti-spam rules, and email-related restrictions.
- [**Minimum Age Policy**](/legal/minimum-age) — Country-by-country age requirements.
- [**DMCA Copyright Policy**](/legal/dmca-copyright-policy) — How we handle copyright infringement reports and takedown requests.
- [**Sunset Policy**](/docs/sunset) — How inactive accounts and idle servers are handled, including inactivity notices, grace periods, and deletion timelines.

## Troubleshooting workflow

Before opening a ticket, try these steps first.

1. **Read the docs** — Check the relevant documentation page. Most common issues are covered in [the docs](/docs).
2. **Check the console** — Open your server console and look for error messages. The console output often tells you exactly what is wrong.
3. **Verify your configuration** — Double-check startup commands, environment variables, port mappings, and file permissions. A single typo in a config file can prevent a server from starting.
4. **Try a restart** — Sometimes a simple restart resolves transient issues.
5. **Check resource usage** — If your server is slow or crashing, look at the resource rings on the server card. If CPU or RAM is maxed out, you may need to increase your allocation.
6. **Open a ticket** — If none of the above works, open a support ticket with all the details you gathered during troubleshooting.

---

For onboarding, see [Getting started](/docs/getting-started). For server control and troubleshooting, visit [Server management](/docs/server-management). For account inactivity and server sunset rules, see the [Sunset policy](/docs/sunset).
`;

export default function Page() {
  return <Md>{content}</Md>;
}
