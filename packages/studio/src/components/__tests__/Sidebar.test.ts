import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "../Sidebar";
import { useChatStore } from "../../store/chat";

vi.mock("../../hooks/use-api", () => ({
  useApi: (path: string) => ({
    data: path === "/books"
      ? { books: [{ id: "novel-one", title: "Novel One", genre: "mystery", status: "drafting", chaptersWritten: 3 }] }
      : path === "/shorts"
        ? { shorts: [{ storyId: "short-one", title: "Short One", finalMarkdownPath: "shorts/short-one/final/full.md", updatedAt: "2026-08-31T12:00:00.000Z" }] }
        : path === "/interactive-films"
          ? { films: [] }
          : path === "/daemon"
            ? { running: false }
            : undefined,
    refetch: vi.fn(),
    mutate: vi.fn(),
  }),
}));

const nav = {
  toDashboard: vi.fn(),
  toChat: vi.fn(),
  toBook: vi.fn(),
  toBookCreate: vi.fn(),
  toServices: vi.fn(),
  toProjectSettings: vi.fn(),
  toDaemon: vi.fn(),
  toLogs: vi.fn(),
  toGenres: vi.fn(),
  toStyle: vi.fn(),
  toTranslation: vi.fn(),
  toImport: vi.fn(),
  toRadar: vi.fn(),
  toDoctor: vi.fn(),
  toFilmStudio: vi.fn(),
};

describe("Sidebar My Works", () => {
  beforeEach(() => {
    useChatStore.setState({ sessions: {}, sessionIdsByBook: {}, activeSessionId: null });
  });

  it("distinguishes novel and short works with visible type badges", () => {
    const html = renderToStaticMarkup(createElement(Sidebar, {
      nav,
      activePage: "dashboard",
      sse: { messages: [] },
      t: (key) => key === "work.badgeNovel"
        ? "Novel Badge"
        : key === "work.badgeShort"
          ? "Short Badge"
          : key,
    }));

    expect(html).toContain("Novel One");
    expect(html).toContain("Novel Badge");
    expect(html).toContain("Short One");
    expect(html).toContain("Short Badge");
  });
});
