//! Thin WebAssembly wrapper around `sparrow::optimizer::optimize`.
//!
//! `nest` takes a jagua-rs strip packing instance as JSON, runs sparrow with
//! the given time budget and reports every feasible solution to a JS callback,
//! so a page can animate the layout while the search is still running.

use jagua_rs::io::import::Importer;
use jagua_rs::probs::spp::entities::{SPInstance, SPSolution};
use jagua_rs::probs::spp::io::ext_repr::ExtSPInstance;
use rand::SeedableRng;
use rand::rngs::Xoshiro256PlusPlus;
use serde::Serialize;
use sparrow::config::{DEFAULT_SPARROW_CONFIG, ShrinkDecayStrategy};
use sparrow::consts::{DEFAULT_FAIL_DECAY_RATIO_CMPR, DEFAULT_MAX_CONSEQ_FAILS_EXPL};
use sparrow::optimizer::optimize;
use sparrow::util::listener::{OptimizationPhase, ReportType, SolutionListener};
use sparrow::util::terminator::BasicTerminator;
use sparrow::EPOCH;
use std::time::Duration;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
struct Placement {
    item_id: u64,
    rotation: f32,
    translation: (f32, f32),
}

#[derive(Serialize)]
struct Report {
    kind: &'static str,
    phase: &'static str,
    strip_width: f32,
    density: f32,
    elapsed_ms: u128,
    placements: Vec<Placement>,
}

struct JsListener {
    callback: js_sys::Function,
    phase: &'static str,
}

impl JsListener {
    fn emit(&self, kind: &'static str, solution: &SPSolution, instance: &SPInstance) {
        let ext = jagua_rs::probs::spp::io::export(instance, solution, *EPOCH);
        let report = Report {
            kind,
            phase: self.phase,
            strip_width: ext.strip_width,
            density: ext.density,
            elapsed_ms: EPOCH.elapsed().as_millis(),
            placements: ext
                .layout
                .placed_items
                .iter()
                .map(|p| Placement {
                    item_id: p.item_id,
                    rotation: p.transformation.rotation,
                    translation: p.transformation.translation,
                })
                .collect(),
        };
        let json = serde_json::to_string(&report).expect("report is serializable");
        let _ = self.callback.call1(&JsValue::NULL, &JsValue::from_str(&json));
    }
}

impl SolutionListener for JsListener {
    fn report(&mut self, report: ReportType, solution: &SPSolution, instance: &SPInstance) {
        let kind = match report {
            ReportType::ExplFeas => "feasible",
            ReportType::CmprFeas => "compressed",
            ReportType::Final => "final",
            // Infeasible/improving layouts overlap; the page only draws valid ones.
            ReportType::ExplInfeas | ReportType::ExplImproving => return,
        };
        self.emit(kind, solution, instance);
    }

    fn report_phase(&mut self, phase: OptimizationPhase) {
        self.phase = match phase {
            OptimizationPhase::Exploration => "exploration",
            OptimizationPhase::Compression => "compression",
        };
    }
}

/// Runs sparrow on `instance_json` (jagua-rs `ExtSPInstance` format).
/// `on_report` receives a JSON string for every feasible solution found.
/// Returns the final solution as the same JSON report, or throws on invalid input.
#[wasm_bindgen]
pub fn nest(
    instance_json: &str,
    explore_secs: f32,
    compress_secs: f32,
    seed: u64,
    min_separation: f32,
    on_report: js_sys::Function,
) -> Result<String, JsValue> {
    console_error_panic_hook::set_once();

    let ext_instance: ExtSPInstance =
        serde_json::from_str(instance_json).map_err(|e| JsValue::from_str(&format!("invalid instance: {e}")))?;

    let mut config = DEFAULT_SPARROW_CONFIG;
    config.expl_cfg.time_limit = Duration::from_secs_f32(explore_secs.max(0.5));
    config.cmpr_cfg.time_limit = Duration::from_secs_f32(compress_secs.max(0.5));
    config.expl_cfg.max_conseq_failed_attempts = Some(DEFAULT_MAX_CONSEQ_FAILS_EXPL);
    config.cmpr_cfg.shrink_decay = ShrinkDecayStrategy::FailureBased(DEFAULT_FAIL_DECAY_RATIO_CMPR);
    // Single-threaded on the web: the rayon workers would only add overhead.
    config.expl_cfg.separator_config.n_workers = 1;
    config.cmpr_cfg.separator_config.n_workers = 1;
    if min_separation > 0.0 {
        config.min_item_separation = Some(min_separation);
    }

    let importer = Importer::new(
        config.cde_config,
        config.poly_simpl_tolerance,
        config.min_item_separation,
        config.narrow_concavity_cutoff_ratio,
    );
    let mut instance = jagua_rs::probs::spp::io::import_instance(&importer, &ext_instance)
        .map_err(|e| JsValue::from_str(&format!("could not import instance: {e}")))?;
    // jagua-rs starts the strip at width = item area / height and deflates it by the separation: with a few small
    // pieces and a large gap (tiny DXF/SVG, casi reali Deepnest #3/#29/#148) that width is below the gap and the
    // container offset panics ("Offset resulted in an empty polygon"). Start at least one piece + two gaps wide.
    let max_diam = instance.items.iter().map(|(item, _)| item.shape_cd.diameter).fold(0.0f32, f32::max);
    let min_width = max_diam + 2.0 * min_separation.max(0.0) + 1.0;
    if instance.base_strip.width < min_width {
        instance.base_strip.set_width(min_width);
    }

    let rng = Xoshiro256PlusPlus::seed_from_u64(seed);
    let mut listener = JsListener { callback: on_report, phase: "exploration" };
    let mut terminator = BasicTerminator::new();

    let solution = optimize(
        instance.clone(),
        rng,
        &mut listener,
        &mut terminator,
        &config.expl_cfg,
        &config.cmpr_cfg,
        None,
    )
    .map_err(|e| JsValue::from_str(&format!("could not build an initial layout: {e}")))?;

    listener.phase = "done";
    listener.emit("final", &solution, &instance);
    let ext = jagua_rs::probs::spp::io::export(&instance, &solution, *EPOCH);
    serde_json::to_string(&ext).map_err(|e| JsValue::from_str(&e.to_string()))
}
