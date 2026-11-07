#!/usr/bin/env bash
# Store version from a release tag, for the app-android and app-ios release
# jobs: v1.2.3 → name=1.2.3, code=1002003 (Play's versionCode and the iOS
# build number both have to go up with every upload). Only plain v1.2.3
# tags.
set -euo pipefail
if [ "${GITHUB_REF_TYPE:-}" != tag ] || ! [[ "${GITHUB_REF_NAME:-}" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "::error::Run this from a release tag (push a tag like v1.2.3), not ${GITHUB_REF_NAME:-?}"
  exit 1
fi
major=${BASH_REMATCH[1]} minor=${BASH_REMATCH[2]} patch=${BASH_REMATCH[3]}
if [ "$minor" -gt 999 ] || [ "$patch" -gt 999 ]; then
  echo "::error::minor and patch must be below 1000"
  exit 1
fi
{
  echo "name=${major}.${minor}.${patch}"
  echo "code=$((10#$major * 1000000 + 10#$minor * 1000 + 10#$patch))"
} | tee -a "${GITHUB_OUTPUT:-/dev/null}"
