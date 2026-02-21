// src/modules/library/viewers/JSONEditor.tsx
// Editable JSON with validation and formatting

import { useState, useCallback, useRef } from "react";
import { FileJson, AlertCircle, Check, WrapText, AlignLeft } from "lucide-react";

interface JSONEditorProps {
  content: string;
  filename: string;
  onChange: (content: string) => void;
  saveStatus: "saved" | "saving" | "unsaved";
}

export function JSONEditor({ content, filename, onChange, saveStatus }: JSONEditorProps) {
  const [text, setText] = useState(() => {
    // Try to format on initial load
    try {
      return JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      return content;
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [wordWrap, setWordWrap] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Validate JSON and update parent
  const handleChange = useCallback((newText: string) => {
    setText(newText);

    try {
      JSON.parse(newText);
      setError(null);
      onChange(newText);
    } catch (e) {
      setError((e as Error).message);
      // Don't call onChange if invalid - don't save broken JSON
    }
  }, [onChange]);

  // Format/prettify JSON
  const handleFormat = useCallback(() => {
    try {
      const parsed = JSON.parse(text);
      const formatted = JSON.stringify(parsed, null, 2);
      setText(formatted);
      setError(null);
      onChange(formatted);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [text, onChange]);

  // Handle tab key for indentation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newText = text.substring(0, start) + "  " + text.substring(end);
      setText(newText);
      // Set cursor position after the inserted tab
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
  }, [text]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-900">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <FileJson size={16} className="text-green-500 dark:text-green-400" />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">{filename}</span>
          </div>

          {/* Status */}
          {error ? (
            <div className="flex items-center gap-1 text-red-400">
              <AlertCircle size={12} />
              <span className="text-xs">Invalid JSON</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              {saveStatus === "saved" && <Check size={12} className="text-green-500" />}
              <span className={`text-xs ${
                saveStatus === "saving" ? "text-zinc-500" :
                saveStatus === "unsaved" ? "text-amber-500" :
                "text-zinc-600"
              }`}>
                {saveStatus === "saving" ? "Saving..." :
                 saveStatus === "unsaved" ? "Unsaved" :
                 "Saved"}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleFormat}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded transition-colors"
            title="Format JSON"
          >
            <AlignLeft size={12} />
            Format
          </button>
          <button
            onClick={() => setWordWrap(!wordWrap)}
            className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
              wordWrap ? "text-teal-600 dark:text-teal-400 bg-zinc-200 dark:bg-zinc-800" : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800"
            }`}
            title="Toggle word wrap"
          >
            <WrapText size={12} />
            Wrap
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-red-950/50 border-b border-red-900/50">
          <p className="text-xs text-red-400 font-mono">{error}</p>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`w-full h-full p-4 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-300 font-mono text-sm resize-none focus:outline-none ${
            wordWrap ? "whitespace-pre-wrap" : "whitespace-pre overflow-x-auto"
          }`}
          spellCheck={false}
          placeholder="Enter JSON..."
        />
      </div>
    </div>
  );
}
