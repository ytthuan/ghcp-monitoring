/**
 * Cost rate resolution for Copilot model names.
 *
 * Source of truth (per-token, USD): a snapshot of BerriAI/litellm's
 * `model_prices_and_context_window.json` committed at
 * `./data/litellm-prices.json`. Snapshot metadata is committed at
 * `./data/litellm-prices-meta.json`. Refresh both with
 * `scripts/refresh-pricing.sh`.
 *
 * Three-tier lookup:
 *   1. `COPILOT_OVERRIDES`       — Copilot-specific rates always win.
 *   2. Direct litellm hit        — when the Copilot-reported model name
 *                                  matches a litellm key 1:1.
 *   3. `COPILOT_NAME_ALIASES`    — Copilot → upstream provider name map
 *                                  for models we know are repackaged.
 *
 * Server-only module: imported by route loaders / server fns. The JSON
 * import keeps the data colocated and synchronously available.
 */
import litellmRaw from "./data/litellm-prices.json" with { type: "json" };
import litellmMetaRaw from "./data/litellm-prices-meta.json" with { type: "json" };
import {
  additiveTokenTotal,
  cacheHitRatio,
  freshInputTokens,
  normalizeCacheReadTokens,
} from "../lib/token-math";

export {
  additiveTokenTotal,
  cacheHitRatio,
  freshInputTokens,
  normalizeCacheReadTokens,
};

export interface ModelRate {
  input: number; // USD per million input tokens
  output: number; // USD per million output tokens
  cache_read: number; // USD per million cache-read input tokens
  cache_create: number; // USD per million cache-creation input tokens
}

export type PricingSource =
  | "override"
  | "litellm_direct"
  | "litellm_alias"
  | "internal_zero_rate";

export interface PricingResolution {
  model: string;
  pricedAs: string;
  rate: ModelRate;
  source: PricingSource;
  sourceModel: string;
}

interface LitellmRow {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_read_input_token_cost?: number;
  cache_creation_input_token_cost?: number;
}

interface LitellmMetaRow {
  source?: string;
  snapshotDate?: string;
}

const M = 1_000_000;

function nonNegative(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

// Copilot model name -> litellm model name. Hand-curated for the names we
// actually see in `gen_ai.response.model`.
const COPILOT_NAME_ALIASES: Record<string, string> = {
  "gpt-5.5": "gpt-5",
  "gpt-5.2": "gpt-5",
  "gpt-5-mini": "gpt-5-mini",
  "gpt-4.1": "gpt-4.1",
  "gpt-4o-mini": "gpt-4o-mini",
  "claude-opus-4.7": "claude-opus-4-7",
  "claude-opus-4.6-1m": "claude-opus-4-6",
  "claude-opus-4.6": "claude-opus-4-6",
  "claude-opus-4.5": "claude-opus-4-5",
  "claude-sonnet-4.6": "claude-sonnet-4-6",
  "claude-sonnet-4.5": "claude-sonnet-4-5",
  "claude-sonnet-4": "claude-sonnet-4-20250514",
  "claude-haiku-4.5": "claude-3-5-haiku-20241022",
};

// Explicit overrides (per-million USD). Any model listed here ALWAYS wins
// over both litellm and aliases — use this for models where you know the
// GitHub Copilot rate differs from the upstream provider list.
const COPILOT_OVERRIDES: Record<string, ModelRate> = {
  "gpt-5.5": { input: 5.0, output: 15.0, cache_read: 0.5, cache_create: 6.25 },
  "gpt-5.2": { input: 3.0, output: 12.0, cache_read: 0.3, cache_create: 3.75 },
  "claude-opus-4.7": {
    input: 15.0,
    output: 75.0,
    cache_read: 1.5,
    cache_create: 18.75,
  },
  "claude-sonnet-4.6": {
    input: 3.0,
    output: 15.0,
    cache_read: 0.3,
    cache_create: 3.75,
  },
  "claude-haiku-4.5": {
    input: 0.8,
    output: 4.0,
    cache_read: 0.08,
    cache_create: 1.0,
  },
};

/**
 * Copilot-internal models that have NO public per-token rate because they're
 * bundled in the GitHub Copilot subscription (e.g. Next Edit Suggestions
 * "NES", inline complete, edit-prediction custom models). Treated as a
 * recognised, zero-rate class so they don't pollute the "unknown model"
 * count, while still allowing the UI to surface a disclosure tooltip.
 */
export interface InternalModelInfo {
  description: string;
  feature: "nes" | "inline" | "complete" | "edit";
}

export const COPILOT_INTERNAL_MODELS: Record<string, InternalModelInfo> = {
  "copilot-nes-oct": {
    description:
      "GitHub Copilot Next Edit Suggestions (NES) — October 2025 release. " +
      "Bundled in your Copilot subscription; no per-token billing rate.",
    feature: "nes",
  },
};

// Future-proof: any copilot-(nes|inline|complete|edit)-* variant matches.
const COPILOT_INTERNAL_PREFIX_RE =
  /^copilot-(nes|inline|complete|edit)(?:[-_].*)?$/i;

const ZERO_RATE: ModelRate = {
  input: 0,
  output: 0,
  cache_read: 0,
  cache_create: 0,
};

/**
 * Returns descriptive metadata for Copilot-internal (subscription-bundled)
 * models like `copilot-nes-oct`, or `null` if `name` isn't recognised as
 * one. Exported so the UI can render a disclosure tooltip without
 * re-deriving the match.
 */
export function internalModelInfo(
  name: string | null | undefined,
): InternalModelInfo | null {
  const normalized = normalizeModelName(name);
  if (!normalized) return null;
  const exact = COPILOT_INTERNAL_MODELS[normalized];
  if (exact) return exact;
  const m = COPILOT_INTERNAL_PREFIX_RE.exec(normalized);
  if (m) {
    const feature = (m[1] ?? "nes").toLowerCase() as InternalModelInfo["feature"];
    return {
      description:
        `Copilot ${
          feature === "nes"
            ? "Next Edit Suggestions"
            : feature === "inline"
              ? "inline completion"
              : feature === "complete"
                ? "code completion"
                : "edit-prediction"
        } model. Bundled in your Copilot subscription; no per-token billing rate.`,
      feature,
    };
  }
  return null;
}

const litellm = litellmRaw as unknown as Record<string, LitellmRow>;
const litellmMeta = litellmMetaRaw as LitellmMetaRow;

/**
 * Strips the Copilot internal `-1m-internal` (or `_1m-internal`, case
 * insensitive) suffix. Mirrors `MODEL_NORMALIZE_REGEX` in `./filters.ts` —
 * keep the two patterns in sync.
 *
 * Idempotent. Safe to call on names that don't carry the suffix.
 */
export function normalizeModelName(
  name: string | null | undefined,
): string | null {
  if (!name) return null;
  return name.replace(/[-_]1m[-_]internal$/i, "");
}

function fromLitellm(name: string): ModelRate | null {
  const row = litellm[name];
  if (!row) return null;
  // litellm stores per-token; we store per-million.
  return {
    input: (row.input_cost_per_token ?? 0) * M,
    output: (row.output_cost_per_token ?? 0) * M,
    cache_read: (row.cache_read_input_token_cost ?? 0) * M,
    cache_create: (row.cache_creation_input_token_cost ?? 0) * M,
  };
}

export function rateFor(model: string | null | undefined): ModelRate | null {
  return resolvePricingModel(model)?.rate ?? null;
}

export function resolvePricingModel(
  model: string | null | undefined,
): PricingResolution | null {
  const normalized = normalizeModelName(model);
  if (!normalized) return null;
  // 1) Explicit override wins
  const override = COPILOT_OVERRIDES[normalized];
  if (override) {
    return {
      model: normalized,
      pricedAs: normalized,
      rate: override,
      source: "override",
      sourceModel: normalized,
    };
  }
  // 2) Direct litellm match
  const direct = fromLitellm(normalized);
  if (direct) {
    return {
      model: normalized,
      pricedAs: normalized,
      rate: direct,
      source: "litellm_direct",
      sourceModel: normalized,
    };
  }
  // 3) Aliased litellm match
  const alias = COPILOT_NAME_ALIASES[normalized];
  if (alias) {
    const aliased = fromLitellm(alias);
    if (aliased) {
      return {
        model: normalized,
        pricedAs: alias,
        rate: aliased,
        source: "litellm_alias",
        sourceModel: alias,
      };
    }
  }
  // 4) Copilot-internal subscription-bundled model (NES, etc.) — recognised,
  //    zero per-token rate. Placed AFTER alias lookup so that if a real rate
  //    is ever introduced via override/litellm/alias it still wins.
  if (internalModelInfo(normalized)) {
    return {
      model: normalized,
      pricedAs: normalized,
      rate: ZERO_RATE,
      source: "internal_zero_rate",
      sourceModel: normalized,
    };
  }
  return null;
}

/**
 * Picks the model name to price against given both request- and response-side
 * names. Prefers the response model (it's the one the provider actually
 * served); falls back to the request model when the response side doesn't
 * resolve to a known rate.
 *
 * Returns `{ model, rate }` so callers can both compute the cost AND surface
 * which model was used for auditability.
 */
export function pickPricingModel(
  requestModel: string | null | undefined,
  responseModel: string | null | undefined,
): { model: string; rate: ModelRate } | null {
  const resolved = resolvePricingModelBoth(requestModel, responseModel);
  return resolved ? { model: resolved.pricedAs, rate: resolved.rate } : null;
}

export function resolvePricingModelBoth(
  requestModel: string | null | undefined,
  responseModel: string | null | undefined,
): PricingResolution | null {
  const resp = normalizeModelName(responseModel);
  if (resp) {
    const r = resolvePricingModel(resp);
    if (r) return r;
  }
  const req = normalizeModelName(requestModel);
  if (req) {
    const r = resolvePricingModel(req);
    if (r) return r;
  }
  return null;
}

export function estimateCost(args: {
  model: string;
  input: number;
  output: number;
  cache_read: number;
  cache_create: number;
}): number | null {
  const r = rateFor(args.model);
  if (!r) return null;
  const inputFresh = freshInputTokens(args.input, args.cache_read);
  const cacheRead = normalizeCacheReadTokens(args.input, args.cache_read);
  const output = nonNegative(args.output);
  const cacheCreate = nonNegative(args.cache_create);
  return (
    (inputFresh * r.input) / M +
    (output * r.output) / M +
    (cacheRead * r.cache_read) / M +
    (cacheCreate * r.cache_create) / M
  );
}

/**
 * Cost estimate that consults BOTH request_model and response_model and uses
 * whichever resolves to a known rate (response preferred). Returns the picked
 * model alongside the cost so the UI can show "priced as <model>".
 */
export function estimateCostBoth(args: {
  requestModel: string | null | undefined;
  responseModel: string | null | undefined;
  input: number;
  output: number;
  cache_read: number;
  cache_create: number;
}): { cost: number; pricedAs: string } | null {
  const picked = pickPricingModel(args.requestModel, args.responseModel);
  if (!picked) return null;
  const r = picked.rate;
  const inputFresh = freshInputTokens(args.input, args.cache_read);
  const cacheRead = normalizeCacheReadTokens(args.input, args.cache_read);
  const output = nonNegative(args.output);
  const cacheCreate = nonNegative(args.cache_create);
  return {
    cost:
      (inputFresh * r.input) / M +
      (output * r.output) / M +
      (cacheRead * r.cache_read) / M +
      (cacheCreate * r.cache_create) / M,
    pricedAs: picked.model,
  };
}

/**
 * Like estimateCostBoth(), but also returns the per-component cost breakdown
 * (input / output / cache_read / cache_create) and the picked rate object,
 * so UIs can show how each token bucket contributed to the total without
 * re-deriving rates.
 */
export function estimateCostBreakdown(args: {
  requestModel: string | null | undefined;
  responseModel: string | null | undefined;
  input: number;
  output: number;
  cache_read: number;
  cache_create: number;
}): {
  cost: number;
  pricedAs: string;
  rate: ModelRate;
  pricingSource: PricingSource;
  pricingSourceModel: string;
  breakdown: {
    input: number;
    output: number;
    cache_read: number;
    cache_create: number;
  };
  tokenBreakdown: {
    input: number;
    output: number;
    cache_read: number;
    cache_create: number;
  };
} | null {
  const picked = resolvePricingModelBoth(args.requestModel, args.responseModel);
  if (!picked) return null;
  const r = picked.rate;
  const tokenBreakdown = {
    input: freshInputTokens(args.input, args.cache_read),
    output: nonNegative(args.output),
    cache_read: normalizeCacheReadTokens(args.input, args.cache_read),
    cache_create: nonNegative(args.cache_create),
  };
  const breakdown = {
    input: (tokenBreakdown.input * r.input) / M,
    output: (tokenBreakdown.output * r.output) / M,
    cache_read: (tokenBreakdown.cache_read * r.cache_read) / M,
    cache_create: (tokenBreakdown.cache_create * r.cache_create) / M,
  };
  return {
    cost:
      breakdown.input +
      breakdown.output +
      breakdown.cache_read +
      breakdown.cache_create,
    pricedAs: picked.pricedAs,
    pricingSource: picked.source,
    pricingSourceModel: picked.sourceModel,
    rate: r,
    breakdown,
    tokenBreakdown,
  };
}

// Backwards-compatible export so any leftover importer of MODEL_PRICING does
// not break (a Proxy that resolves on read).
export const MODEL_PRICING: Record<string, ModelRate | null> = new Proxy(
  {} as Record<string, ModelRate | null>,
  { get: (_, key: string) => rateFor(key) },
);

// Pricing snapshot metadata — surfaced in the Home page footer.
export interface PricingMeta {
  source: string;
  modelCount: number;
  snapshotDate: string;
}

export const PRICING_META: PricingMeta = {
  source:
    litellmMeta.source ??
    "https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json",
  modelCount: Object.keys(litellm).length,
  snapshotDate: litellmMeta.snapshotDate ?? "unknown",
};
