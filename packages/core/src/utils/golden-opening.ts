/**
 * The opening window is the stretch of chapters that carry retention discipline
 * — the guidance is written as one slot per chapter, so the window and the slot
 * table must stay the same size. Keeping the number here is what stops the
 * planner's flag and the two prompt builders from drifting apart, which they
 * previously did: the planner flagged five chapters for English books while both
 * builders returned nothing past chapter three, so English chapters 4-5 were
 * marked retention-critical and then handed no guidance.
 */
export const GOLDEN_OPENING_CHAPTERS = 3;

export function isGoldenOpeningChapter(
  language: string | undefined,
  chapterNumber: number,
): boolean {
  // language is accepted (and ignored) so callers do not have to know that the
  // window is currently language-independent; widening it for one language later
  // is a change to this function only.
  void language;
  return chapterNumber >= 1 && chapterNumber <= GOLDEN_OPENING_CHAPTERS;
}
