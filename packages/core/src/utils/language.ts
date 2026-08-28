export type WritingLanguage = "zh" | "en";

/**
 * Infer the writing language from a free-text brief/premise when the user did not set one explicitly.
 *
 * Conservative by design: defaults to "zh" (preserving prior behaviour for Chinese users) and only
 * returns "en" when the text is clearly Latin-dominant. A Chinese brief that mentions an English name
 * or term still resolves to "zh"; incidental CJK inside an otherwise English brief resolves to "en".
 */
export function inferLanguage(text?: string | null): WritingLanguage {
  const t = text ?? "";
  const cjk = (t.match(/[一-鿿]/g) ?? []).length;
  const latin = (t.match(/[A-Za-z]/g) ?? []).length;
  if (cjk === 0 && latin > 0) return "en";
  if (latin > 0 && cjk * 4 < latin) return "en";
  return "zh";
}

/**
 * Narrow a project-level language (which may be a UI-only language such as "vi")
 * down to a language the writing pipeline can actually produce.
 *
 * Vietnamese is a UI language only: a Vietnamese interface writes English prose.
 * Anything that is not exactly "zh" resolves to "en", so an unrecognised value
 * can never silently fall through to Chinese.
 */
export function toWritingLanguage(lang: string | undefined): WritingLanguage {
  return lang === "zh" ? "zh" : "en";
}
