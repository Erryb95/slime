#!/bin/bash
cd /c/Users/erryb/Desktop/Plugin/bench
for q in 1 5; do AMQ=$q node am_suite.js insegna48 swim gardeyn9 | sed "s/^/q=$q /"; done
AMQ=15 node am_suite.js swim | sed "s/^/q=15rerun /"
