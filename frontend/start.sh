#!/usr/bin/env bash
export NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE:-https://backend.ecli.app}
export NEXT_PUBLIC_WINGS_BASE=${NEXT_PUBLIC_WINGS_BASE:-}
export BACKEND_URL=${BACKEND_URL:-https://backend.ecli.app}
export NEXT_PUBLIC_COMMIT_SHA=$(git rev-parse --short HEAD)
export BROWSER_CHECK_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
PORT_OVERRIDE=""
while [[ $# -gt 0 ]]; do
	case "$1" in
		-p|--port)
			if [[ "$1" == "--port" && "$1" == *=* ]]; then
				PORT_OVERRIDE="${1#*=}"
			else
				shift
				PORT_OVERRIDE="$1"
			fi
			shift
			;;
		--port=*)
			PORT_OVERRIDE="${1#*=}"
			shift
			;;
		-h|--help)
			echo "Usage: $0 [-p PORT|--port=PORT]"
			exit 0
			;;
		*)
			shift
			;;
	esac
done

if [[ -n "$PORT_OVERRIDE" ]]; then
	echo "Starting frontend on port $PORT_OVERRIDE"
	PORT="$PORT_OVERRIDE" npm run build
	PORT="$PORT_OVERRIDE" HOST=0.0.0.0 npm run start
else
	npm run build
	HOST=0.0.0.0 npm run start
fi