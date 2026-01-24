// src/modules/library/viewers/SQLEditor.tsx
// Editable SQL with line numbers and auto-save

import { useState, useCallback, useRef } from "react";
import { FileCode, Check, WrapText } from "lucide-react";

interface SQLEditorProps {
  content: string;
  filename: string;
  onChange: (content: string) => void;
  saveStatus: "saved" | "saving" | "unsaved";
}

export function SQLEditor({ content, filename, onChange, saveStatus }: SQLEditorProps) {
  const [text, setText] = useState(content);
  const [wordWrap, setWordWrap] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Sync scroll between textarea and line numbers
  const handleScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  // Handle text change
  const handleChange = useCallback((newText: string) => {
    setText(newText);
    onChange(newText);
  }, [onChange]);

  // Handle tab key for indentation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newText = text.substring(0, start) + "  " + text.substring(end);
      setText(newText);
      onChange(newText);
      // Set cursor position after the inserted tab
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
  }, [text, onChange]);

  // Calculate line numbers
  const lineCount = text.split("\n").length;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/80">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <FileCode size={16} className="text-cyan-400" />
            <span className="text-sm text-zinc-400">{filename}</span>
            <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">SQL</span>
          </div>

          {/* Status */}
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
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setWordWrap(!wordWrap)}
            className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${
              wordWrap ? "text-teal-400 bg-zinc-800" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            }`}
            title="Toggle word wrap"
          >
            <WrapText size={12} />
            Wrap
          </button>
        </div>
      </div>

      {/* Editor with line numbers */}
      <div className="flex-1 flex overflow-hidden">
        {/* Line numbers */}
        <div
          ref={lineNumbersRef}
          className="flex-shrink-0 bg-zinc-950 border-r border-zinc-800 overflow-hidden select-none"
        >
          <div className="py-4 px-2 font-mono text-sm text-right">
            {lineNumbers.map((num) => (
              <div key={num} className="text-zinc-600 leading-6 h-6">
                {num}
              </div>
            ))}
          </div>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          className={`flex-1 p-4 bg-zinc-950 text-zinc-300 font-mono text-sm resize-none focus:outline-none leading-6 ${
            wordWrap ? "whitespace-pre-wrap" : "whitespace-pre overflow-x-auto"
          }`}
          spellCheck={false}
          placeholder="Enter SQL..."
        />
      </div>
    </div>
  );
}
