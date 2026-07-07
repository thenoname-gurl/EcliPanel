#!/usr/bin/env bash
if [ -f .env ]; then
  sed -i 's/\r$//' .env || true
  set -a
  source .env
  set +a
fi
export NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE:-https://backend.ecli.app}
export NEXT_PUBLIC_WINGS_BASE=${NEXT_PUBLIC_WINGS_BASE:-}
export BACKEND_URL=${BACKEND_URL:-https://backend.ecli.app}
export NEXT_PUBLIC_COMMIT_SHA=$(git rev-parse --short HEAD)
export BROWSER_CHECK_SECRET=${BROWSER_CHECK_SECRET:-$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")}
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

build_and_start() {
	[[ -n "$PORT_OVERRIDE" ]] && export PORT="$PORT_OVERRIDE"
	for i in 1 2 3; do
		echo "Build attempt $i..."
		rm -rf .next
		if bun run build; then
			echo "Build succeeded!"
			break
		fi
		[[ $i -lt 3 ]] && sleep 3
	done

	HOST=0.0.0.0 bun run start
}

build_and_start