#!/bin/bash

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <version>"
    echo "Example stable: $0 1.0.0"
    echo "Example pre-release: $0 1.0.0-pre.1"
    exit 1
fi

VERSION=$1

REGEX="^([0-9]+\.[0-9]+\.[0-9]+|[0-9]+\.[0-9]+\.[0-9]+-pre\.[0-9]+)$"

if [[ ! $VERSION =~ $REGEX ]]; then
    echo "Error: Invalid version format '$VERSION'."
    echo "Allowed formats are strict SemVer:"
    echo "  - Stable:      x.x.x         (e.g., 1.0.0)"
    echo "  - Pre-release: x.x.x-pre.x   (e.g., 1.0.0-pre.1)"
    exit 1
fi

TAG_NAME="release-$VERSION"

echo "Applying tag: $TAG_NAME..."

if git tag "$TAG_NAME"; then
    echo "Tag created successfully."
else
    echo "Error: Failed to create tag '$TAG_NAME'. Does it already exist locally?"
    exit 1
fi

echo "Pushing $TAG_NAME to origin..."

if git push origin "$TAG_NAME"; then
    echo "Success! Pushed $TAG_NAME to origin."
    echo "Your GitHub Actions release pipeline should trigger shortly."
else
    echo "Error: Failed to push tag. Check your network or git permissions."
    exit 1
fi
