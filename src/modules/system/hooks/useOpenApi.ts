// src/modules/system/hooks/useOpenApi.ts
// Fetch OpenAPI spec from tv-api

import { useQuery } from "@tanstack/react-query";

// OpenAPI types (subset of OpenAPI 3.0 spec)
interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: {
    url: string;
    description?: string;
  }[];
  paths: Record<string, OpenApiPathItem>;
  components?: {
    securitySchemes?: Record<string, OpenApiSecurityScheme>;
  };
}

interface OpenApiPathItem {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  delete?: OpenApiOperation;
}

interface OpenApiOperation {
  summary?: string;
  description?: string;
  tags?: string[];
  security?: Record<string, string[]>[];
  requestBody?: {
    required?: boolean;
    content?: {
      "application/json"?: {
        schema?: OpenApiSchema;
      };
    };
  };
  responses?: Record<string, OpenApiResponse>;
}

interface OpenApiResponse {
  description?: string;
  content?: {
    "application/json"?: {
      schema?: OpenApiSchema;
    };
  };
}

interface OpenApiSchema {
  type?: string;
  properties?: Record<string, OpenApiSchemaProperty>;
  required?: string[];
  items?: OpenApiSchema;
  example?: unknown;
}

interface OpenApiSchemaProperty {
  type?: string;
  description?: string;
  example?: unknown;
  enum?: string[];
  default?: unknown;
}

interface OpenApiSecurityScheme {
  type: string;
  scheme?: string;
  description?: string;
}

// Transformed API endpoint for our UI
export interface ApiEndpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  description: string;
  parameters?: {
    name: string;
    type: string;
    required: boolean;
    description: string;
    location: "query" | "body" | "path";
    enum?: string[];
    default?: unknown;
    example?: unknown;
  }[];
  exampleBody?: Record<string, unknown>;
  requiresAuth: boolean;
}

// Get base URL from localStorage or default
const API_BASE_URL_KEY = "tv-client-api-base-url";

function getBaseUrl(): string {
  return localStorage.getItem(API_BASE_URL_KEY) || "http://localhost:3000";
}

// Fetch OpenAPI spec
async function fetchOpenApiSpec(): Promise<OpenApiSpec> {
  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}/api/v1/openapi`);

  if (!response.ok) {
    throw new Error(`Failed to fetch OpenAPI spec: ${response.statusText}`);
  }

  return response.json();
}

// Transform OpenAPI spec to our ApiEndpoint format
function transformSpec(spec: OpenApiSpec): ApiEndpoint[] {
  const endpoints: ApiEndpoint[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    const methods = ["get", "post", "put", "delete"] as const;

    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;

      // Check if auth required
      const requiresAuth = Boolean(
        operation.security && operation.security.length > 0
      );

      // Extract parameters from requestBody
      const parameters: ApiEndpoint["parameters"] = [];
      let exampleBody: Record<string, unknown> | undefined;

      if (operation.requestBody?.content?.["application/json"]?.schema) {
        const schema = operation.requestBody.content["application/json"].schema;
        const required = schema.required || [];

        if (schema.properties) {
          exampleBody = {};

          for (const [propName, prop] of Object.entries(schema.properties)) {
            parameters.push({
              name: propName,
              type: prop.type || "string",
              required: required.includes(propName),
              description: prop.description || "",
              location: "body",
              enum: prop.enum,
              default: prop.default,
              example: prop.example,
            });

            // Build example body
            if (prop.example !== undefined) {
              exampleBody[propName] = prop.example;
            } else if (prop.default !== undefined) {
              exampleBody[propName] = prop.default;
            }
          }
        }
      }

      endpoints.push({
        method: method.toUpperCase() as ApiEndpoint["method"],
        path,
        description: operation.description || operation.summary || "",
        parameters: parameters.length > 0 ? parameters : undefined,
        exampleBody: exampleBody && Object.keys(exampleBody).length > 0 ? exampleBody : undefined,
        requiresAuth,
      });
    }
  }

  return endpoints;
}

// React Query hook
export function useOpenApi() {
  return useQuery({
    queryKey: ["openapi-spec"],
    queryFn: fetchOpenApiSpec,
    select: transformSpec,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });
}

// Also export the raw spec hook if needed
export function useOpenApiSpec() {
  return useQuery({
    queryKey: ["openapi-spec"],
    queryFn: fetchOpenApiSpec,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}
