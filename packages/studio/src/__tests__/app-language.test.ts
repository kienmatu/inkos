import { describe, it, expect, afterEach } from "vitest";
import { getAppLanguage, setAppLanguage, tr } from "../lib/app-language";
import { localizeKnownRuntimeMessage } from "../lib/error-copy";
import { foundationFileLabel } from "../lib/truth-display";

afterEach(() => {
  setAppLanguage("zh");
});

describe("tr", () => {
  it("returns Chinese in zh mode", () => {
    setAppLanguage("zh");
    expect(tr("保存", "Save", "Lưu")).toBe("保存");
  });

  it("returns English in en mode", () => {
    setAppLanguage("en");
    expect(tr("保存", "Save", "Lưu")).toBe("Save");
  });

  it("returns Vietnamese in vi mode when supplied", () => {
    setAppLanguage("vi");
    expect(tr("保存", "Save", "Lưu")).toBe("Lưu");
  });

  it("falls back to English — never Chinese — when Vietnamese is missing", () => {
    setAppLanguage("vi");
    expect(tr("保存", "Save")).toBe("Save");
  });

  it("round-trips the current language", () => {
    setAppLanguage("vi");
    expect(getAppLanguage()).toBe("vi");
  });
});

describe("language guards outside app-language", () => {
  const RUNTIME_MESSAGE =
    "Studio LLM API key not set. Open Studio services and save an API key for the selected service.";

  it("localizes runtime messages to Chinese only in zh mode", () => {
    setAppLanguage("zh");
    expect(localizeKnownRuntimeMessage(RUNTIME_MESSAGE)).not.toBe(RUNTIME_MESSAGE);
  });

  it("leaves runtime messages in English in en mode", () => {
    setAppLanguage("en");
    expect(localizeKnownRuntimeMessage(RUNTIME_MESSAGE)).toBe(RUNTIME_MESSAGE);
  });

  it("leaves runtime messages in English in vi mode — never Chinese", () => {
    setAppLanguage("vi");
    expect(localizeKnownRuntimeMessage(RUNTIME_MESSAGE)).toBe(RUNTIME_MESSAGE);
  });

  it("returns the English foundation label in vi mode — never Chinese", () => {
    setAppLanguage("zh");
    expect(foundationFileLabel("current_state.md")).toBe("当前状态");
    setAppLanguage("vi");
    expect(foundationFileLabel("current_state.md")).toBe("Current State");
  });
});
