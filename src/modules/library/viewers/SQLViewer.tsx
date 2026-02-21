// src/modules/library/viewers/SQLViewer.tsx
// SQL file viewer with syntax highlighting

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface SQLViewerProps {
  content: string;
  filename: string;
}

// SQL keywords for highlighting
const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "IS", "NULL", "AS",
  "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "FULL", "CROSS", "ON",
  "ORDER", "BY", "ASC", "DESC", "LIMIT", "OFFSET", "GROUP", "HAVING",
  "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "DROP",
  "ALTER", "TABLE", "INDEX", "VIEW", "DATABASE", "SCHEMA",
  "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "UNIQUE", "DEFAULT",
  "CONSTRAINT", "CHECK", "CASCADE", "RESTRICT",
  "UNION", "ALL", "INTERSECT", "EXCEPT", "EXISTS",
  "CASE", "WHEN", "THEN", "ELSE", "END",
  "COUNT", "SUM", "AVG", "MIN", "MAX", "DISTINCT",
  "COALESCE", "NULLIF", "CAST", "CONVERT",
  "TRUE", "FALSE", "BETWEEN", "LIKE", "ILIKE",
  "WITH", "RECURSIVE", "RETURNING", "OVER", "PARTITION",
  "ROW_NUMBER", "RANK", "DENSE_RANK", "LAG", "LEAD",
  "FIRST_VALUE", "LAST_VALUE", "NTH_VALUE",
];

const SQL_TYPES = [
  "INT", "INTEGER", "BIGINT", "SMALLINT", "TINYINT",
  "DECIMAL", "NUMERIC", "FLOAT", "REAL", "DOUBLE",
  "VARCHAR", "CHAR", "TEXT", "NVARCHAR", "NCHAR",
  "DATE", "TIME", "TIMESTAMP", "DATETIME", "INTERVAL",
  "BOOLEAN", "BOOL", "BIT",
  "BLOB", "BINARY", "VARBINARY",
  "JSON", "JSONB", "XML", "UUID",
  "ARRAY", "SERIAL", "BIGSERIAL",
];

// Simple SQL syntax highlighter
function highlightSQL(code: string): React.ReactNode[] {
  const lines = code.split("\n");

  return lines.map((line, lineIdx) => {
    const tokens: React.ReactNode[] = [];
    let remaining = line;
    let tokenIdx = 0;

    while (remaining.length > 0) {
      // Check for comments
      if (remaining.startsWith("--")) {
        tokens.push(
          <span key={tokenIdx++} className="text-zinc-500 italic">
            {remaining}
          </span>
        );
        break;
      }

      // Check for strings (single quotes)
      const stringMatch = remaining.match(/^'([^']*(?:''[^']*)*)'/);
      if (stringMatch) {
        tokens.push(
          <span key={tokenIdx++} className="text-green-600 dark:text-green-400">
            {stringMatch[0]}
          </span>
        );
        remaining = remaining.slice(stringMatch[0].length);
        continue;
      }

      // Check for numbers
      const numberMatch = remaining.match(/^\d+(\.\d+)?/);
      if (numberMatch) {
        tokens.push(
          <span key={tokenIdx++} className="text-cyan-600 dark:text-cyan-400">
            {numberMatch[0]}
          </span>
        );
        remaining = remaining.slice(numberMatch[0].length);
        continue;
      }

      // Check for keywords/identifiers
      const wordMatch = remaining.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
      if (wordMatch) {
        const word = wordMatch[0];
        const upperWord = word.toUpperCase();

        if (SQL_KEYWORDS.includes(upperWord)) {
          tokens.push(
            <span key={tokenIdx++} className="text-blue-600 dark:text-blue-400 font-semibold">
              {word}
            </span>
          );
        } else if (SQL_TYPES.includes(upperWord)) {
          tokens.push(
            <span key={tokenIdx++} className="text-purple-600 dark:text-purple-400">
              {word}
            </span>
          );
        } else {
          tokens.push(
            <span key={tokenIdx++} className="text-zinc-600 dark:text-zinc-300">
              {word}
            </span>
          );
        }
        remaining = remaining.slice(word.length);
        continue;
      }

      // Check for operators and punctuation
      const operatorMatch = remaining.match(/^[=<>!]+|^[(),;.*]/);
      if (operatorMatch) {
        tokens.push(
          <span key={tokenIdx++} className="text-yellow-600 dark:text-yellow-400">
            {operatorMatch[0]}
          </span>
        );
        remaining = remaining.slice(operatorMatch[0].length);
        continue;
      }

      // Default: take one character
      tokens.push(
        <span key={tokenIdx++} className="text-zinc-600 dark:text-zinc-300">
          {remaining[0]}
        </span>
      );
      remaining = remaining.slice(1);
    }

    return (
      <div key={lineIdx} className="flex">
        <span className="w-10 text-right pr-4 text-zinc-400 dark:text-zinc-600 select-none flex-shrink-0">
          {lineIdx + 1}
        </span>
        <span className="flex-1">{tokens}</span>
      </div>
    );
  });
}

export function SQLViewer({ content, filename }: SQLViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore
    }
  };

  const highlighted = highlightSQL(content);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">{filename}</span>
          <span className="text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">SQL</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            {copied ? <Check size={12} className="text-green-500 dark:text-green-400" /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <div className="font-mono text-sm overflow-x-auto">
        {highlighted}
      </div>
    </div>
  );
}
