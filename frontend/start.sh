#!/usr/bin/env bash
# example env variables for frontend
# NEXT_PUBLIC_API_BASE must be empty so browser requests go to same-origin
# and hit the Next.js /api/* rewrite → Fastify backend.
# Setting it to a URL makes the browser call that URL directly (CORS issues,
# wrong port, etc.).
export NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE:-https://backend.ecli.app}
export NEXT_PUBLIC_WINGS_BASE=${NEXT_PUBLIC_WINGS_BASE:-}
export BACKEND_URL=${BACKEND_URL:-https://backend.ecli.app}
# start next.js
npm run dev
