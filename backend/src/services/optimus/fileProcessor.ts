import { randomUUID } from "crypto";
import path from "path";
import { createPartFromBase64 } from "@google/genai";
import { fileTypeFromBuffer } from "file-type";
import XLSX from "xlsx";
import { env } from "../../config/env";
import { genai, GEMINI_MODEL } from "../../config/gemini";
import { supabaseAdmin } from "../../config/supabase";
import { parseTxtFile } from "../parsers/txtParser";
import { parseSpreadsheetFile, validateSpreadsheetRows } from "../parsers/spreadsheetParser";
import { parsePdfFile } from "../parsers/pdfParser";
import { parseImageWithGemini } from "../parsers/imageParser";
import type { ParsedFileKind, ParsedFileResult } from "../parsers/types";

const TEMP_BUCKET = "temp-uploads";
const MAX_TEXT_CHARS = 120_000;
const MAX_PROMPT_CHARS_PER_FILE = 12_000;

type AllowedFileConfig = {
  kind: ParsedFileKind;
  mimeTypes: string[];
  extensions: string[];
};

const ALLOWED_FILES: Record<string, AllowedFileConfig> = {
  png: { kind: "image", mimeTypes: ["image/png"], extensions: [".png"] },
  pdf: { kind: "pdf", mimeTypes: ["application/pdf"], extensions: [".pdf"] },
  xls: { kind: "spreadsheet", mimeTypes: ["application/vnd.ms-excel", "application/octet-stream"], extensions: [".xls"] },
  xlsx: {
    kind: "spreadsheet",
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/zip",
      "application/octet-stream",
    ],
    extensions: [".xlsx"],
  },
  txt: { kind: "text", mimeTypes: ["text/plain", "application/octet-stream"], extensions: [".txt"] },
};

export interface UploadInputFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface UploadedFileRecord {
  id: string;
  tenant_id: string;
  user_id: string;
  conversation_id: string | null;
  storage_bucket: string;
  storage_path: string;
  original_name: string;
  normalized_name: string;
  file_ext: string;
  mime_type: string;
  file_kind: ParsedFileKind;
  size_bytes: number;
  status: "queued" | "processing" | "processed" | "error" | "deleted";
  processing_stage: string;
  processing_progress: number;
  parser_name: string | null;
  extracted_text: string | null;
  extracted_json: Record<string, unknown> | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  error_message: string | null;
  uploaded_at: string;
  processed_at: string | null;
  expires_at: string;
}

export interface FilePromptContext {
  id: string;
  original_name: string;
  mime_type: string;
  file_kind: ParsedFileKind;
  summary: string;
  extracted_text_excerpt: string;
  extracted_json: Record<string, unknown> | null;
}

function sanitizeFilename(name: string): string {
  const parsed = path.parse(name);
  const safeBase = parsed.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "arquivo";
  const ext = parsed.ext.toLowerCase();
  return `${safeBase}${ext}`;
}

function clipText(text: string | null | undefined, maxChars = MAX_TEXT_CHARS): string {
  const normalized = (text || "").trim();
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}\n\n[conteudo truncado]` : normalized;
}

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

function normalizeExt(name: string): string {
  return path.extname(name).toLowerCase();
}

function mimeAllowedForExt(ext: string, mimeType: string): AllowedFileConfig | null {
  const key = ext.replace(/^\./, "");
  const config = ALLOWED_FILES[key];
  if (!config) return null;
  if (config.mimeTypes.includes(mimeType)) return config;
  return null;
}

function toUploadedFileRecord(row: Record<string, unknown>): UploadedFileRecord {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    user_id: String(row.user_id),
    conversation_id: row.conversation_id ? String(row.conversation_id) : null,
    storage_bucket: String(row.storage_bucket),
    storage_path: String(row.storage_path),
    original_name: String(row.original_name),
    normalized_name: String(row.normalized_name),
    file_ext: String(row.file_ext),
    mime_type: String(row.mime_type),
    file_kind: String(row.file_kind) as ParsedFileKind,
    size_bytes: Number(row.size_bytes || 0),
    status: String(row.status) as UploadedFileRecord["status"],
    processing_stage: String(row.processing_stage || "queued"),
    processing_progress: Number(row.processing_progress || 0),
    parser_name: row.parser_name ? String(row.parser_name) : null,
    extracted_text: row.extracted_text ? String(row.extracted_text) : null,
    extracted_json: (row.extracted_json as Record<string, unknown> | null) || null,
    summary: row.summary ? String(row.summary) : null,
    metadata: (row.metadata as Record<string, unknown> | null) || null,
    error_message: row.error_message ? String(row.error_message) : null,
    uploaded_at: String(row.uploaded_at),
    processed_at: row.processed_at ? String(row.processed_at) : null,
    expires_at: String(row.expires_at),
  };
}

async function summarizeExtractedContent(
  file: UploadedFileRecord,
  parsed: ParsedFileResult,
): Promise<{ summary: string; extractedJson: Record<string, unknown> }> {
  const promptPayload = {
    file_name: file.original_name,
    file_kind: file.file_kind,
    mime_type: file.mime_type,
    parser_summary: parsed.summaryHint,
    structured_data: parsed.extractedJson,
    extracted_text_excerpt: clipText(parsed.extractedText, 10_000),
  };

  const response = await genai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Analise o arquivo enviado ao Optimus.

Retorne APENAS JSON valido com este formato:
{
  "summary": "resumo curto e claro",
  "document_type": "tipo mais provavel do arquivo",
  "key_points": ["ponto 1", "ponto 2"],
  "suggested_questions": ["pergunta 1", "pergunta 2"],
  "entities": ["entidade 1", "entidade 2"],
  "detected_metrics": ["metrica 1", "metrica 2"]
}

DADOS:
${JSON.stringify(promptPayload)}`,
          },
        ],
      },
    ],
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  const parsedResponse = safeJsonParse<Record<string, unknown>>(response.text || "") || {};
  const summary = String(parsedResponse.summary || parsed.summaryHint || "Arquivo processado com sucesso.");
  return {
    summary,
    extractedJson: parsedResponse,
  };
}

async function analyzeBinaryWithGemini(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  fileKind: ParsedFileKind,
): Promise<ParsedFileResult> {
  const response = await genai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Analise este arquivo enviado ao Optimus.

Retorne APENAS JSON valido:
{
  "summary": "resumo executivo curto",
  "detected_text": "texto detectado no arquivo",
  "document_type": "tipo mais provavel do conteudo",
  "tables_or_metrics": ["item 1", "item 2"],
  "entities": ["entidade 1", "entidade 2"],
  "suggested_questions": ["pergunta 1", "pergunta 2"]
}`,
          },
          createPartFromBase64(buffer.toString("base64"), mimeType),
        ],
      },
    ],
    config: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const parsedResponse = safeJsonParse<Record<string, unknown>>(response.text || "") || {};
  return {
    parserName: "gemini-multimodal-parser",
    fileKind,
    extractedText: String(parsedResponse.detected_text || ""),
    extractedJson: {
      original_name: fileName,
      ...parsedResponse,
    },
    summaryHint: String(parsedResponse.summary || `${fileKind} analisado com Gemini.`),
    metadata: {
      multimodal: true,
    },
  };
}

export class FileProcessor {
  static async uploadFiles(params: {
    files: UploadInputFile[];
    userId: string;
    tenantId: string;
    conversationId?: string | null;
  }): Promise<UploadedFileRecord[]> {
    const { files, userId, tenantId, conversationId } = params;

    if (files.length === 0) {
      throw new Error("Nenhum arquivo enviado.");
    }

    if (files.length > env.OPTIMUS_UPLOAD_MAX_FILES) {
      throw new Error(`Voce pode enviar no maximo ${env.OPTIMUS_UPLOAD_MAX_FILES} arquivos por vez.`);
    }

    await this.ensureUploadQuota(userId, files);

    const uploaded: UploadedFileRecord[] = [];

    for (const file of files) {
      const detected = await this.validateFile(file);
      const fileId = randomUUID();
      const normalizedName = sanitizeFilename(file.originalname);
      const storagePath = `${userId}/${fileId}-${normalizedName}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from(TEMP_BUCKET)
        .upload(storagePath, file.buffer, {
          contentType: detected.mimeType,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Falha ao enviar ${file.originalname}: ${uploadError.message}`);
      }

      const insertRow = {
        id: fileId,
        tenant_id: tenantId,
        user_id: userId,
        conversation_id: conversationId || null,
        storage_bucket: TEMP_BUCKET,
        storage_path: storagePath,
        original_name: file.originalname,
        normalized_name: normalizedName,
        file_ext: detected.extension,
        mime_type: detected.mimeType,
        file_kind: detected.kind,
        size_bytes: file.size,
        status: "queued",
        processing_stage: "queued",
        processing_progress: 5,
        metadata: {
          reported_mime: file.mimetype,
        },
      };

      const { data, error } = await supabaseAdmin
        .from("uploaded_files")
        .insert(insertRow)
        .select("*")
        .single();

      if (error || !data) {
        await supabaseAdmin.storage.from(TEMP_BUCKET).remove([storagePath]).catch(() => undefined);
        throw new Error(`Falha ao registrar ${file.originalname}: ${error?.message}`);
      }

      const record = toUploadedFileRecord(data as Record<string, unknown>);
      uploaded.push(record);
      await this.queueFileProcessing(record.id);
    }

    return uploaded;
  }

  static async listFiles(params: {
    userId: string;
    tenantId: string;
    conversationId?: string | null;
    limit?: number;
  }): Promise<UploadedFileRecord[]> {
    let query = supabaseAdmin
      .from("uploaded_files")
      .select("*")
      .eq("user_id", params.userId)
      .eq("tenant_id", params.tenantId)
      .neq("status", "deleted")
      .order("uploaded_at", { ascending: false })
      .limit(params.limit || 20);

    if (params.conversationId) {
      query = query.eq("conversation_id", params.conversationId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Erro ao listar arquivos: ${error.message}`);
    }

    return (data || []).map((row) => toUploadedFileRecord(row as Record<string, unknown>));
  }

  static async getFileById(params: {
    fileId: string;
    userId: string;
    tenantId: string;
  }): Promise<UploadedFileRecord | null> {
    const { data, error } = await supabaseAdmin
      .from("uploaded_files")
      .select("*")
      .eq("id", params.fileId)
      .eq("user_id", params.userId)
      .eq("tenant_id", params.tenantId)
      .single();

    if (error || !data) return null;
    return toUploadedFileRecord(data as Record<string, unknown>);
  }

  static async attachFilesToConversation(params: {
    fileIds: string[];
    conversationId: string;
    userId: string;
    tenantId: string;
  }): Promise<void> {
    if (params.fileIds.length === 0) return;

    const { data: conversation, error: conversationError } = await supabaseAdmin
      .from("conversations")
      .select("id")
      .eq("id", params.conversationId)
      .eq("user_id", params.userId)
      .eq("tenant_id", params.tenantId)
      .maybeSingle();

    if (conversationError) {
      throw new Error(`Erro ao validar conversa: ${conversationError.message}`);
    }

    if (!conversation) {
      throw new Error("Conversa nao encontrada para associar arquivos.");
    }

    const { error } = await supabaseAdmin
      .from("uploaded_files")
      .update({ conversation_id: params.conversationId })
      .in("id", params.fileIds)
      .eq("user_id", params.userId)
      .eq("tenant_id", params.tenantId);

    if (error) {
      throw new Error(`Erro ao associar arquivos a conversa: ${error.message}`);
    }
  }

  static async buildPromptWithFiles(params: {
    message: string;
    userId: string;
    tenantId: string;
    conversationId?: string | null;
    fileIds?: string[];
  }): Promise<string> {
    const contexts = await this.getPromptContexts(params);
    if (contexts.length === 0) return params.message;

    const filesText = contexts
      .map((file, index) => {
        const jsonText = file.extracted_json ? JSON.stringify(file.extracted_json).slice(0, 4_000) : "";
        return [
          `Arquivo ${index + 1}: ${file.original_name} (${file.mime_type})`,
          `Resumo: ${file.summary}`,
          file.extracted_text_excerpt ? `Trecho extraido:\n${file.extracted_text_excerpt}` : "",
          jsonText ? `Dados estruturados:\n${jsonText}` : "",
        ].filter(Boolean).join("\n");
      })
      .join("\n\n---\n\n");

    return `CONTEXTO DE ARQUIVOS ENVIADOS PELO USUARIO:
${filesText}

INSTRUCOES:
- Responda considerando os arquivos acima como fonte primaria quando a pergunta mencionar o conteudo deles.
- Se houver mais de um arquivo, compare os dados quando a pergunta pedir diferencas, divergencias ou validacao.
- Se os arquivos forem de planilha ou PDF, use os dados estruturados primeiro e o texto extraido como apoio.

Pergunta do usuario:
${params.message}`;
  }

  static async askAboutFiles(params: {
    question: string;
    fileIds: string[];
    userId: string;
    tenantId: string;
    conversationId?: string | null;
  }): Promise<{ message: string }> {
    const prompt = await this.buildPromptWithFiles({
      message: params.question,
      fileIds: params.fileIds,
      userId: params.userId,
      tenantId: params.tenantId,
      conversationId: params.conversationId,
    });

    const response = await genai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.2,
        maxOutputTokens: 4096,
      },
    });

    return {
      message: response.text || "Nao consegui responder sobre o arquivo.",
    };
  }

  static async getSignedDownloadUrl(params: {
    fileId: string;
    userId: string;
    tenantId: string;
  }): Promise<{ url: string; filename: string }> {
    const file = await this.getFileById(params);
    if (!file) {
      throw new Error("Arquivo nao encontrado.");
    }

    const { data, error } = await supabaseAdmin.storage
      .from(file.storage_bucket)
      .createSignedUrl(file.storage_path, 60 * 15, {
        download: file.original_name,
      });

    if (error || !data?.signedUrl) {
      throw new Error(`Erro ao gerar link de download: ${error?.message}`);
    }

    return {
      url: data.signedUrl,
      filename: file.original_name,
    };
  }

  static async deleteFile(params: {
    fileId: string;
    userId: string;
    tenantId: string;
  }): Promise<void> {
    const file = await this.getFileById(params);
    if (!file) {
      throw new Error("Arquivo nao encontrado.");
    }

    await supabaseAdmin.storage.from(file.storage_bucket).remove([file.storage_path]).catch(() => undefined);

    const { error } = await supabaseAdmin
      .from("uploaded_files")
      .update({
        status: "deleted",
        processing_stage: "deleted",
        processing_progress: 100,
        extracted_text: null,
        extracted_json: null,
        summary: null,
        metadata: { deleted_manually: true },
      })
      .eq("id", file.id)
      .eq("user_id", params.userId)
      .eq("tenant_id", params.tenantId);

    if (error) {
      throw new Error(`Erro ao deletar arquivo: ${error.message}`);
    }
  }

  static async processUploadedFile(uploadedFileId: string): Promise<void> {
    const file = await this.getFileForProcessing(uploadedFileId);
    if (!file || file.status === "deleted") return;

    try {
      await this.updateProcessingState(file.id, "processing", "downloading", 15);

      const { data, error } = await supabaseAdmin.storage.from(file.storage_bucket).download(file.storage_path);
      if (error || !data) {
        throw new Error(`Falha ao baixar arquivo do storage: ${error?.message}`);
      }

      const arrayBuffer = await data.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      await this.updateProcessingState(file.id, "processing", "parsing", 35);

      let parsed: ParsedFileResult;

      if (file.file_kind === "text") {
        parsed = parseTxtFile(buffer, file.original_name);
      } else if (file.file_kind === "spreadsheet") {
        parsed = parseSpreadsheetFile(buffer, file.original_name);
      } else if (file.file_kind === "pdf") {
        parsed = await parsePdfFile(buffer, file.original_name);
        if (parsed.needsMultimodalAnalysis) {
          await this.updateProcessingState(file.id, "processing", "vision", 55);
          parsed = await analyzeBinaryWithGemini(buffer, file.mime_type, file.original_name, "pdf");
        }
      } else {
        await this.updateProcessingState(file.id, "processing", "vision", 55);
        parsed = await parseImageWithGemini(buffer, file.mime_type, file.original_name);
      }

      let extractedJson: Record<string, unknown> = {
        ...(parsed.extractedJson || {}),
      };

      if (file.file_kind === "spreadsheet") {
        await this.updateProcessingState(file.id, "processing", "validating", 65);
        const validation = await this.validateSpreadsheetAgainstCatalog(file.tenant_id, buffer);
        extractedJson.validation = validation;
      }

      await this.updateProcessingState(file.id, "processing", "summarizing", 80);
      const summaryResult = await summarizeExtractedContent(file, {
        ...parsed,
        extractedJson,
      });

      await supabaseAdmin
        .from("uploaded_files")
        .update({
          status: "processed",
          processing_stage: "processed",
          processing_progress: 100,
          parser_name: parsed.parserName,
          extracted_text: clipText(parsed.extractedText),
          extracted_json: {
            ...(parsed.extractedJson || {}),
            summary: summaryResult.extractedJson,
          },
          summary: summaryResult.summary,
          metadata: {
            ...(parsed.metadata || {}),
            processed_with_gemini: true,
          },
          processed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", file.id);
    } catch (error) {
      console.error("[FileProcessor] Processing error:", error);
      await supabaseAdmin
        .from("uploaded_files")
        .update({
          status: "error",
          processing_stage: "error",
          processing_progress: 100,
          error_message: error instanceof Error ? error.message : "Erro desconhecido",
          processed_at: new Date().toISOString(),
        })
        .eq("id", uploadedFileId);
    }
  }

  static async cleanupExpiredFiles(): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from("uploaded_files")
      .select("id, storage_bucket, storage_path")
      .lt("expires_at", new Date().toISOString())
      .neq("status", "deleted")
      .limit(200);

    if (error || !data || data.length === 0) {
      return;
    }

    const byBucket = new Map<string, string[]>();
    data.forEach((row) => {
      const bucket = String(row.storage_bucket);
      const list = byBucket.get(bucket) || [];
      list.push(String(row.storage_path));
      byBucket.set(bucket, list);
    });

    for (const [bucket, paths] of byBucket.entries()) {
      await supabaseAdmin.storage.from(bucket).remove(paths).catch(() => undefined);
    }

    await supabaseAdmin
      .from("uploaded_files")
      .update({
        status: "deleted",
        processing_stage: "expired",
        processing_progress: 100,
        extracted_text: null,
        extracted_json: null,
        summary: null,
        metadata: { deleted_by_cleanup: true },
      })
      .in("id", data.map((row) => String(row.id)));
  }

  private static async getPromptContexts(params: {
    fileIds?: string[];
    conversationId?: string | null;
    userId: string;
    tenantId: string;
  }): Promise<FilePromptContext[]> {
    let query = supabaseAdmin
      .from("uploaded_files")
      .select("id, original_name, mime_type, file_kind, summary, extracted_text, extracted_json")
      .eq("user_id", params.userId)
      .eq("tenant_id", params.tenantId)
      .eq("status", "processed")
      .order("uploaded_at", { ascending: false });

    if (params.fileIds && params.fileIds.length > 0) {
      query = query.in("id", params.fileIds);
    } else if (params.conversationId) {
      query = query.eq("conversation_id", params.conversationId).limit(5);
    } else {
      return [];
    }

    const { data, error } = await query;
    if (error || !data) return [];

    void supabaseAdmin
      .from("uploaded_files")
      .update({ last_accessed_at: new Date().toISOString() })
      .in("id", data.map((row) => String(row.id)));

    return data.map((row) => ({
      id: String(row.id),
      original_name: String(row.original_name),
      mime_type: String(row.mime_type),
      file_kind: String(row.file_kind) as ParsedFileKind,
      summary: String(row.summary || "Arquivo processado."),
      extracted_text_excerpt: clipText(String(row.extracted_text || ""), MAX_PROMPT_CHARS_PER_FILE),
      extracted_json: (row.extracted_json as Record<string, unknown> | null) || null,
    }));
  }

  private static async validateSpreadsheetAgainstCatalog(
    tenantId: string,
    buffer: Buffer,
  ): Promise<Record<string, unknown>> {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const rows = workbook.SheetNames.flatMap((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false }).slice(0, 1000);
    });

    if (rows.length === 0) {
      return { matchedProducts: 0, missingProducts: 0, priceMismatches: 0, stockMismatches: 0, examples: [] };
    }

    const { data, error } = await supabaseAdmin
      .from("product_insights")
      .select("sku, name, sale_price, stock_level")
      .eq("tenant_id", tenantId)
      .limit(2000);

    if (error) {
      return { error: error.message };
    }

    return {
      ...validateSpreadsheetRows(rows, (data || []) as Array<Record<string, unknown>>),
    };
  }

  private static async getFileForProcessing(uploadedFileId: string): Promise<UploadedFileRecord | null> {
    const { data, error } = await supabaseAdmin
      .from("uploaded_files")
      .select("*")
      .eq("id", uploadedFileId)
      .single();

    if (error || !data) return null;
    return toUploadedFileRecord(data as Record<string, unknown>);
  }

  private static async ensureUploadQuota(userId: string, files: UploadInputFile[]): Promise<void> {
    const hourlyLimit = env.OPTIMUS_UPLOADS_PER_HOUR;
    const storageLimitBytes = env.OPTIMUS_UPLOAD_STORAGE_MB * 1024 * 1024;
    const maxBytesPerFile = env.OPTIMUS_UPLOAD_MAX_MB * 1024 * 1024;
    const uploadBytes = files.reduce((acc, file) => acc + file.size, 0);

    if (files.some((file) => file.size > maxBytesPerFile)) {
      throw new Error(`Cada arquivo deve ter no maximo ${env.OPTIMUS_UPLOAD_MAX_MB}MB.`);
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const [{ count }, storageRows] = await Promise.all([
      supabaseAdmin
        .from("uploaded_files")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("uploaded_at", oneHourAgo),
      supabaseAdmin
        .from("uploaded_files")
        .select("size_bytes")
        .eq("user_id", userId)
        .neq("status", "deleted")
        .gte("expires_at", new Date().toISOString()),
    ]);

    const usedBytes = (storageRows.data || []).reduce((acc, row) => acc + Number(row.size_bytes || 0), 0);

    if ((count || 0) + files.length > hourlyLimit) {
      throw new Error(`Limite de ${hourlyLimit} uploads por hora atingido.`);
    }

    if (usedBytes + uploadBytes > storageLimitBytes) {
      throw new Error(`Limite de ${env.OPTIMUS_UPLOAD_STORAGE_MB}MB de armazenamento temporario atingido.`);
    }
  }

  private static async validateFile(file: UploadInputFile): Promise<{
    extension: string;
    mimeType: string;
    kind: ParsedFileKind;
  }> {
    const extension = normalizeExt(file.originalname);
    const extConfig = mimeAllowedForExt(extension, file.mimetype);
    const detected = await fileTypeFromBuffer(file.buffer);

    if (!extConfig && !detected) {
      throw new Error(`Formato nao suportado: ${file.originalname}`);
    }

    const detectedExt = detected?.ext ? `.${detected.ext.toLowerCase()}` : extension;
    const detectedMime = detected?.mime || file.mimetype;
    const config = mimeAllowedForExt(detectedExt, detectedMime) || extConfig;

    if (!config) {
      throw new Error(`Tipo de arquivo invalido para ${file.originalname}.`);
    }

    if (config.kind === "text" && !file.mimetype.startsWith("text/") && extension !== ".txt") {
      throw new Error(`Arquivo de texto invalido: ${file.originalname}.`);
    }

    return {
      extension: detectedExt,
      mimeType: config.kind === "text" ? "text/plain" : detectedMime,
      kind: config.kind,
    };
  }

  private static async queueFileProcessing(fileId: string): Promise<void> {
    const { FileProcessingQueueService } = await import("../file-processing-queue");
    await FileProcessingQueueService.enqueue(fileId);
  }

  private static async updateProcessingState(
    fileId: string,
    status: UploadedFileRecord["status"],
    stage: string,
    progress: number,
  ): Promise<void> {
    await supabaseAdmin
      .from("uploaded_files")
      .update({
        status,
        processing_stage: stage,
        processing_progress: progress,
      })
      .eq("id", fileId);
  }
}
