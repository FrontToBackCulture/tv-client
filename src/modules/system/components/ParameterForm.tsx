// src/modules/system/components/ParameterForm.tsx
// Dynamic form generation from JSON Schema

import { useState, useCallback } from "react";
import { PropertySchema } from "../hooks/useMcpTools";
import { cn } from "../../../lib/cn";

interface ParameterFormProps {
  properties: Record<string, PropertySchema>;
  required?: string[];
  onSubmit: (values: Record<string, unknown>) => void;
  isLoading?: boolean;
}

export function ParameterForm({ properties, required = [], onSubmit, isLoading }: ParameterFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateValue = useCallback((key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    // Clear error when user types
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, [errors]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    const newErrors: Record<string, string> = {};
    required.forEach((key) => {
      const val = values[key];
      if (val === undefined || val === null || val === "") {
        newErrors[key] = "Required";
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Clean up empty values before submitting
    const cleanedValues: Record<string, unknown> = {};
    Object.entries(values).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== "") {
        cleanedValues[key] = val;
      }
    });

    onSubmit(cleanedValues);
  };

  const entries = Object.entries(properties);

  if (entries.length === 0) {
    return (
      <div className="text-sm text-zinc-500 dark:text-zinc-400 italic">
        This tool has no parameters.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {entries.map(([key, schema]) => {
        const isRequired = required.includes(key);
        const error = errors[key];

        return (
          <div key={key}>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              {key}
              {isRequired && <span className="text-red-500 ml-1">*</span>}
            </label>
            <FieldInput
              schema={schema}
              value={values[key]}
              onChange={(val) => updateValue(key, val)}
              error={error}
            />
            {schema.description && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                {schema.description}
              </p>
            )}
            {error && (
              <p className="text-xs text-red-500 mt-1">{error}</p>
            )}
          </div>
        );
      })}

      <button
        type="submit"
        disabled={isLoading}
        className={cn(
          "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
          "bg-teal-600 hover:bg-teal-500 text-white",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {isLoading ? "Executing..." : "Execute"}
      </button>
    </form>
  );
}

// Field input based on schema type
function FieldInput({
  schema,
  value,
  onChange,
  error,
}: {
  schema: PropertySchema;
  value: unknown;
  onChange: (val: unknown) => void;
  error?: string;
}) {
  const baseClass = cn(
    "w-full px-3 py-2 text-sm rounded-lg border transition-colors",
    "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100",
    "placeholder:text-zinc-400",
    error
      ? "border-red-300 dark:border-red-700 focus:border-red-500"
      : "border-zinc-300 dark:border-zinc-700 focus:border-teal-500",
    "focus:outline-none"
  );

  // Handle enums (dropdowns)
  if (schema.enum && schema.enum.length > 0) {
    return (
      <select
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        className={baseClass}
      >
        <option value="">Select...</option>
        {schema.enum.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  // Handle booleans
  if (schema.type === "boolean") {
    return (
      <select
        value={value === undefined ? "" : value ? "true" : "false"}
        onChange={(e) => {
          if (e.target.value === "") {
            onChange(undefined);
          } else {
            onChange(e.target.value === "true");
          }
        }}
        className={baseClass}
      >
        <option value="">Select...</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  // Handle numbers
  if (schema.type === "number" || schema.type === "integer") {
    return (
      <input
        type="number"
        value={(value as number) ?? ""}
        onChange={(e) => {
          const num = e.target.value === "" ? undefined : Number(e.target.value);
          onChange(num);
        }}
        placeholder={schema.default !== undefined ? `Default: ${schema.default}` : undefined}
        className={baseClass}
      />
    );
  }

  // Handle arrays and objects (JSON input)
  if (schema.type === "array" || schema.type === "object") {
    const stringVal = value === undefined ? "" : JSON.stringify(value, null, 2);
    return (
      <textarea
        value={stringVal}
        onChange={(e) => {
          if (e.target.value === "") {
            onChange(undefined);
            return;
          }
          try {
            const parsed = JSON.parse(e.target.value);
            onChange(parsed);
          } catch {
            // Keep raw string, validation will handle it
            onChange(e.target.value);
          }
        }}
        placeholder={schema.type === "array" ? '["item1", "item2"]' : '{"key": "value"}'}
        className={cn(baseClass, "font-mono min-h-[80px]")}
        rows={3}
      />
    );
  }

  // Default: string input
  return (
    <input
      type="text"
      value={(value as string) ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      placeholder={schema.default !== undefined ? `Default: ${schema.default}` : undefined}
      className={baseClass}
    />
  );
}
