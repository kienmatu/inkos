import { describe, it, expect } from "vitest";
import {
  LOCAL_ENDPOINT_PLACEHOLDER_API_KEY,
  resolveEndpointApiKey,
} from "../utils/llm-endpoint-auth.js";

describe("resolveEndpointApiKey", () => {
  it("prefers a configured key over everything else", () => {
    expect(
      resolveEndpointApiKey({
        configuredApiKey: "sk-real",
        envApiKey: "sk-env",
        provider: "openai",
        baseUrl: "http://localhost:20128/v1",
      }),
    ).toBe("sk-real");
  });

  it("falls back to the env key when nothing is configured", () => {
    expect(
      resolveEndpointApiKey({
        envApiKey: "sk-env",
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
      }),
    ).toBe("sk-env");
  });

  it("returns a placeholder for a keyless local endpoint so pi-ai does not throw", () => {
    expect(
      resolveEndpointApiKey({
        configuredApiKey: "",
        provider: "openai",
        baseUrl: "http://localhost:20128/v1",
      }),
    ).toBe(LOCAL_ENDPOINT_PLACEHOLDER_API_KEY);
  });

  it("returns a placeholder for a keyless private-network endpoint", () => {
    expect(
      resolveEndpointApiKey({
        provider: "openai",
        baseUrl: "http://192.168.1.50:8080/v1",
      }),
    ).toBe(LOCAL_ENDPOINT_PLACEHOLDER_API_KEY);
  });

  it("stays undefined for a keyless remote endpoint — that must still fail loudly", () => {
    expect(
      resolveEndpointApiKey({
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
      }),
    ).toBeUndefined();
  });
});
