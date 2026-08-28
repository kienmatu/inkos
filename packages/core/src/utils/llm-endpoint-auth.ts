export function isApiKeyOptionalForEndpoint(params: {
  readonly provider?: string | undefined;
  readonly baseUrl?: string | undefined;
}): boolean {
  if (params.provider === "anthropic") {
    return false;
  }
  if (!params.baseUrl) {
    return false;
  }

  try {
    const url = new URL(params.baseUrl);
    const hostname = url.hostname.toLowerCase();

    return (
      hostname === "localhost"
      || hostname === "127.0.0.1"
      || hostname === "::1"
      || hostname === "0.0.0.0"
      || hostname === "host.docker.internal"
      || hostname.endsWith(".local")
      || isPrivateIpv4(hostname)
    );
  } catch {
    return false;
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((segment) => Number.parseInt(segment, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  if (parts[0] === 10) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return false;
}

/**
 * Placeholder handed to pi-ai for local/self-hosted endpoints that accept
 * unauthenticated requests. pi-ai hard-requires a non-empty key string and
 * throws `No API key for provider: <provider>` without one, even when the
 * endpoint never checks it (Ollama, LM Studio, a local OpenAI-compatible
 * router). The value is never a real credential; keyless remote endpoints
 * must still fail loudly.
 */
export const LOCAL_ENDPOINT_PLACEHOLDER_API_KEY = "inkos-local-no-auth";

export function resolveEndpointApiKey(params: {
  readonly configuredApiKey?: string | undefined;
  readonly envApiKey?: string | undefined;
  readonly provider?: string | undefined;
  readonly baseUrl?: string | undefined;
}): string | undefined {
  if (params.configuredApiKey) return params.configuredApiKey;
  if (params.envApiKey) return params.envApiKey;
  if (isApiKeyOptionalForEndpoint({ provider: params.provider, baseUrl: params.baseUrl })) {
    return LOCAL_ENDPOINT_PLACEHOLDER_API_KEY;
  }
  return undefined;
}
