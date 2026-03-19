import { z } from "zod";
import { genai, GEMINI_MODEL } from "../config/gemini";
import { repairTextArtifacts } from "./aiTextUtils";

const descriptionVariationSchema = z.object({
  id: z.string().min(1),
  angle: z.string().min(3).max(80),
  title: z.string().min(8).max(140),
  description: z.string().min(40).max(700),
  bulletPoints: z.array(z.string().min(4).max(120)).min(3).max(5),
  tags: z.array(z.string().min(2).max(30)).min(3).max(8),
  seoScore: z.number().min(1).max(10),
});

const descriptionResponseSchema = z.object({
  recommendation: z.string().max(220).optional(),
  variations: z.array(descriptionVariationSchema).length(3),
});

function extractJson(text: string) {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("A IA não retornou JSON válido.");
  }
  return cleaned.slice(start, end + 1);
}

export const MarketplaceCalculatorService = {
  async generateDescriptions(payload: {
    productName: string;
    marketplace?: string;
    category?: string;
    keywords?: string;
    features?: string;
  }) {
    const prompt = `Você é um especialista em copy para e-commerce brasileiro.

Gere exatamente 3 variações de descrição para produto, em português do Brasil, com foco prático em marketplace.

Contexto:
- Produto: ${payload.productName}
- Marketplace: ${payload.marketplace || "geral"}
- Categoria: ${payload.category || "não informada"}
- Palavras-chave: ${payload.keywords || "não informadas"}
- Características/diferenciais: ${payload.features || "não informados"}

Regras:
1. Não invente especificações técnicas que não foram fornecidas.
2. Escreva de forma objetiva, com tom comercial forte.
3. Cada variação deve ter um ângulo diferente: conversão direta, benefício prático, confiança/autoridade.
4. Título curto e forte.
5. Descrição entre 2 e 4 frases.
6. bulletPoints com benefícios reais, não genéricos.
7. tags curtas, sem hashtag.
8. seoScore de 1 a 10.
9. recommendation deve dizer qual das 3 variações tende a performar melhor e por quê, em uma frase.

Retorne apenas JSON válido neste formato:
{
  "recommendation": "texto",
  "variations": [
    {
      "id": "v1",
      "angle": "texto curto",
      "title": "texto",
      "description": "texto",
      "bulletPoints": ["texto", "texto", "texto"],
      "tags": ["texto", "texto", "texto"],
      "seoScore": 8
    }
  ]
}`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await genai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { maxOutputTokens: 2048 },
        });

        const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const repairedText = repairTextArtifacts(rawText);
        const parsed = JSON.parse(extractJson(repairedText));
        return descriptionResponseSchema.parse(parsed);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Falha desconhecida ao gerar descrições.");
      }
    }

    throw lastError || new Error("Falha ao gerar descrições.");
  },
};
