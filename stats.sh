#!/bin/zsh
# Waitlist test numbers. "test" rows are our own checks; ignore them.
g() { curl -s -m 8 "https://abacus.jasoncameron.dev/get/wakebrain/$1" | python3 -c 'import json,sys;print(max(json.load(sys.stdin).get("value",0),0))' 2>/dev/null || echo "?"; }
printf "%-10s %8s %6s %6s %6s %6s\n" source visits pro sync super less
for r in reddit x gh hn obsidian ih linkedin google other direct test; do
  printf "%-10s %8s %6s %6s %6s %6s\n" $r $(g visits-$r) $(g signup-pro-$r) $(g signup-sync-$r) $(g signup-super-$r) $(g signup-less-$r)
done
printf "%-10s %8s %6s %6s %6s %6s\n" TOTAL $(g visits) $(g signup-pro) $(g signup-sync) $(g signup-super) $(g signup-less)
