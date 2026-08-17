import { getThaiLawConfig } from "./config.js";
import { createNetworkError, createServerError, MCPThaiLawError } from "./error-handler.js";
import { getFetch } from "./http-client.js";

interface OpenAIEmbeddingResponse {
  data?: Array<{ embedding?: unknown; index?: number }>;
}

function isFiniteNumberArray(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

export async function getEmbedding(
  text: string,
  signal?: AbortSignal,
): Promise<number[]> {
  const config = getThaiLawConfig();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.embeddingApiKey) {
    headers.Authorization = `Bearer ${config.embeddingApiKey}`;
  }

  let response: Response;
  try {
    response = await getFetch()(config.embeddingUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.embeddingModel,
        input: text,
        dimensions: config.embeddingDimensions,
      }),
      signal,
    });
  } catch (error) {
    throw createNetworkError(error, {
      url: config.embeddingUrl,
      target: "embedding server",
    });
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw createServerError(response.status, response.statusText, body, {
      url: config.embeddingUrl,
      target: "embedding server",
    });
  }

  let payload: OpenAIEmbeddingResponse;
  try {
    payload = await response.json() as OpenAIEmbeddingResponse;
  } catch {
    throw new MCPThaiLawError(
      "Embedding server returned a non-JSON response. Check EMBEDDING_URL and the model name.",
    );
  }

  const vectors = [...(payload.data ?? [])].sort((left, right) => {
    const leftIndex = typeof left.index === "number" ? left.index : 0;
    const rightIndex = typeof right.index === "number" ? right.index : 0;
    return leftIndex - rightIndex;
  });
  const embedding = vectors[0]?.embedding;
  if (!isFiniteNumberArray(embedding)) {
    throw new MCPThaiLawError(
      "Embedding server response is missing a numeric vector. Check EMBEDDING_MODEL and the /v1/embeddings payload.",
    );
  }

  return embedding;
}
