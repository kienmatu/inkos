// Shared short-fiction format constants (chapter count and per-chapter length,
// by language). Lives in its own module, separate from both
// `agents/short-fiction.ts` (which imports prompt builders from
// `prompts/short-fiction.ts`) and `prompts/short-fiction.ts` (whose prompt
// builders need to interpolate these numbers instead of restating them as
// literals) so neither of those two files has to import the other just to
// share these values. `agents/short-fiction.ts` re-exports everything below
// so existing importers of that module keep working unchanged.

// 10 x 1200 words = ~12,000 words, which is the Kindle Short Reads / novelette
// shape this pipeline actually produces — not a serial, which is what the old
// 12-18 x 650 implied. The 18 ceiling stays for users who want a longer piece;
// 18 x 1,500 = 27,000 words is deliberately outside the Short Reads bands this
// pipeline targets by default — it is a ceiling for users who explicitly want
// a longer piece, not a recommendation.
export const SHORT_FICTION_DEFAULT_CHAPTERS = 10;
// The Chinese worst case at this floor is
// SHORT_FICTION_MIN_CHAPTERS * SHORT_FICTION_MIN_CHARS_PER_CHAPTER = 8 * 900 =
// 7,200 characters, below the 8,000-character floor the spec states Zhihu
// Yanxuan requires. This is a deliberately accepted corner: a language-aware
// chapter minimum would add a new concept to the model for a market this
// deployment does not serve, so the shortfall is documented here instead of
// hidden behind a guard. See short-fiction-editorial.test.ts.
export const SHORT_FICTION_MIN_CHAPTERS = 8;
export const SHORT_FICTION_MAX_CHAPTERS = 18;
export const SHORT_FICTION_DEFAULT_CHARS_PER_CHAPTER = 1000;
export const SHORT_FICTION_MIN_CHARS_PER_CHAPTER = 900;
export const SHORT_FICTION_MAX_CHARS_PER_CHAPTER = 1200;

// English shorts are calibrated to the English market, NOT unit-converted from
// the Chinese numbers above. The old 600/650/800 range came from a 2/3 word
// conversion of the zh format, which is linguistically reasonable and
// commercially meaningless: it landed at or below the floor of every English
// platform. Royal Road runs 1,500-3,500 words per chapter, Wattpad 1,000-3,000,
// Dreame/GoodNovel 1,500-2,500; Kindle Vella allowed 600 as a hard minimum and
// shut down in 2025. A 650-word chapter is also too small to hold the staged
// scene the craft prompt demands, which forced the model into the synopsis voice
// that same prompt forbids.
// See docs/superpowers/specs/2026-08-28-short-fiction-editorial-review.md.
export const SHORT_FICTION_EN_DEFAULT_WORDS_PER_CHAPTER = 1200;
export const SHORT_FICTION_EN_MIN_WORDS_PER_CHAPTER = 900;
export const SHORT_FICTION_EN_MAX_WORDS_PER_CHAPTER = 1500;
