#!/bin/bash
cd /c/Users/erryb/Desktop/Plugin/bench
mkdir -p results
for k in $(python -c "import json;print(' '.join(m['key'] for m in json.load(open('suite/manifest.json'))))"); do
  ../target/release/sparrow.exe -i suite/$k.json -t 60 -s 1 --min-item-separation 2 > results/native_$k.log 2>&1
  cp ../output/final_$k.json results/sparrow_native_$k.json
  node wasm_run.js suite/$k.json 48 12 2 > results/sparrow_wasm_$k.json 2>results/wasm_$k.err
  echo "$k native=$(python -c "import json;d=json.load(open('results/sparrow_native_$k.json'))['solution'];print(round(d['strip_width'],1))") wasm=$(cat results/sparrow_wasm_$k.json)"
done
echo ALLDONE
