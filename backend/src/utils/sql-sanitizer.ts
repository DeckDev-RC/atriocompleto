/**
 * SQL Sanitizer — Segurança para Text-to-SQL dinâmico
 *
 * Garante que apenas queries SELECT seguras sejam executadas
 * contra a tabela orders no Supabase.
 */

const ALLOWED_TABLES = ["orders"];

const BLOCKED_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "TRUNCATE",
  "CREATE",
  "GRANT",
  "REVOKE",
  "EXEC",
  "EXECUTE",
  "INTO",
];

const BLOCKED_PATTERNS = [
  /--/g, // SQL comments
  /\/\*/g, // Block comments
  /;\s*\w/g, // Multiple statements
  /UNION\s+(ALL\s+)?SELECT/gi, // UNION injection
  /xp_/gi, // SQL Server extended procs
  /sp_/gi, // SQL Server system procs
];

export interface SanitizeResult {
  valid: boolean;
  query: string;
  error?: string;
}

export function sanitizeSQL(rawSQL: string): SanitizeResult {
  const trimmed = rawSQL.trim();

  // 1. Must start with SELECT
  if (!/^SELECT\b/i.test(trimmed)) {
    return { valid: false, query: "", error: "Apenas consultas SELECT são permitidas." };
  }

  // 2. Remove trailing semicolons
  const cleaned = trimmed.replace(/;\s*$/, "");

  // 3. Check for blocked keywords
  const upper = cleaned.toUpperCase();
  for (const keyword of BLOCKED_KEYWORDS) {
    // Match whole word only
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(upper)) {
      return { valid: false, query: "", error: `Operação "${keyword}" não é permitida.` };
    }
  }

  // 4. Check for blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(cleaned)) {
      return { valid: false, query: "", error: "Padrão SQL potencialmente perigoso detectado." };
    }
  }

  // 5. Check that only allowed tables are referenced
  const fromMatches = cleaned.match(/\bFROM\s+(\w+)/gi);
  const joinMatches = cleaned.match(/\bJOIN\s+(\w+)/gi);

  const referencedTables: string[] = [];
  if (fromMatches) {
    fromMatches.forEach((m) => {
      const tableName = m.replace(/^(FROM|JOIN)\s+/i, "").toLowerCase();
      referencedTables.push(tableName);
    });
  }
  if (joinMatches) {
    joinMatches.forEach((m) => {
      const tableName = m.replace(/^(FROM|JOIN)\s+/i, "").toLowerCase();
      referencedTables.push(tableName);
    });
  }

  for (const table of referencedTables) {
    if (!ALLOWED_TABLES.includes(table)) {
      return { valid: false, query: "", error: `Tabela "${table}" não é acessível.` };
    }
  }

  // 6. Add LIMIT if not present
  const hasLimit = /\bLIMIT\b/i.test(cleaned);
  const finalQuery = hasLimit ? cleaned : `${cleaned} LIMIT 1000`;

  return { valid: true, query: finalQuery };
}
