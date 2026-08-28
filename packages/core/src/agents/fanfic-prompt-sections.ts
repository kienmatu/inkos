import type { FanficMode } from "../models/book.js";

const MODE_PREAMBLES: Record<FanficMode, string> = {
  canon: `你正在写**原作向同人**。严格遵守正典：
- 角色的语癖、说话风格、行为模式必须与原作一致
- 世界规则不可违反
- 关键事件时间线不可矛盾
- 可以填充原作空白、探索未详述的角度`,

  au: `你正在写**AU（平行世界）同人**：
- 世界规则可以改变（已在 allowedDeviations 中声明的偏离）
- 角色的核心性格和说话方式应保持辨识度——读者要能认出是谁
- AU 设定偏离必须内部一致（改了一条规则，相关的都要跟着变）`,

  ooc: `你正在写**OOC 同人**：
- 角色在极端情境下可以偏离性格底色
- 但偏离必须有情境驱动，不能无缘无故变性格
- 保留角色的语癖和说话特征——即使性格变了，说话方式也应有辨识度`,

  cp: `你正在写**CP 同人**，以角色互动和关系发展为核心：
- 配对双方每章必须有有效互动
- 互动风格要有化学反应——不是两个人在同一个场景各干各的
- 关系发展应有节奏感：推进、试探、阻碍、突破`,
};

const MODE_PREAMBLES_EN: Record<FanficMode, string> = {
  canon: `You are writing **canon-compliant fanfic**. Strictly follow canon:
- Characters' verbal tics, speech style, and behavior patterns must match the source
- World rules must not be violated
- The timeline of key events must not contradict the source
- You may fill in blanks the source left open, or explore angles it left unaddressed`,

  au: `You are writing **AU (alternate-universe) fanfic**:
- World rules may change (only the deviations already declared in allowedDeviations)
- Characters' core personality and way of speaking should stay recognizable — readers must be able to tell who is who
- AU deviations must be internally consistent (change one rule, and everything connected to it must follow)`,

  ooc: `You are writing **OOC fanfic**:
- Characters may deviate from their baseline personality under extreme circumstances
- But the deviation must be driven by the situation, not change personality for no reason
- Preserve characters' verbal tics and speech traits — even if personality shifts, their way of speaking should stay recognizable`,

  cp: `You are writing **CP (pairing) fanfic**, centered on character interaction and relationship development:
- The pair must have a meaningful interaction every chapter
- The interaction style must have chemistry — not two people each doing their own thing in the same scene
- Relationship development should have rhythm: advance, probe, obstacle, breakthrough`,
};

export function buildFanficCanonSection(
  fanficCanon: string,
  mode: FanficMode,
  language: "zh" | "en" = "zh",
): string {
  if (language === "en") {
    return `
## Fanfic Canon Reference

${MODE_PREAMBLES_EN[mode]}

Below is the source canon information; you must reference it while writing:

${fanficCanon}`;
  }

  return `
## 同人正典参照

${MODE_PREAMBLES[mode]}

以下是原作正典信息，写作时必须参照：

${fanficCanon}`;
}

// NOTE on the marker below: this regex intentionally always searches for the
// Chinese heading "## 角色档案", in both the "zh" and "en" branches. The
// upstream fanfic_canon.md document is produced by FanficCanonImporter
// (fanfic-canon-importer.ts), which has no language parameter at all and
// always emits this heading in Chinese regardless of the book's language.
// Searching for an English heading here would look for a marker the pipeline
// never actually writes, silently breaking extraction instead of fixing
// anything — narrower to keep matching the real data format. See the task-7
// report for this as a flagged, out-of-scope follow-up (the importer itself
// needs a language branch before this marker can be translated safely).
export function buildCharacterVoiceProfiles(
  fanficCanon: string,
  language: "zh" | "en" = "zh",
): string {
  // Extract character table from fanfic_canon.md
  const tableMatch = fanficCanon.match(
    /## 角色档案[\s\S]*?\n(\|[^\n]+\|\n\|[-|\s]+\|\n(?:\|[^\n]+\|\n)*)/,
  );
  if (!tableMatch) return "";

  const rows = tableMatch[1]!
    .split("\n")
    .filter((line) => line.startsWith("|") && !line.startsWith("|--") && !line.startsWith("| 角色"))
    .map((line) =>
      line
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean),
    )
    .filter((cells) => cells.length >= 5);

  if (rows.length === 0) return "";

  if (language === "en") {
    const profilesEn = rows.map((cells) => {
      const [name, , , catchphrases, speakingStyle, behavior] = cells;
      const parts: string[] = [`### ${name}`];
      if (catchphrases && catchphrases !== "（素材未提及）") {
        parts.push(`- Catchphrases/verbal tics: ${catchphrases}`);
      }
      if (speakingStyle && speakingStyle !== "（素材未提及）") {
        parts.push(`- Speaking style: ${speakingStyle}`);
      }
      if (behavior && behavior !== "（素材未提及）") {
        parts.push(`- Typical behavior: ${behavior}`);
      }
      return parts.join("\n");
    });

    return `
## Character Voice Reference (fanfic-only)

The dialogue and behavior of these characters must reference the source material's traits. When writing dialogue, first ask "how would this character speak in the source material?"

${profilesEn.join("\n\n")}`;
  }

  const profiles = rows.map((cells) => {
    const [name, , , catchphrases, speakingStyle, behavior] = cells;
    const parts: string[] = [`### ${name}`];
    if (catchphrases && catchphrases !== "（素材未提及）") {
      parts.push(`- 口头禅/语癖：${catchphrases}`);
    }
    if (speakingStyle && speakingStyle !== "（素材未提及）") {
      parts.push(`- 说话风格：${speakingStyle}`);
    }
    if (behavior && behavior !== "（素材未提及）") {
      parts.push(`- 典型行为：${behavior}`);
    }
    return parts.join("\n");
  });

  return `
## 角色语音参照（同人写作专用）

以下角色的对话和行为必须参照原作特征。写对话时，先想"这个角色在原作里会怎么说"。

${profiles.join("\n\n")}`;
}

const MODE_CHECKS: Record<FanficMode, string> = {
  canon: `- 正典合规检查：本章是否违反原作设定？角色对话是否符合原作语癖？
- 信息边界检查：角色是否引用了不该知道的信息？`,

  au: `- AU 偏离清单：本章改变了哪些世界规则？改变是否内部一致？
- 角色辨识度检查：读者能否从对话中认出角色？`,

  ooc: `- OOC 偏离记录：角色在哪些方面偏离了性格底色？偏离驱动力是什么？
- 语癖保留检查：即使 OOC，说话方式是否还有原作特征？`,

  cp: `- CP 互动检查：配对双方本章是否有有效互动？关系发展是否推进？
- 互动质量检查：互动是否有化学反应（不是各干各的）？`,
};

const MODE_CHECKS_EN: Record<FanficMode, string> = {
  canon: `- Canon compliance check: does this chapter violate the source setting? Does character dialogue match the source's verbal tics?
- Information-boundary check: did any character reference information they should not know?`,

  au: `- AU deviation list: which world rules did this chapter change? Is the change internally consistent?
- Character recognizability check: can readers recognize the character from their dialogue?`,

  ooc: `- OOC deviation log: in what ways did the character deviate from their baseline personality? What drove the deviation?
- Verbal-tic retention check: even OOC, does their way of speaking still carry source-material traits?`,

  cp: `- CP interaction check: did the pair have a meaningful interaction this chapter? Did the relationship progress?
- Interaction quality check: does the interaction have chemistry (not each character doing their own thing)?`,
};

export function buildFanficModeInstructions(
  mode: FanficMode,
  allowedDeviations: ReadonlyArray<string>,
  language: "zh" | "en" = "zh",
): string {
  if (language === "en") {
    const deviationsBlockEn = allowedDeviations.length > 0
      ? `\nAllowed deviations (not treated as violations):\n${allowedDeviations.map((d) => `- ${d}`).join("\n")}\n`
      : "";

    return `
## Fanfic Self-Check (additional check inside PRE_WRITE_CHECK)

${MODE_CHECKS_EN[mode]}${deviationsBlockEn}`;
  }

  const deviationsBlock = allowedDeviations.length > 0
    ? `\n允许的偏离（不视为违规）：\n${allowedDeviations.map((d) => `- ${d}`).join("\n")}\n`
    : "";

  return `
## 同人写作自检（在 PRE_WRITE_CHECK 中额外检查）

${MODE_CHECKS[mode]}${deviationsBlock}`;
}
