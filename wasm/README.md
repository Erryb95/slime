# corvo-wasm — demo del plugin di nesting nel browser

Wrapper wasm-bindgen attorno a `sparrow::optimizer::optimize`, più la pagina demo
(`demo/index.html` + `demo/worker.js`) che lo usa dentro un Web Worker.

## Prerequisiti

- Rust ≥ 1.90 (https://rustup.rs)
- target wasm: `rustup target add wasm32-unknown-unknown`
- `cargo install wasm-bindgen-cli --locked`

## Build

```bash
cd wasm
RUSTFLAGS='--cfg getrandom_backend="wasm_js"' cargo build --release --target wasm32-unknown-unknown
wasm-bindgen --target no-modules --out-dir demo --out-name corvo \
  target/wasm32-unknown-unknown/release/corvo_wasm.wasm
cp ../data/input/{swim,shirts,trousers}.json demo/
```

## Avvio della demo

```bash
cd wasm/demo
python3 -m http.server 8123
# poi apri http://localhost:8123/index.html
```

I Web Worker non partono da `file://`: serve un server HTTP locale.

## API

`nest(instance_json, explore_secs, compress_secs, seed, min_separation, on_report)`

- `instance_json`: istanza jagua-rs `ExtSPInstance` (`name`, `strip_height`, `items[]`)
- `on_report(json)`: chiamata a ogni soluzione fattibile con `strip_width`, `density`, `placements[]`
- ritorna la soluzione finale in formato `ExtSPSolution`
