import { createAssistantMessageEventStream, streamSimple } from "@mariozechner/pi-ai";
import type {
  Api,
  AssistantMessage,
  AssistantMessageEventStream,
  Context,
  Model,
  SimpleStreamOptions,
} from "@mariozechner/pi-ai";
import {
  assertWithinContextWindow,
  estimatePiContextTokens,
  guardAssistantMessageStream,
} from "../llm/provider.js";
import {
  agentTrajectoryHeaders,
  beginAgentModelCall,
} from "../llm/agent-trajectory.js";
import {
  createLeadingThinkTagStripper,
  stripLeadingThinkBlock,
} from "../llm/think-tag-stripper.js";

/**
 * The single Pi transport boundary used by both conversational and worker
 * agents. Pi keeps native tool calls; InkOS adds context guards, trajectory
 * headers, cancellation, and stream deadlines around the request.
 */
export function guardedPiStream<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  const reservedOutputTokens = Number.isFinite(options?.maxTokens)
    ? options!.maxTokens!
    : Number.isFinite(model.maxTokens)
      ? model.maxTokens
      : 4096;
  assertWithinContextWindow({
    piModel: model,
    model: model.id,
    estimatedInputTokens: estimatePiContextTokens(context),
    reservedOutputTokens,
  });
  const modelCall = beginAgentModelCall();
  const traceHeaders = agentTrajectoryHeaders(model.baseUrl, modelCall, 1, {
    effort: String(options?.reasoning ?? (model.reasoning ? "enabled" : "disabled")),
  });
  return guardAssistantMessageStream(
    model,
    (signal) => stripLeadingThinkTags(streamSimple(model, context, {
      ...options,
      headers: { ...(options?.headers ?? {}), ...traceHeaders },
      signal,
    })),
    options?.signal,
  );
}

/** Strip the leading think block from the first text block of an assistant message. */
function stripThinkFromMessage(message: AssistantMessage): AssistantMessage {
  const index = message.content.findIndex((block) => block.type === "text");
  if (index < 0) return message;
  const block = message.content[index] as { type: "text"; text: string };
  const text = stripLeadingThinkBlock(block.text);
  if (text === block.text) return message;
  const content = [...message.content];
  content[index] = { ...block, text };
  return { ...message, content };
}

/**
 * Some OpenAI-compatible gateways inline reasoning as a leading
 * `<think>...</think>` block in the text content instead of a separate
 * reasoning field (issue #329). The custom transport in provider.ts already
 * strips it, but the Pi transport did not, so the tags reached the transcript
 * and the UI. Even an empty `<think></think>` is damaging: it sits on the same
 * line as the answer's first characters, so a reply that opens with
 * "## Heading" renders as a paragraph with a literal "##".
 */
function stripLeadingThinkTags(upstream: AssistantMessageEventStream): AssistantMessageEventStream {
  const out = createAssistantMessageEventStream();

  void (async () => {
    const stripper = createLeadingThinkTagStripper();
    let firstTextIndex: number | null = null;
    let terminalSeen = false;

    for await (const event of upstream) {
      if (event.type === "text_start" && firstTextIndex === null) {
        firstTextIndex = event.contentIndex;
        out.push(event);
        continue;
      }

      if (event.type === "text_delta" && event.contentIndex === firstTextIndex) {
        const delta = stripper.push(event.delta);
        // An empty result means the stripper is still buffering; emitting
        // nothing keeps the think block from ever reaching the UI.
        if (delta) out.push({ ...event, delta });
        continue;
      }

      if (event.type === "text_end" && event.contentIndex === firstTextIndex) {
        // An unterminated think block is left alone by the stripper, so flush
        // whatever it held back before closing the block.
        const tail = stripper.flush();
        if (tail) out.push({ type: "text_delta", contentIndex: event.contentIndex, delta: tail, partial: event.partial });
        out.push({ ...event, content: stripLeadingThinkBlock(event.content) });
        continue;
      }

      if (event.type === "done") {
        terminalSeen = true;
        out.push({ ...event, message: stripThinkFromMessage(event.message) });
        continue;
      }

      if (event.type === "error") {
        terminalSeen = true;
        out.push({ ...event, error: stripThinkFromMessage(event.error) });
        continue;
      }

      out.push(event);
    }

    // guardAssistantMessageStream turns a missing terminal event into an error;
    // closing here just stops it from waiting for the deadline first.
    if (!terminalSeen) out.end();
  })();

  return out;
}
