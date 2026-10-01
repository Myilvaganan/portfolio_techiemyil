#!/usr/bin/env bash
# Build the Android app and send it to your phone through Firebase App Distribution.
# The Firebase "App Tester" app on the phone then offers the update.
#
# One-time setup: `npx firebase-tools login` (opens a browser), and accept the tester invite email on the phone.
# Usage: npm run android:release -- "What changed"
set -euo pipefail
cd "$(dirname "$0")/.."

APP_ID="1:158879978434:android:4dd0d89eaf6ede3154fc5b"
TESTERS="${TESTERS:-myilsmp@gmail.com}"
NOTES="${1:-$(git log -1 --format=%s)}"
# Every build gets a higher version number than the last, so Android accepts it as an update.
CODE=$(git rev-list --count HEAD)
NAME="1.$CODE"

npx cap sync android
(cd android && ./gradlew assembleDebug -PversionCode="$CODE" -PversionName="$NAME")
npx -y firebase-tools appdistribution:distribute android/app/build/outputs/apk/debug/app-debug.apk \
  --app "$APP_ID" --testers "$TESTERS" --release-notes "$NOTES"
echo "Sent version $NAME to $TESTERS"
