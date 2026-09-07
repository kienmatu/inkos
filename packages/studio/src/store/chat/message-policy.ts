import type { ChatActionSource, ChatRequestedIntent, Message, ToolExecution } from "./types";
import { isConfirmedProductionAction } from "../../shared/confirmed-production";

const READ_ONLY_TOOLS = new Set(["read", "grep", "ls"]);

export function shouldRefreshSidebarForTool(toolName: string): boolean {
  return !READ_ONLY_TOOLS.has(toolName);
}

export function shouldRefreshSidebarForExecutionTransition(
  messages: ReadonlyArray<Message>,
  next: Pick<ToolExecution, "id" | "tool" | "status">,
): boolean {
  if (
    !shouldRefreshSidebarForTool(next.tool)
    || (next.status !== "completed" && next.status !== "error")
  ) {
    return false;
  }

  const wasAlreadyTerminal = messages.some((message) => {
    const executions = [
      ...(message.toolExecutions ?? []),
      ...(message.parts ?? []).flatMap((part) => part.type === "tool" ? [part.execution] : []),
    ];
    return executions.some((execution) => (
      execution.id === next.id
      && (execution.status === "completed" || execution.status === "error")
    ));
  });

  return !wasAlreadyTerminal;
}

export function isConfirmedProductionSend(
  actionSource: ChatActionSource,
  requestedIntent: ChatRequestedIntent | undefined,
): boolean {
  return isConfirmedProductionAction(actionSource, requestedIntent);
}
