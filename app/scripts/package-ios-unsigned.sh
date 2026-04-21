#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d ios ]; then
  pnpm exec cap add ios
fi

pnpm exec cap sync ios

IOS_WORKSPACE=$(find ios -type d -name '*.xcworkspace' | head -n 1 || true)
IOS_PROJECT=$(find ios -type d -name '*.xcodeproj' | head -n 1 || true)

if [ -n "$IOS_WORKSPACE" ]; then
  XCODE_ARG="-workspace"
  XCODE_TARGET="$IOS_WORKSPACE"
elif [ -n "$IOS_PROJECT" ]; then
  XCODE_ARG="-project"
  XCODE_TARGET="$IOS_PROJECT"
else
  echo "Error: no Xcode workspace or project found under ios/"
  exit 1
fi

SCHEME=$(xcodebuild $XCODE_ARG "$XCODE_TARGET" -list | awk '/Schemes:/ {found=1; next} found && NF {print $1; exit}')

if [ -z "$SCHEME" ]; then
  echo "Error: could not detect Xcode scheme"
  exit 1
fi

ARCHIVE_PATH="ios/build/$SCHEME.xcarchive"
IPA_DIR="ios/build/unsigned_ipa"

mkdir -p "$(dirname "$ARCHIVE_PATH")"

xcodebuild $XCODE_ARG "$XCODE_TARGET" -scheme "$SCHEME" -configuration Release -sdk iphoneos archive -archivePath "$ARCHIVE_PATH" CODE_SIGN_IDENTITY="" CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO DEVELOPMENT_TEAM=""

mkdir -p "$IPA_DIR/Payload"
cp -R "$ARCHIVE_PATH/Products/Applications/$SCHEME.app" "$IPA_DIR/Payload/"

cd "$IPA_DIR"
zip -r ../App-unsigned.ipa Payload