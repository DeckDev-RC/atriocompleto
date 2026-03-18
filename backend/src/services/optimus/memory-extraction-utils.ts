import { z } from "zod";

export const extractedMemorySchema = z.object({
  scope: z.enum(["user", "tenant"]),
  memory_type: z.enum(["preference", "fact", "decision", "context"]),
  memory_key: z.string().min(2).max(120),
  summary: z.string().min(5).max(500),
  relevance_score: z.number().int().min(0).max(100),
  confidence_score: z.number().int().min(0).max(100).default(60),
  value_json: z.record(z.unknown()).default({}),
});

export const extractionResultSchema = z.object({
  summary: z.string().min(5).max(4000),
  topics: z.array(z.string().min(2).max(120)).max(8).default([]),
  decisions: z.array(z.string().min(2).max(240)).max(8).default([]),
  memories: z.array(extractedMemorySchema).max(8).default([]),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

function coerceExtractionCandidate(input: unknown): ExtractionResult | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  const normalized = {
    summary: typeof candidate.summary === "string" ? candidate.summary.trim() : "",
    topics: Array.isArray(candidate.topics)
      ? candidate.topics.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 8)
      : [],
    decisions: Array.isArray(candidate.decisions)
      ? candidate.decisions.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 8)
      : [],
    memories: Array.isArray(candidate.memories)
      ? candidate.memories
          .map((item) => extractedMemorySchema.safeParse(item))
          .filter((result): result is { success: true; data: z.infer<typeof extractedMemorySchema> } => result.success)
          .map((result) => result.data)
          .slice(0, 8)
      : [],
  };

  const result = extractionResultSchema.safeParse(normalized);
  return result.success ? result.data : null;
}

function normalizeJsonText(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/```json|```/gi, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .trim();
}

function extractBalancedJsonBlock(raw: string): string | null {
  const text = normalizeJsonText(raw);
  const start = text.search(/[\[{]/);
  if (start < 0) return null;

  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === "\\") {
      escape = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") stack.push("}");
    else if (char === "[") stack.push("]");
    else if (char === "}" || char === "]") {
      if (stack[stack.length - 1] === char) {
        stack.pop();
        if (stack.length === 0) {
          return text.slice(start, i + 1).trim();
        }
      }
    }
  }

  return text.slice(start).trim();
}

function trimTrailingComma(text: string): string {
  return text
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/,\s*$/g, "");
}

function repairTruncatedJson(raw: string): string {
  const text = extractBalancedJsonBlock(raw) || normalizeJsonText(raw);
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  let output = "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (escape) {
      output += char;
      escape = false;
      continue;
    }

    if (char === "\\" && inString) {
      output += char;
      escape = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      output += char;
      continue;
    }

    if (inString) {
      if (char === "\n") output += "\\n";
      else if (char === "\r") output += "\\r";
      else if (char === "\t") output += "\\t";
      else output += char;
      continue;
    }

    if (char === "{") {
      stack.push("}");
      output += char;
      continue;
    }

    if (char === "[") {
      stack.push("]");
      output += char;
      continue;
    }

    if (char === "}" || char === "]") {
      output = trimTrailingComma(output);
      if (stack[stack.length - 1] === char) {
        stack.pop();
      }
      output += char;
      continue;
    }

    output += char;
  }

  if (inString) {
    output += "\"";
  }

  output = trimTrailingComma(output.trim());

  while (stack.length > 0) {
    output = trimTrailingComma(output);
    output += stack.pop();
  }

  return output;
}

export function parseMemoryExtractionResponse(raw: string): ExtractionResult | null {
  const candidates = [
    normalizeJsonText(raw),
    extractBalancedJsonBlock(raw),
    repairTruncatedJson(raw),
  ].filter((candidate): candidate is string => !!candidate && candidate.trim().length > 0);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const result = coerceExtractionCandidate(parsed);
      if (result) {
        return result;
      }
    } catch {
      // Try next candidate
    }
  }

  return null;
}
