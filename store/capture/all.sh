#!/bin/bash
# all.sh <langs...>: fresh server per language: seed, earlier visitors, the featured chat, screenshots.
cd "$(dirname "$0")"
export NODE_PATH=$(npm root -g)
for L in "$@"; do
  export LIVECHAT_DEMO_REASON=$(python3 -c "import json;print(json.load(open('rec/texts.json'))['$L']['reason'])")
  pkill -f "lcdemo serve"; for i in $(seq 40); do curl -s -o /dev/null http://127.0.0.1:8080/healthz || break; sleep 0.5; done; sleep 1
  export LOG=$PWD/server-$L.log; setsid nohup ./run-demo.sh > server-$L.log 2>&1 < /dev/null &
  for i in $(seq 40); do curl -s -o /dev/null http://127.0.0.1:8080/healthz && break; sleep 0.5; done
  ./seed.sh $L > seed-$L.log 2>&1 || { echo "seed $L failed"; continue; }
  python3 rec/seedbg.py $L > bg-$L.log 2>&1 || { echo "bg $L failed"; continue; }
  python3 story.py $L > story-$L.log 2>&1 || { echo "story $L failed"; continue; }
  node shot.cjs $L light raw/$L 3 || { echo "shot $L failed"; continue; }
  echo "ok $L"
done
pkill -f "lcdemo serve"
