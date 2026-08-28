/**
 * Progress/stage lines are addressed to whoever is watching the run, so they
 * are keyed by the reader's language rather than the book's writing language
 * (which only ever resolves to zh/en). `vi` is optional: a message that has no
 * Vietnamese translation yet falls back to English at the call site.
 */
export type LogLanguage = "zh" | "en" | "vi";

export interface LogMessage {
  readonly zh: string;
  readonly en: string;
  readonly vi?: string;
}
