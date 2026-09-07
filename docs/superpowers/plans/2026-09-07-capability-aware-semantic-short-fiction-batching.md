# Capability-Aware Semantic Short-Fiction Batching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve live model output limits and let the reviewed short-fiction outline choose coherent two-to-six-chapter generation ranges within the active writer/reviser capacity.

**Architecture:** Normalize live `/models` metadata into persisted per-model capabilities, propagate those capabilities into `LLMClient`, and expose a trusted resolver. A focused short-fiction batching module converts capacity into a safe maximum, validates model-authored semantic ranges, and supplies balanced fallbacks; the runner gives the same resolved ranges to draft and revision agents while retaining adaptive output-limit splitting.

**Tech Stack:** TypeScript 5.8, Zod 3, Vitest 3, Hono Studio API, React Studio client, existing InkOS provider and short-fiction pipeline.

**Spec:** `docs/superpowers/specs/2026-09-07-dynamic-short-fiction-batching-design.md`

## Global Constraints

- English is the target language for new code comments, tests, documentation, prompts, and commit messages.
- Unknown short-fiction models use exactly 10,000 output tokens as the fallback capacity.
- Capacity reserves 25% and normally allows two through six chapters per batch; one chapter is allowed only when capacity or runtime recovery requires it.
- The outline model chooses phase-aligned ranges; the host validates complete ordered coverage before trusting them.
- Draft and revision use the same semantic boundaries and remain sequential.
- Existing `models: string[]`, persisted short-fiction artifacts, and outlines without a batch plan remain compatible.
- Runtime `output-limit` splitting and incomplete-prose rejection remain intact.
- No vendor-name routing, extra batch-planner LLM call, chapter-length change, or global non-short-fiction fallback change.

---

### Task 1: Narrow live `/models` capability metadata

**Files:**
- Modify: `packages/core/src/llm/providers/probe.ts`
- Modify: `packages/core/src/__tests__/probe.test.ts`

**Interfaces:**
- Consumes: untrusted OpenAI-compatible `{ data: unknown }` JSON.
- Produces: `ProbedModel { id, name, contextWindow, maxOutput? }` with validated positive integer capabilities.

- [ ] **Step 1: Add failing 9router and invalid-metadata tests**

```ts
it("preserves 9router output and context limits", async () => {
  mockFetch({ data: [{
    id: "cx/gpt-5.4",
    context_length: 400_000,
    max_completion_tokens: 128_000,
  }] });
  await expect(probeModelsFromUpstream(BASE, "")).resolves.toEqual([{
    id: "cx/gpt-5.4",
    name: "cx/gpt-5.4",
    contextWindow: 400_000,
    maxOutput: 128_000,
  }]);
});

it("keeps the model but drops invalid capabilities", async () => {
  mockFetch({ data: [{ id: "custom/model", context_length: 4096, max_completion_tokens: 8192 }] });
  await expect(probeModelsFromUpstream(BASE, "")).resolves.toEqual([{
    id: "custom/model", name: "custom/model", contextWindow: 4096,
  }]);
});
```

- [ ] **Step 2: Run the probe tests and confirm the new assertions fail**

Run: `pnpm --filter @kienmatu/inkos-core test --run src/__tests__/probe.test.ts`

Expected: FAIL because `contextWindow` remains zero and `maxOutput` is absent.

- [ ] **Step 3: Implement one shared raw-model normalizer**

```ts
function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

export function normalizeProbedModel(value: unknown): ProbedModel | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || !raw.id.trim()) return undefined;
  const contextWindow = firstPositiveInteger(raw.context_length, raw.context_window, raw.context_window_tokens) ?? 0;
  const candidateMax = firstPositiveInteger(raw.max_completion_tokens, raw.max_output_tokens);
  const maxOutput = candidateMax && (!contextWindow || candidateMax <= contextWindow) ? candidateMax : undefined;
  return { id: raw.id, name: raw.id, contextWindow, ...(maxOutput ? { maxOutput } : {}) };
}
```

- [ ] **Step 4: Run probe tests**

Run: `pnpm --filter @kienmatu/inkos-core test --run src/__tests__/probe.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the trusted probe boundary**

```bash
git add packages/core/src/llm/providers/probe.ts packages/core/src/__tests__/probe.test.ts
git commit -m "feat(core): preserve live model output limits"
```

### Task 2: Persist capabilities without changing model-ID storage

**Files:**
- Modify: `packages/core/src/models/project.ts`
- Modify: `packages/core/src/utils/effective-llm-config.ts`
- Modify: `packages/core/src/__tests__/effective-llm-config.test.ts`
- Modify: `packages/studio/src/api/server.ts`
- Modify: `packages/studio/src/pages/service-detail-state.ts`
- Modify: `packages/studio/src/pages/ServiceDetailPage.tsx`
- Modify: `packages/studio/src/api/server.test.ts`
- Modify: `packages/studio/src/pages/service-detail-state.test.ts`

**Interfaces:**
- Consumes: `ProbedModel.maxOutput/contextWindow` from Task 1 and legacy `models: string[]` service entries.
- Produces: optional `modelCapabilities: Record<string, ModelCapability>` on service entries and the effective selected LLM config.

- [ ] **Step 1: Add failing schema and Studio save tests**

```ts
const service = {
  service: "custom",
  name: "9router",
  baseUrl: "http://localhost:20128/v1",
  models: ["cx/gpt-5.4"],
  modelCapabilities: {
    "cx/gpt-5.4": { maxOutput: 128_000, contextWindow: 400_000 },
  },
};
expect(ProjectConfigSchema.parse(projectWith(service)).llm.services?.[0]).toMatchObject(service);
```

Assert that `saveServiceConfig()` sends the same capability map in its `/services/config` request and that the server returns it from `/api/v1/services/config`.

- [ ] **Step 2: Run focused config and Studio tests and confirm failure**

Run: `pnpm --filter @kienmatu/inkos-core test --run src/__tests__/effective-llm-config.test.ts && pnpm --filter @kienmatu/inkos-studio test --run src/pages/service-detail-state.test.ts src/api/server.test.ts`

Expected: FAIL because schemas and client types currently strip capability metadata.

- [ ] **Step 3: Add the shared persisted capability schema**

```ts
export const ModelCapabilitySchema = z.object({
  maxOutput: z.number().int().positive().optional(),
  contextWindow: z.number().int().positive().optional(),
}).refine((value) => !value.maxOutput || !value.contextWindow || value.maxOutput <= value.contextWindow);

const ModelCapabilitiesSchema = z.record(z.string().min(1), ModelCapabilitySchema);
```

Add `modelCapabilities: ModelCapabilitiesSchema.optional()` to `LLMServiceEntrySchema` and the runtime `LLMConfigSchema`. Keep `models` as `z.array(z.string())`.

- [ ] **Step 4: Normalize and merge Studio service capability maps**

Add `modelCapabilities` to `ServiceConfigEntry`, preserve only entries whose key remains in `models`, and merge refreshed entries by exact model ID. Change Studio model DTOs to:

```ts
export interface ServiceDetailModelInfo {
  readonly id: string;
  readonly name?: string;
  readonly maxOutput?: number;
  readonly contextWindow?: number;
}
```

When saving, continue sending `models: savedModels.map(({ id }) => id)` and add:

```ts
modelCapabilities: Object.fromEntries(savedModels.flatMap((model) => {
  const capability = {
    ...(model.maxOutput ? { maxOutput: model.maxOutput } : {}),
    ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
  };
  return Object.keys(capability).length ? [[model.id, capability]] : [];
}))
```

- [ ] **Step 5: Make both Studio `/models` paths use Task 1's normalizer**

Replace the local ID-only mapping in `fetchModelsFromServiceBaseUrl` with `normalizeProbedModels(json)` from core. Widen `modelListCache` and `ServiceProbeResult.models` to retain `maxOutput` and `contextWindow`.

- [ ] **Step 6: Propagate the selected service capability map into effective config**

When `applyProjectServiceConfig` selects a service, assign its normalized map to `llm.modelCapabilities`. Delete stale top-level runtime capability data when the service has none so one provider cannot leak limits into another.

- [ ] **Step 7: Run focused config and Studio tests**

Run: `pnpm --filter @kienmatu/inkos-core test --run src/__tests__/effective-llm-config.test.ts src/__tests__/config-loader.test.ts && pnpm --filter @kienmatu/inkos-studio test --run src/pages/service-detail-state.test.ts src/api/server.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit capability persistence**

```bash
git add packages/core/src/models/project.ts packages/core/src/utils/effective-llm-config.ts packages/core/src/__tests__/effective-llm-config.test.ts packages/studio/src/api/server.ts packages/studio/src/pages/service-detail-state.ts packages/studio/src/pages/ServiceDetailPage.tsx packages/studio/src/api/server.test.ts packages/studio/src/pages/service-detail-state.test.ts
git commit -m "feat(studio): persist live model capabilities"
```

### Task 3: Resolve live, static, and unknown model capabilities at runtime

**Files:**
- Modify: `packages/core/src/llm/provider.ts`
- Modify: `packages/core/src/__tests__/provider.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: selected LLM config capability map from Task 2 and static `lookupModel(service, model)`.
- Produces: `resolveModelCapability(client, model): ResolvedModelCapability` for short-fiction policy and model overrides.

- [ ] **Step 1: Add failing runtime resolution tests**

```ts
const client = createLLMClient(config({
  service: "custom",
  model: "cx/gpt-5.4",
  modelCapabilities: {
    "cx/gpt-5.4": { maxOutput: 128_000, contextWindow: 400_000 },
  },
}));
expect(resolveModelCapability(client, "cx/gpt-5.4")).toEqual({
  maxOutput: 128_000,
  contextWindow: 400_000,
  source: "live",
});
expect(resolveModelCapability(client, "missing/model")).toEqual({ source: "unknown" });
```

Also assert that the selected Pi model uses 128k output and 400k context rather than the unknown-model defaults.

- [ ] **Step 2: Run provider tests and confirm failure**

Run: `pnpm --filter @kienmatu/inkos-core test --run src/__tests__/provider.test.ts`

Expected: FAIL because `LLMClient` does not retain live model capabilities.

- [ ] **Step 3: Add a discriminated capability source and resolver**

```ts
export interface ResolvedModelCapability {
  readonly maxOutput?: number;
  readonly contextWindow?: number;
  readonly source: "live" | "static" | "unknown";
}

export function resolveModelCapability(client: LLMClient, model: string): ResolvedModelCapability {
  const live = client._modelCapabilities?.[model];
  if (live) return { ...live, source: "live" };
  const card = lookupModel(client.service, model);
  return card
    ? { maxOutput: card.maxOutput, contextWindow: card.contextWindowTokens, source: "static" }
    : { source: "unknown" };
}
```

Store a frozen normalized map on `LLMClient`. Resolve the selected model before building `defaults` and `_piModel` so live metadata wins over static/fallback values.

- [ ] **Step 4: Export the capability API and run tests**

Run: `pnpm --filter @kienmatu/inkos-core test --run src/__tests__/provider.test.ts src/__tests__/providers-lookup.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit runtime capability resolution**

```bash
git add packages/core/src/llm/provider.ts packages/core/src/__tests__/provider.test.ts packages/core/src/index.ts
git commit -m "feat(core): resolve runtime model capabilities"
```

### Task 4: Build the pure capacity and semantic-range domain module

**Files:**
- Create: `packages/core/src/agents/short-fiction-batching.ts`
- Create: `packages/core/src/__tests__/short-fiction-batch-policy.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `ResolvedModelCapability`, language, target chapter length, chapter count, and optional parsed semantic batches.
- Produces: `ShortFictionBatchCapacity`, validated `ShortFictionSemanticBatch[]`, executable `number[][]`, and balanced fallbacks.

- [ ] **Step 1: Write failing capacity tests**

```ts
expect(resolveShortFictionBatchCapacity({
  modelMaxOutput: 128_000, capacitySource: "live", charsPerChapter: 1200, language: "en",
}).maxChaptersPerBatch).toBe(6);
expect(resolveShortFictionBatchCapacity({
  capacitySource: "unknown", charsPerChapter: 1200, language: "en",
})).toMatchObject({ capacityTokens: 10_000, capacitySource: "fallback", maxChaptersPerBatch: 4 });
expect(resolveShortFictionBatchCapacity({
  modelMaxOutput: 8_000, capacitySource: "static", charsPerChapter: 1200, language: "en",
}).maxChaptersPerBatch).toBe(3);
```

- [ ] **Step 2: Write failing semantic validation and fallback tests**

```ts
expect(resolveSemanticChapterGroups({
  chapterCount: 8,
  maxChaptersPerBatch: 6,
  proposed: [
    { from: 1, to: 5, phase: "Pressure", reason: "Chapter 6 changes phase" },
    { from: 6, to: 8, phase: "Payoff", reason: "Counterattack begins" },
  ],
}).groups).toEqual([[1, 2, 3, 4, 5], [6, 7, 8]]);

expect(resolveSemanticChapterGroups({ chapterCount: 13, maxChaptersPerBatch: 6 }).groups)
  .toEqual([[1, 2, 3, 4, 5], [6, 7, 8, 9], [10, 11, 12, 13]]);
```

Add table tests for gaps, overlaps, oversized ranges, empty reasons, old outlines, and resplitting `[1-5] [6-10]` under maximum three to `[1-3] [4-5] [6-8] [9-10]`.

- [ ] **Step 3: Run the new policy tests and confirm module-not-found failure**

Run: `pnpm --filter @kienmatu/inkos-core test --run src/__tests__/short-fiction-batch-policy.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 4: Implement capacity resolution and bounded request budgets**

```ts
const UNKNOWN_CAPACITY = 10_000;
const USABLE_RATIO = 0.75;

export function resolveShortFictionBatchCapacity(input: ShortFictionBatchCapacityInput): ShortFictionBatchCapacity {
  const known = positiveInteger(input.modelMaxOutput);
  const capacityTokens = known ?? UNKNOWN_CAPACITY;
  const estimatedTokensPerChapter = input.language === "zh"
    ? input.charsPerChapter * 0.7
    : input.charsPerChapter * 1.3;
  const fitted = Math.floor(Math.floor(capacityTokens * USABLE_RATIO) / estimatedTokensPerChapter);
  const maxChaptersPerBatch = fitted < 2 ? 1 : Math.min(fitted, 6);
  return {
    capacityTokens,
    capacitySource: known ? input.capacitySource : "fallback",
    usableTokens: Math.floor(capacityTokens * USABLE_RATIO),
    estimatedTokensPerChapter,
    maxChaptersPerBatch,
    maxTokensForBatch: (chapterCount) => Math.min(
      capacityTokens,
      Math.max(4096, Math.ceil(chapterCount * input.charsPerChapter * 2.2) + 4096),
    ),
  };
}
```

- [ ] **Step 5: Implement schema narrowing, balanced groups, and semantic-preserving resplit**

Use a Zod schema for the tagged JSON payload. Validate whole-story coverage in one function; on failure return `{ source: "balanced-fallback", warning, groups }`. Partition a range of length `n` into `ceil(n / max)` groups, distribute the remainder across the earliest groups, and never emit an avoidable singleton.

- [ ] **Step 6: Run policy tests**

Run: `pnpm --filter @kienmatu/inkos-core test --run src/__tests__/short-fiction-batch-policy.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the domain module**

```bash
git add packages/core/src/agents/short-fiction-batching.ts packages/core/src/__tests__/short-fiction-batch-policy.test.ts packages/core/src/index.ts
git commit -m "feat(core): model semantic chapter batches"
```

### Task 5: Add semantic ranges to the reviewed outline contract

**Files:**
- Modify: `packages/core/src/prompts/short-fiction.ts`
- Modify: `packages/core/src/agents/short-fiction.ts`
- Modify: `packages/core/src/__tests__/short-fiction-en.test.ts`
- Modify: `packages/core/src/__tests__/short-fiction-editorial.test.ts`
- Modify: `packages/core/src/__tests__/en-prompt-parity.test.ts`

**Interfaces:**
- Consumes: shared `maxChaptersPerBatch` from Task 4.
- Produces: optional parsed `ShortFictionSemanticBatch[]` on `ShortFictionOutline`; create/review/revise prompts that carry the exact tagged JSON contract.

- [ ] **Step 1: Add failing prompt and parser tests**

Assert that the English outline prompt contains the maximum, exact-coverage rules, phase-boundary rule, and `SHORT_FICTION_BATCH_PLAN` format. Assert that outline review and revision retain the contract. Parse a plan containing `[1-5] [6-8]` into typed batches while an old outline returns no proposal.

- [ ] **Step 2: Run short-fiction prompt tests and confirm failure**

Run: `pnpm --filter @kienmatu/inkos-core test --run src/__tests__/short-fiction-en.test.ts src/__tests__/short-fiction-editorial.test.ts src/__tests__/en-prompt-parity.test.ts`

Expected: FAIL because the prompts and outline type have no semantic plan.

- [ ] **Step 3: Extend outline inputs and builders**

Add `maxChaptersPerBatch` to outline creation/revision prompt inputs and tell the model to emit contiguous two-to-maximum ranges, start new phases at new batches, and keep coupled setup/payoff beats together. The reviewer must flag mechanical or incoherent boundaries.

- [ ] **Step 4: Parse the optional tagged plan at the boundary**

```ts
export interface ShortFictionOutline {
  readonly storyTitle: string;
  readonly rawContent: string;
  readonly proposedBatches?: ReadonlyArray<ShortFictionSemanticBatch>;
}
```

Use Task 4's parser. Do not throw away a usable outline when only the optional plan is invalid; return no proposal and let the runner log/use fallback.

- [ ] **Step 5: Run prompt and parity tests**

Run: `pnpm --filter @kienmatu/inkos-core test --run src/__tests__/short-fiction-en.test.ts src/__tests__/short-fiction-editorial.test.ts src/__tests__/en-prompt-parity.test.ts`

Expected: PASS with no new Chinese prompt text.

- [ ] **Step 6: Commit the outline contract**

```bash
git add packages/core/src/prompts/short-fiction.ts packages/core/src/agents/short-fiction.ts packages/core/src/__tests__/short-fiction-en.test.ts packages/core/src/__tests__/short-fiction-editorial.test.ts packages/core/src/__tests__/en-prompt-parity.test.ts
git commit -m "feat(core): let outlines choose semantic batches"
```

### Task 6: Execute semantic groups through draft, repair, and revision

**Files:**
- Modify: `packages/core/src/agents/short-fiction.ts`
- Modify: `packages/core/src/pipeline/short-fiction-runner.ts`
- Modify: `packages/core/src/__tests__/short-fiction-batching.test.ts`
- Modify: `packages/core/src/__tests__/short-fiction-resume.test.ts`

**Interfaces:**
- Consumes: Task 3 capability resolver, Task 4 capacity/group decisions, Task 5 parsed outline proposal.
- Produces: one shared ordered group list passed to `writeDraft`, `continueDraft`, and `reviseDraft`.

- [ ] **Step 1: Add failing runner integration tests**

For an eight-chapter 128k writer/reviser and outline proposal `[1-5] [6-8]`, assert draft and revision each call those two ranges. Add an unknown-model test that falls back to 10k and balanced `[1-4] [5-8]`. Add a resume test proving an old outline without a plan uses balanced fallback.

- [ ] **Step 2: Run batching and resume tests and confirm failure**

Run: `pnpm --filter @kienmatu/inkos-core test --run src/__tests__/short-fiction-batching.test.ts src/__tests__/short-fiction-resume.test.ts`

Expected: FAIL because agents still call `chunkChapters` with a scalar size.

- [ ] **Step 3: Resolve writer/reviser capacities before the outline stages**

In `produceShort`, call `resolveModelCapability` for `options.runtimes.writer` and `.revise`, derive both short-fiction capacities, and pass `Math.min(writer.maxChaptersPerBatch, reviser.maxChaptersPerBatch)` into outline create/revise inputs.

- [ ] **Step 4: Resolve one trusted semantic group list after outline revision or resume**

Parse resumed outlines through `parseShortFictionOutline`. Call `resolveSemanticChapterGroups` with the final proposal, `chapterCount`, and shared capacity maximum. Log the source, ranges, and warning without prose.

- [ ] **Step 5: Replace scalar batching inputs with explicit groups**

Add `chapterGroups: ReadonlyArray<ReadonlyArray<number>>` to draft inputs. `writeDraft` and `reviseDraft` use those groups directly. `continueDraft` intersects missing chapters with the trusted groups and splits discontinuities instead of recomputing a scalar chunk size.

- [ ] **Step 6: Cap per-call output using the active agent's policy**

Pass `maxTokensForBatch(chapters.length)` into `runChapterBatches`. Writer and reviser use their own capacity function while retaining the same semantic ranges. Keep recursive halving and outer retry behavior unchanged.

- [ ] **Step 7: Add decision logs and run integration tests**

Run: `pnpm --filter @kienmatu/inkos-core test --run src/__tests__/short-fiction-batching.test.ts src/__tests__/short-fiction-resume.test.ts src/__tests__/short-fiction-en.test.ts`

Expected: PASS; progress messages show semantic batch indices/ranges.

- [ ] **Step 8: Commit semantic execution**

```bash
git add packages/core/src/agents/short-fiction.ts packages/core/src/pipeline/short-fiction-runner.ts packages/core/src/__tests__/short-fiction-batching.test.ts packages/core/src/__tests__/short-fiction-resume.test.ts
git commit -m "feat(core): execute semantic short-fiction batches"
```

### Task 7: Probe 9router through InkOS and verify the complete change

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/plans/2026-09-07-capability-aware-semantic-short-fiction-batching.md` (check completed steps)

**Interfaces:**
- Consumes: all implemented interfaces and live `http://localhost:20128/v1/models`.
- Produces: passing repository verification, recorded live probe evidence, and a ready PR.

- [ ] **Step 1: Add the release note**

Add one English bullet under the current unreleased section describing live model-capability preservation and phase-aware two-to-six-chapter short-fiction batches with a 10k unknown fallback.

- [ ] **Step 2: Run type checks**

Run: `pnpm --filter @kienmatu/inkos-core typecheck && pnpm --filter @kienmatu/inkos-studio typecheck`

Expected: both commands exit zero.

- [ ] **Step 3: Run focused suites**

Run: `pnpm --filter @kienmatu/inkos-core test --run src/__tests__/probe.test.ts src/__tests__/provider.test.ts src/__tests__/effective-llm-config.test.ts src/__tests__/short-fiction-batch-policy.test.ts src/__tests__/short-fiction-batching.test.ts src/__tests__/short-fiction-resume.test.ts src/__tests__/short-fiction-en.test.ts src/__tests__/short-fiction-editorial.test.ts src/__tests__/en-prompt-parity.test.ts`

Run: `pnpm --filter @kienmatu/inkos-studio test --run src/pages/service-detail-state.test.ts src/api/server.test.ts`

Expected: all focused tests pass.

- [ ] **Step 4: Run complete core and Studio suites**

Run: `pnpm --filter @kienmatu/inkos-core test && pnpm --filter @kienmatu/inkos-studio test`

Expected: all tests pass.

- [ ] **Step 5: Probe live 9router through the compiled InkOS helper**

Build core, then execute this read-only probe:

```bash
pnpm --filter @kienmatu/inkos-core build
node --input-type=module -e 'import { probeModelsFromUpstream, resolveShortFictionBatchCapacity } from "./packages/core/dist/index.js"; const models = await probeModelsFromUpstream("http://localhost:20128/v1", ""); const model = models.find(({ id }) => id === "cx/gpt-5.4"); if (!model) throw new Error("cx/gpt-5.4 not found"); const policy = resolveShortFictionBatchCapacity({ modelMaxOutput: model.maxOutput, capacitySource: "live", charsPerChapter: 1200, language: "en" }); console.log(JSON.stringify({ id: model.id, contextWindow: model.contextWindow, maxOutput: model.maxOutput, capacitySource: policy.capacitySource, maxChaptersPerBatch: policy.maxChaptersPerBatch }, null, 2));'
```

Expected:

```json
{
  "id": "cx/gpt-5.4",
  "contextWindow": 400000,
  "maxOutput": 128000,
  "capacitySource": "live",
  "maxChaptersPerBatch": 6
}
```

- [ ] **Step 6: Review the entire branch diff**

Run: `git diff --check master...HEAD && git diff --stat master...HEAD && git status --short`

Expected: no whitespace errors, only scoped files, clean worktree after final commit.

- [ ] **Step 7: Commit release notes and plan completion**

```bash
git add CHANGELOG.md
git add -f docs/superpowers/plans/2026-09-07-capability-aware-semantic-short-fiction-batching.md
git commit -m "docs: document semantic short-fiction batching"
```

- [ ] **Step 8: Push and mark PR ready**

```bash
git push
gh pr ready 15
```

Expected: PR #15 is ready for review and contains design, implementation plan, code, tests, probe evidence in the handoff, and release notes.
