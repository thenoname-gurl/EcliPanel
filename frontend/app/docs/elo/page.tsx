import { Md } from "../_components/md";

const content = `
# ELO Rating System

EcliPanel's ELO system brings community-driven ranking and resource scaling to your servers. Server performance adjusts based on community votes, creating a competitive ecosystem where popular, high-quality servers earn more resources.

## How it works

ELO servers use a modified ELO rating algorithm (the same math behind chess rankings) to determine server resources. Resources scale linearly with ELO score, from 256 MB RAM at minimum to 24 GB at maximum.

| ELO Score | CPU | RAM | Disk |
|---|---|---|---|
| 200 (min) | 20% | 256 MB | 2 GB |
| 1000 (base) | 100% | 2 GB | 40 GB |
| 2000 | 200% | 4 GB | 80 GB |
| 5000 | 500% | 10 GB | 200 GB |
| 12000 (max) | 1200% | 24 GB | 500 GB |

**Verified students** receive a +20% resource bonus on top of their ELO-calculated resources.

## Creating an ELO server

1. Go to the **Servers** page and click **New Server**.
2. Select your template and node.
3. Enable **ELO Features**.
4. Complete the remaining fields and deploy.

ELO servers use a separate slot limit (default 1 slot).  
Every **20 votes** you cast unlocks **+1 additional slot**.

## Voting

Voting uses **pairwise comparison** — you see two projects side by side and pick which one is better. This produces more accurate rankings than simple like/dislike systems.

### Rules

- **Daily limit**: 20 votes  
- **Account age**: 7+ days  
- **No self-voting**  
- **No repeating the same pair within 24h**  
- **10-second cooldown between votes**  
- **Feedback required**: at least 20 words  
- **No copy-paste**: repeated text is rejected  
- **Spam/gibberish feedback may be rejected**

### Weighted voting

- Standard users: **1.0×** vote weight  
- **Verified students**: **1.1×** vote weight
- Beating a higher-ranked project transfers more ELO points  
- Rankings stabilize over time as more votes accumulate

### Voting steps

1. Go to the **Vote** page from the ELO dashboard.
2. Review both projects — screenshots, description, README, devlogs, GitHub repo, demo/server links.
3. Write your feedback (20+ words).
4. Click **Pick This Project** on the one you believe is better.
5. ELO scores update immediately and server resources sync in real time.

### Skip a pair

If you're unsure about a matchup, click **Skip this pair**.  
After 5 skips, you'll see a reminder to try voting.

### Report a project

Each voting card has a **Report this project** link for inappropriate or rule-breaking content.

## Feedback & Moderation

Every vote requires written feedback (minimum 20 words).  
The system enforces:

- **Minimum length**  
- **Originality** (no reusing recent feedback)  
- **Spam detection**  

## Devlogs

Devlogs are markdown-based update posts attached to your ELO project.

They help you:

1. Communicate updates to voters  
2. Reset your skip tokens to the maximum (5)

### Writing a devlog

1. Open your project in the ELO dashboard.
2. Click the devlog icon.
3. Enter a title and content (markdown supported).
4. Optionally attach up to 3 images.
5. Publish.

### Vote requirement for devlogs

You must have cast **at least 1 vote in the last 14 days** to publish a devlog.

### Devlogs in voting

When voting, each project card shows a **Devlogs** toggle listing recent devlogs.

## Skip tokens

Each ELO project has 5 skip tokens.

| Action | Effect |
|---|---|
| Publish devlog | Resets skip tokens to 5 |
| Vote in last 14 days | Required to publish devlogs |
| Start server (recent devlog exists) | Free |
| Start server (no recent devlog, tokens > 0) | Consumes 1 token |
| Start server (no recent devlog, 0 tokens) | Blocked — must publish devlog |
| Restart server | Same logic |

A “recent devlog” means published within the last 7 days.

## Project profile

Every ELO project has a public profile at \`/elo/projects/[id]\` and a dashboard version at \`/dashboard/elo/projects/[id]\`.

### What's shown

- **Title & ELO badge** (color-coded)
- **Owner name**
- **Tags**
- **Description** (markdown)
- **README** (markdown)
- **Screenshots**
- **GitHub link**
- **Demo URL**
- **Resources** (CPU, RAM, disk)
- **Devlogs**
- **Vote History** (opponent, outcome, ELO change, voter, feedback)

### Editing your profile

You can update:

- Title  
- Description  
- GitHub URL  
- Demo URL  
- Tags  
- Screenshots  
- README  

## Leaderboard

The leaderboard at \`/dashboard/elo/leaderboard\` ranks all ELO projects by score.

- Top 3 highlighted  
- Columns: Rank, Project, ELO Score, Votes, W/L, Win%, Owner  
- Paginated (50 per page)  
- Sorted by ELO descending  

## Vote History

Shows every vote the project has participated in:

- Win/loss indicator  
- Opponent  
- Voter  
- ELO change  
- Date  
- Feedback (expandable)  

## Resource scaling

When a project's ELO changes, the server's CPU, RAM, and disk limits update automatically.  
If ELO drops below current usage, the server keeps its current limits until the next restart.

## ELO decay

Projects inactive for more than 30 days begin losing ELO:

- **Grace period**: 30 days  
- **Decay rate**: 5% per day  
- **Minimum ELO**: 100  
- **K-factor reset** after decay  

Decay runs daily.

## Frequently asked questions

**Can I convert a regular server to an ELO server?**  
No.

**Can I set resources manually on an ELO server?**  
No.

**Do ELO servers count against my server limit?**  
Yes.

**What happens if my ELO drops below my current resource usage?**  
Lower limits apply after the next restart.

**Can I have multiple ELO servers?**  
Yes, up to your slot limit.

**How do I unlock more ELO slots?**  
Every 20 votes unlocks one slot.

**Can I see who voted on my project?**  
Yes — shown in Vote History.

**What happens if I get a spam warning?**  
You may face voting restrictions.

**Is there a way to reset my daily votes?**  
They reset automatically at midnight UTC.
`;

export default function EloDocsPage() {
  return <Md>{content}</Md>;
}