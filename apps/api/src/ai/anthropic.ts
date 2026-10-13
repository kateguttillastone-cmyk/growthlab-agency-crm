type Json = Record<string, unknown>;

/** Un appel à l'IA qui renvoie un objet structuré (outil forcé) : jamais de texte libre à analyser. */
export interface AiClient {
  structured(opts: {
    system: string;
    user: string;
    toolName: string;
    toolDescription: string;
    schema: Json;
    maxTokens?: number;
  }): Promise<unknown>;
}

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
}

/** API Anthropic (Messages) : la clé ne voyage que dans l'en-tête `x-api-key`, jamais dans un message d'erreur. */
export function anthropicClient(o: AnthropicOptions): AiClient {
  const doFetch = o.fetch ?? fetch;
  return {
    async structured({ system, user, toolName, toolDescription, schema, maxTokens = 1500 }) {
      let res: Response;
      try {
        res = await doFetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": o.apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: o.model,
            max_tokens: maxTokens,
            system,
            messages: [{ role: "user", content: user }],
            tools: [{ name: toolName, description: toolDescription, input_schema: schema }],
            tool_choice: { type: "tool", name: toolName },
          }),
          signal: AbortSignal.timeout(60_000),
        });
      } catch {
        throw new Error("L'API Anthropic est injoignable");
      }
      if (!res.ok) {
        const hint =
          res.status === 401 || res.status === 403
            ? "clé refusée"
            : res.status === 429
              ? "trop de requêtes ou quota atteint"
              : res.status === 529 || res.status >= 500
                ? "service surchargé"
                : "requête refusée";
        throw new Error(`Anthropic a répondu ${res.status} (${hint})`);
      }
      const body = (await res.json()) as {
        content?: Array<{ type?: string; name?: string; input?: unknown }>;
      };
      const block = body.content?.find((b) => b.type === "tool_use" && b.name === toolName);
      if (!block?.input) throw new Error("Réponse de l'IA illisible (aucun résultat structuré)");
      return block.input;
    },
  };
}
