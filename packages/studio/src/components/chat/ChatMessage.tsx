import { memo } from "react";
import type { Theme } from "../../hooks/use-theme";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "../ai-elements/message";
import { XCircle } from "lucide-react";

export interface ChatMessageProps {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly timestamp: number;
  readonly theme: Theme;
}

export const ChatMessage = memo(function ChatMessage({
  role,
  content,
}: ChatMessageProps) {
  const isUser = role === "user";
  const isError = content.startsWith("\u2717");
  // Keep the author's line breaks, but collapse runs of 3+ newlines so a
  // pasted prompt with big gaps doesn't stretch the bubble.
  const userText = isUser ? content.replace(/\n{3,}/g, "\n\n") : content;

  return (
    <Message from={role}>
      <MessageContent>
        {isUser ? (
          <div className="whitespace-pre-wrap break-words text-[17px] leading-[1.72]">{userText}</div>
        ) : isError ? (
          <div className="flex items-center gap-2 text-[17px] leading-[1.72] text-destructive">
            <XCircle size={14} className="shrink-0" />
            <span>{content.replace(/^\u2717\s*/, "")}</span>
          </div>
        ) : (
          <MessageResponse>{content}</MessageResponse>
        )}
      </MessageContent>
    </Message>
  );
});

ChatMessage.displayName = "ChatMessage";
