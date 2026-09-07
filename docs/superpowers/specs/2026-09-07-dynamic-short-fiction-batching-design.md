# Capability-Aware Semantic Short-Fiction Batching Design

## Context

The short-fiction pipeline currently derives batch size from a fixed 1,400-token
budget and then slices chapter numbers mechanically. Every legal English chapter
length resolves to one chapter per call. An eight-chapter story therefore needs
eight draft calls and eight revision calls before outline, review, packaging,
and optional cover work are counted.

The 1,400-token value came from a custom endpoint that stopped after roughly
1,300-2,000 English output tokens even when InkOS requested a much larger
`max_tokens` value. That incident justified protecting unknown gateways, but it
does not justify applying the same capacity to known high-output models.

A live check of the user's 9router endpoint at `http://localhost:20128/v1/models`
returned 42 models. Its 15 `cx/gpt-*` entries each supplied
`max_completion_tokens: 128000` and a separate `context_length`. InkOS currently
discards both fields: the generic probe preserves only the model ID, Studio
persists only model-ID strings, and the `cx/` prefix prevents exact lookup in the
static provider bank.

Raw capacity alone is not enough. Mechanical groups can split a story at the
wrong place. If chapter 6 begins a new narrative phase, a capable model should
be allowed to select `[1-5]` and start the next batch at chapter 6 rather than
being forced into `[1-6]` solely because six chapters fit the token budget.

## Problem classification

This change has two dependent boundaries:

1. **Capability narrowing:** live `/models` JSON is untrusted external data. It
   must be validated and persisted before the runtime can distinguish a 128k
   model from an unknown endpoint.
2. **Semantic domain modeling:** a batch is not only a count. It is an ordered,
   contiguous chapter range aligned to a narrative phase. The outline model may
   propose ranges, but the host must prove that the proposal covers the story
   exactly and fits the selected model.

Without the first boundary, 9router always falls back to a generic capacity.
Without the second, increasing the maximum to six can reduce story coherence by
placing call boundaries inside a setup, reversal, counterattack, or payoff.

## Goals

- Let a model select semantically coherent chapter batches between two and six
  chapters per call, subject to its output capacity.
- Make phase transitions the preferred start of a new batch.
- Read `max_completion_tokens` and `context_length` from 9router's live model
  catalog and preserve the corresponding capabilities for runtime use.
- Support equivalent explicit output/context fields from other OpenAI-compatible
  `/models` responses without trusting arbitrary numeric properties.
- Use 10,000 output tokens as the conservative short-fiction capacity fallback
  when no valid live or static model capability is available.
- Reserve 25% of capacity for reasoning, formatting, title/hook blocks, and
  estimation error.
- Preserve adaptive splitting on `output-limit`, including emergency recovery
  down to one chapter.
- Use the same semantic boundaries for the first draft and revision so the
  second pass does not reshape the story accidentally.
- Preserve existing short-fiction artifacts and resume older outlines that have
  no semantic batch plan.
- Log the capability and semantic decisions without exposing secrets or prose.

## Non-goals

- Do not choose or prefer a model by vendor name. There is no Opus-specific,
  GPT-specific, or 9router-specific execution branch.
- Do not parallelize chapter generation; later batches still need earlier prose
  for continuity.
- Do not let the writer improvise the next batch boundary after generation has
  started. Boundaries are authored with the reviewed outline, before prose calls.
- Do not change chapter-count or per-chapter-length defaults.
- Do not remove outline review, draft review, revision, packaging, or cover
  generation.
- Do not change the provider fallback used by non-short-fiction calls.
- Do not probe output capacity with sacrificial generation requests.
- Do not accept a partial or structurally invalid model-authored batch plan.

## Selected architecture

The pipeline makes two decisions in order:

```text
Live/static model metadata
  -> trusted output capability
  -> maximum safe chapters per batch (1-6)
  -> outline model proposes semantic chapter ranges (normally 2-6)
  -> host validates and normalizes the ranges
  -> writer and reviser execute those ranges sequentially
  -> runtime output-limit may split only the failing range
```

The model decides *where* a batch ends. The host decides whether that proposal is
legal and safe for the active writer and reviser models.

## 1. Live model-capability ingestion

### Untrusted input

Extend `ProbedModel` with optional internal capability fields:

```ts
export interface ProbedModel {
  readonly id: string;
  readonly name: string;
  readonly contextWindow: number;
  readonly maxOutput?: number;
}
```

The OpenAI-compatible probe reads only these recognized source fields:

- output, in precedence order:
  `max_completion_tokens`, `max_output_tokens`;
- context, in precedence order:
  `context_length`, `context_window`, `context_window_tokens`.

Do not infer output capacity from context length. Do not treat a generic
`max_tokens` field as a hard model limit because gateways use that name for
different meanings.

### Narrowing rules

A capability number is accepted only when it is a finite positive integer. If
both values are present and `maxOutput > contextWindow`, discard `maxOutput` as
internally inconsistent. Unknown properties are ignored. Invalid metadata never
fails the entire model list; that model remains selectable but has no trusted
capability.

The resulting `ProbedModel` is the first trusted object. Downstream Studio and
provider code must not read raw snake-case response fields again.

Studio currently has separate `/models` readers for connection testing and the
model picker. Both paths must use the same core normalizer so a capability cannot
survive one endpoint and disappear in another.

### Persistence

Keep the existing `models: string[]` service configuration for compatibility and
add a sibling map keyed by exact model ID:

```ts
modelCapabilities?: Record<string, {
  maxOutput?: number;
  contextWindow?: number;
}>
```

This avoids changing every model-ID consumer to a union of strings and objects.
Studio saves capabilities returned by a successful live probe together with the
model IDs. Manually entered models remain valid and simply have no capability
entry. Normalization removes invalid keys and invalid numeric values at the
configuration boundary.

Service configuration merge behavior is field-aware:

- a successful refreshed probe replaces capability entries for models it
  returned;
- configured model IDs that were not in the latest response remain selectable;
- stale capability entries for a model are removed when that model is removed;
- deleting a service removes both model IDs and capabilities;
- loading an old project with no capability map is unchanged.

### Runtime propagation

The effective LLM configuration copies the selected service's normalized
capability map into the runtime LLM client. The client exposes a resolver with a
closed source union:

```ts
export interface ResolvedModelCapability {
  readonly maxOutput?: number;
  readonly contextWindow?: number;
  readonly source: "live" | "static" | "unknown";
}

resolveModelCapability(client: LLMClient, model: string): ResolvedModelCapability
```

Resolution order is:

1. exact live capability keyed by the selected model ID, including IDs such as
   `cx/gpt-5.4`;
2. exact/static provider-bank lookup;
3. `unknown` with no invented model limit.

`createLLMClient` uses live values for the selected model before static or
general provider defaults. Agent-specific model overrides call the resolver for
their own model rather than inheriting the base model's limit accidentally.

## 2. Capacity policy

Place the pure calculation in a focused short-fiction batching module rather
than adding more orchestration to `agents/short-fiction.ts`.

### Inputs and trusted output

```ts
export interface ShortFictionBatchCapacityInput {
  readonly modelMaxOutput?: number;
  readonly capacitySource: "live" | "static" | "unknown";
  readonly charsPerChapter: number;
  readonly language?: ShortFictionLanguage;
}

export interface ShortFictionBatchCapacity {
  readonly capacityTokens: number;
  readonly capacitySource: "live" | "static" | "fallback";
  readonly usableTokens: number;
  readonly estimatedTokensPerChapter: number;
  readonly maxChaptersPerBatch: number;
  readonly maxTokensForBatch: (chapterCount: number) => number;
}
```

The resolver converts `unknown` or invalid capacity to a complete fallback
decision. Execution code never receives `undefined` capacity.

### Calculation

Use these constants:

```ts
SHORT_FICTION_UNKNOWN_MODEL_OUTPUT_TOKENS = 10_000
SHORT_FICTION_BATCH_USABLE_RATIO = 0.75
SHORT_FICTION_MIN_SEMANTIC_BATCH_CHAPTERS = 2
SHORT_FICTION_MAX_SEMANTIC_BATCH_CHAPTERS = 6
```

Calculate:

```text
capacityTokens = valid modelMaxOutput, otherwise 10,000
usableTokens = floor(capacityTokens * 0.75)
estimatedTokensPerChapter =
  English: charsPerChapter * 1.3
  Chinese: charsPerChapter * 0.7
fittedChapters = floor(usableTokens / estimatedTokensPerChapter)
maxChaptersPerBatch = clamp(fittedChapters, 2, 6)
```

If capacity cannot fit two chapters, `maxChaptersPerBatch` is one. This is an
explicit safety exception to the normal two-to-six range; forcing two chapters
would knowingly create an illegal request.

For default English chapters of 1,200 words:

| Capability | Capacity | Usable | Maximum semantic range |
|---|---:|---:|---:|
| 9router `cx/gpt-*` live metadata | 128,000 | 96,000 | 6 |
| Unknown model fallback | 10,000 | 7,500 | 4 |
| Known/live smaller model | 8,000 | 6,000 | 3 |
| Known/live smaller model | 5,000 | 3,750 | 2 |

`maxTokensForBatch(chapterCount)` retains the existing output estimate but never
requests more than the resolved capacity:

```text
estimated request = max(4,096, ceil(chapterCount * charsPerChapter * 2.2) + 4,096)
max tokens sent = min(capacityTokens, estimated request)
```

This alignment matters for unknown endpoints: a 10,000-token fallback must not
select a four-chapter range and then send an unrelated 14,656-token request.

## 3. Model-authored semantic batch plan

### Outline contract

Add a tagged JSON block to the outline output:

```text
=== SHORT_FICTION_BATCH_PLAN ===
{"batches":[{"from":1,"to":5,"phase":"Pressure accumulation","reason":"Keep evidence planting and the first reversal together."},{"from":6,"to":8,"phase":"Counterattack and payoff","reason":"Chapter 6 starts a new narrative phase."}]}
```

Each batch contains:

```ts
export interface ShortFictionSemanticBatch {
  readonly from: number;
  readonly to: number;
  readonly phase: string;
  readonly reason: string;
}
```

The outline prompt receives `maxChaptersPerBatch`, computed as the smaller of the
writer and reviser capacity maxima. It instructs the model to:

- cover chapters 1 through `chapterCount` exactly once and in order;
- use contiguous ranges;
- use two through `maxChaptersPerBatch` chapters per range;
- begin a new range when the story enters a new phase;
- keep an immediate setup/payoff or action/reaction pair together when it fits;
- prefer five chapters followed by a new phase at chapter 6 over filling a
  six-chapter allowance mechanically;
- give a concrete phase label and boundary reason.

The outline reviewer explicitly checks whether call boundaries align with the
pressure chain, reversal, counterattack, climax, and aftermath. The outline
reviser must return a corrected batch plan with the final outline.

This adds no LLM call. The same reviewed model decision travels with the outline.

### Host validation

Parse the tagged JSON as `unknown`, then narrow it with a schema and whole-plan
validation. A valid plan must satisfy all of these invariants:

- non-empty `phase` and `reason` strings;
- integer `from` and `to` values;
- first range starts at chapter 1;
- final range ends at `chapterCount`;
- every next `from` equals the previous `to + 1`;
- no range is reversed, overlapping, or missing a chapter;
- every range contains at least two chapters and no more than the semantic
  maximum supplied to the outline.

The host never partially trusts a malformed plan. Any violation selects a
deterministic balanced fallback and records a diagnostic warning.

### Balanced fallback

The fallback partitions the complete story into contiguous groups as evenly as
possible, with every group between two and the capacity maximum. It avoids a
single-chapter tail when a legal rebalance exists. Examples:

- 8 chapters, maximum 6 -> `[1-4] [5-8]`;
- 10 chapters, maximum 4 -> `[1-4] [5-7] [8-10]`;
- 13 chapters, maximum 6 -> `[1-5] [6-9] [10-13]`.

If the capacity maximum is one, single-chapter groups are the only legal
fallback.

### Resume and model changes

Older `outline/v002.md` files have no batch-plan block and use the balanced
fallback. A resumed outline with a valid plan is revalidated against the current
writer/reviser capacity. If the active model changed and a stored range is now
too large, split only that semantic range into balanced contiguous subranges.
The original phase boundary remains intact.

For example, stored `[1-5] [6-10]` under a new maximum of three becomes
`[1-3] [4-5] [6-8] [9-10]`, not a fresh mechanical partition that could erase
the chapter-6 phase transition.

## 4. Draft, completion, and revision execution

The runner resolves writer and reviser capacities before creating or revising
the outline. It derives one shared semantic maximum from the smaller capacity
and passes the validated chapter groups to both prose agents.

Execution remains sequential:

1. Resolve and log the writer/reviser capabilities and shared semantic maximum.
2. Create, review, and revise the outline with the batch-plan contract.
3. Parse and validate the final semantic ranges, or create the balanced fallback.
4. `writeDraft` sends each semantic range in order and carries all completed
   prose into the next call.
5. `reviewDraft` reviews the complete first draft as today.
6. `reviseDraft` rewrites the same semantic ranges in the same order, carrying
   both full V1 and revised-so-far V2 context as today.
7. `continueDraft` intersects missing chapters with semantic ranges. Contiguous
   missing chapters from one semantic range may share a repair call; gaps or
   different phases are separate repair groups.
8. Packaging and optional cover behavior remain unchanged.

For the user's example, a 9router GPT model may author `[1-5] [6-8]` even though
its capacity maximum is six. Both draft and revision then use those two ranges.

## 5. Runtime recovery

Live and static metadata are planning evidence, not proof of a gateway's actual
limit. Preserve the existing recursive recovery:

- if a range returns `PartialResponseError` with `reason: "output-limit"`, split
  only that range in half and retry each half in order;
- do not regenerate completed ranges;
- if a single chapter still reaches the output limit, propagate the error;
- never save partial prose as a completed chapter.

An adaptive split is an emergency capacity response and may introduce an extra
call boundary inside a narrative phase. That is preferable to losing the run;
the original outline and all prior prose remain in every continuation prompt.

HTTP 400 remains a configuration/protocol error and is not silently reclassified
as an output limit. Transport retries and the runner's bounded missing-chapter
completion loop remain unchanged.

## 6. Diagnostics

Emit one informational decision log before outline writing and one per prose
agent method. Example:

```text
[short-fiction] writer model=cx/gpt-5.4 capability=live capacity=128000 usable=96000 maxBatch=6
[short-fiction] semantic batches source=outline ranges=1-5,6-8 boundary="chapter 6 starts counterattack"
[short-fiction-reviser] ranges=1-5,6-8 maxTokens=17296,12016
```

Do not log API keys, authorization headers, base URLs, prompts, reviews, or prose.
Existing progress messages continue to report the active chapter range and
batch index.

## Alternatives considered

### Fixed provider buckets

Assigning OpenAI six, other known providers four, and custom providers two is
simple but becomes stale and ignores the live metadata 9router already provides.

### Always start with six and split on failure

This maximizes the happy path but makes a weak endpoint spend most of a long
generation before discovering the limit. It also cannot choose `[1-5]` for a
phase change at chapter 6.

### Add a separate batch-planner LLM call

A dedicated post-outline classifier creates a clean conceptual stage, but it
adds latency to the pipeline whose latency this work is intended to reduce. The
outline model already owns narrative phases, and the review/revision cycle can
correct its ranges without another call.

### Infer boundaries from headings in the host

Keyword heuristics are deterministic but cannot reliably understand whether a
chapter begins a new phase, completes a payoff, or belongs with the previous
reaction beat.

## Testing strategy

### Live metadata boundary

- Parse 9router-shaped entries containing `context_length` and
  `max_completion_tokens`.
- Preserve `cx/gpt-5.4` exactly while returning `maxOutput: 128000` and its
  independent context window.
- Accept supported alias fields with documented precedence.
- Reject zero, negative, fractional, non-finite, nonnumeric, and internally
  inconsistent capabilities without dropping valid model IDs.
- Persist and reload per-model capabilities for custom services.
- Preserve old `models: string[]` configurations.
- Remove stale capability entries when a model or service is removed.
- Ensure Studio model-list caches retain capabilities instead of narrowing them
  back to `{id, name}`.

### Capacity policy

- 9router's 128k GPT capability produces a maximum of six.
- Unknown English model uses the 10k fallback and produces a maximum of four at
  1,200 words per chapter.
- 8k and 5k capacities produce maxima of three and two respectively.
- A capacity too small for two chapters produces the one-chapter safety mode.
- Chinese token estimation produces the expected capacity maxima.
- Invalid capacity inputs use the 10k fallback.
- `maxTokensForBatch` never exceeds resolved capacity and shrinks for the final
  smaller group.

### Semantic-plan validation

- Accept `[1-5] [6-8]` when chapter 6 starts a new phase and maximum is six.
- Reject gaps, overlaps, reversed ranges, duplicate chapters, missing tails,
  empty explanations, and ranges above capacity.
- Produce balanced fallback groups without avoidable one-chapter tails.
- Re-split oversized stored ranges while preserving existing phase boundaries.
- Resume a legacy outline with no plan through the balanced fallback.

### Agent and runner integration

- An eight-chapter 9router writer and reviser execute `[1-5] [6-8]` when that is
  the outline-authored plan.
- An unknown-model run uses capacity-safe balanced groups when the outline omits
  or corrupts its plan.
- Writer and reviser receive the same semantic ranges.
- Missing-chapter completion respects semantic-range boundaries.
- Existing output-limit splitting still produces complete ordered prose.
- Progress and diagnostic logs report accurate dynamic ranges without secrets.
- Outline creation, review, and revision prompts all carry the batch contract.

### Regression coverage

- Replace the editorial assertion that pins every legal English length to one
  chapter per call.
- Preserve code-fence stripping, partial-response rejection, English-language
  defaults, draft completeness validation, and final artifact schemas.
- Run core and Studio type checking, the focused provider/service/short-fiction
  suites, and both complete test suites.

## Compatibility and rollout

The persisted service configuration gains an optional capability map but keeps
its model-ID array. Existing projects and CLI/env configurations remain valid.
Persisted short-fiction outputs and public production results do not change.
The outline gains an optional tagged block; old outlines remain resumable.

No feature flag is required. Invalid or absent live metadata falls back to 10k;
invalid or absent semantic plans fall back to balanced deterministic groups;
overstated capacity falls back at runtime through adaptive splitting.

Release notes should state that short-fiction batches are now chosen from
reviewed narrative phases within live/static model capacity, with a 10k unknown
model fallback and a normal range of two through six chapters.

## Success criteria

- InkOS preserves 9router's `max_completion_tokens: 128000` for exact
  `cx/gpt-*` IDs and makes it available to the selected runtime model.
- A reviewed outline may choose `[1-5] [6-8]` because chapter 6 starts a new
  phase, even though the model can fit six chapters.
- Draft and revision use the same semantic ranges and preserve prior prose
  context between calls.
- Unknown models use the 10k fallback rather than 1,400 tokens.
- Capacity permits up to six chapters but never forces the model to fill that
  allowance.
- No request asks for more output tokens than the capacity used to approve its
  range.
- Invalid metadata and invalid batch plans are narrowed before core execution.
- A falsely optimistic model card still recovers through adaptive splitting.
- No incomplete chapter is accepted or persisted.
