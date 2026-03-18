import { createPartFromBase64 } from "@google/genai";
import { genai, GEMINI_MODEL } from "../../config/gemini";
import type { ParsedFileResult } from "./types";

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const cleaned = text.replace(/```json|```/g, "").trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      return null;
    }
  }
}

export async function parseImageWithGemini(
  buffer: Buffer,
  mimeType: string,
  originalName: string,
): Promise<ParsedFileResult> {
  const prompt = `Analise esta imagem enviada ao Optimus.

Retorne APENAS JSON valido neste formato:
{
  "summary": "resumo executivo curto",
  "detected_text": "texto identificado na imagem, se houver",
  "document_type": "tipo mais provavel do conteudo",
  "entities": ["entidade 1", "entidade 2"],
  "tables_or_metrics": ["metrica 1", "metrica 2"],
  "suggested_questions": ["pergunta 1", "pergunta 2"]
}`;

  const response = await genai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          createPartFromBase64(buffer.toString("base64"), mimeType),
        ],
      },
    ],
    config: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const raw = response.text || "";
  const parsed = safeJsonParse<Record<string, unknown>>(raw) || {};
  const detectedText = String(parsed.detected_text || "");

  return {
    parserName: "gemini-image-parser",
    fileKind: "image",
    extractedText: detectedText,
    extractedJson: {
      original_name: originalName,
      ...parsed,
    },
    summaryHint: String(parsed.summary || "Imagem analisada pelo Gemini."),
    metadata: {
      mimeType,
      multimodal: true,
    },
  };
}
