// DetailsTab: Reusable input components (TagsInput, ComboBox)

import { useState, useMemo, useEffect } from "react";
import { X, ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";

// TagsInput component - displays tags as pills with add/remove
export function TagsInput({
  value,
  onChange,
  suggestions
}: {
  value: string;
  onChange: (val: string) => void;
  suggestions: readonly string[];
}) {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const tags = useMemo(() =>
    value ? value.split(",").map(t => t.trim()).filter(Boolean) : [],
    [value]
  );

  const filteredSuggestions = useMemo(() =>
    suggestions.filter(s =>
      !tags.includes(s) &&
      s.toLowerCase().includes(inputValue.toLowerCase())
    ).slice(0, 8),
    [suggestions, tags, inputValue]
  );

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      const newTags = [...tags, trimmed].join(", ");
      onChange(newTags);
    }
    setInputValue("");
    setShowSuggestions(false);
  };

  const removeTag = (tagToRemove: string) => {
    const newTags = tags.filter(t => t !== tagToRemove).join(", ");
    onChange(newTags);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1 p-1.5 min-h-[32px] rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300"
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="hover:text-teal-900 dark:hover:text-teal-100"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? "Add tags..." : ""}
          className="flex-1 min-w-[60px] text-xs bg-transparent outline-none text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400"
        />
      </div>
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-40 overflow-auto">
          {filteredSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(suggestion)}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ComboBox component - dropdown with custom value entry
export function ComboBox({
  value,
  onChange,
  options,
  placeholder = "Select...",
}: {
  value: string;
  onChange: (val: string) => void;
  options: readonly string[];
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const filteredOptions = useMemo(() =>
    options.filter(opt =>
      opt.toLowerCase().includes(inputValue.toLowerCase())
    ),
    [options, inputValue]
  );

  const handleSelect = (opt: string) => {
    onChange(opt);
    setInputValue(opt);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setInputValue("");
    // Keep dropdown open so user can immediately select a new value
    setIsOpen(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setIsOpen(true);
  };

  const handleBlur = () => {
    setTimeout(() => {
      setIsOpen(false);
      // Save the input value (allow empty to clear)
      if (inputValue !== value) {
        onChange(inputValue.trim());
      }
    }, 150);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="w-full text-xs px-2 py-1.5 pr-6 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400"
      />
      <ChevronDown
        size={12}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
      />
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-40 overflow-auto">
          {/* Clear option */}
          {value && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleClear}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500 italic border-b border-zinc-100 dark:border-zinc-700"
            >
              Clear selection
            </button>
          )}
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <button
                key={opt}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(opt)}
                className={cn(
                  "w-full px-3 py-1.5 text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-700",
                  opt === value
                    ? "bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300"
                    : "text-zinc-800 dark:text-zinc-200"
                )}
              >
                {opt}
              </button>
            ))
          ) : inputValue.trim() ? (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(inputValue.trim())}
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-zinc-100 dark:hover:bg-zinc-700 text-teal-600 dark:text-teal-400"
            >
              Add "{inputValue.trim()}"
            </button>
          ) : !value ? (
            <div className="px-3 py-1.5 text-xs text-zinc-400">Type to search or add new</div>
          ) : null}
        </div>
      )}
    </div>
  );
}
