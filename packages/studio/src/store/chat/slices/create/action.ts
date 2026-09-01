import type { StateCreator } from "zustand";
import type { ChatStore, CreateActions } from "../../types";

export const createCreateSlice: StateCreator<ChatStore, [], [], CreateActions> = (set) => ({
  bumpBookDataVersion: () => set((s) => ({ bookDataVersion: s.bookDataVersion + 1 })),
  openArtifact: (file) => set({ sidebarView: "artifact", artifactFile: file, artifactChapter: null }),
  openChapterArtifact: (chapterNum) => set({ sidebarView: "artifact", artifactFile: null, artifactChapter: chapterNum }),
  closeArtifact: () => set({ sidebarView: "panel", artifactFile: null, artifactChapter: null }),
  openProjectArtifact: (path, shortContext = null) => set({
    projectArtifactPath: path,
    projectArtifactShortContext: shortContext,
  }),
  closeProjectArtifact: () => set({ projectArtifactPath: null, projectArtifactShortContext: null }),
  markProjectArtifactShortComplete: (storyId) => set((state) => {
    const current = state.projectArtifactShortContext;
    if (!current || current.storyId !== storyId) return state;
    return { projectArtifactShortContext: { ...current, status: "complete" } };
  }),
  setBookSummary: (summary) => set({ bookSummary: summary }),
  markProposalResolved: (execId, resolution) =>
    set((s) => ({ resolvedProposals: { ...s.resolvedProposals, [execId]: resolution } })),
});
