# Design Context

The full canonical Design Context lives in `.better-web-ui.md` at the project root. This file mirrors the Design Context section for discoverability.

For the complete context — including Implementation Defaults, shadcn Customizations, and Design Principles — refer to `.better-web-ui.md` in the project root.

Below is an abbreviated summary:

## Users

EcliPanel serves a **mixed audience**: game server owners/managers, developers deploying apps, and hosting providers/teams.

**Job to be done**: Provision, manage, monitor, and secure game servers and applications across a distributed node network — from a single panel.

## Brand Personality

Modern, Clean, Professional — with a youth/developer-focused edge. Balanced middle ground: professional but with personality.

## Aesthetic Direction

- Dark-first with light theme options (14 themes in `frontend/lib/themes.ts`)
- Purple primary (`#8b5cf6`), deep backgrounds (`#0a0a12`), subtle glow effects
- Gently rounded corners (`0.75rem`), Geist/Geist Mono/Didact Gothic fonts
- framer-motion for micro-interactions, custom view-transitions for theme switching

## Design Principles

1. Establish hierarchy with spacing, weight, and typography before adding color or glow.
2. Use glow and animation sparingly as emphasis, not decoration.
3. Prioritize speed and clarity in every interaction.
4. Keep one obvious primary action per context.
5. Honor the theme system — always use CSS variables, never hardcode colors.
6. Design for a mixed audience without alienating any group.

> **See `.better-web-ui.md` for the full Design Context.**