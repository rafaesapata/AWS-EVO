/**
 * OpenAPI Documentation Generator from Zod Schemas
 * Automatically generates OpenAPI 3.0 spec from centralized Zod schemas
 *
 * Features:
 * - Converts Zod schemas to OpenAPI JSON Schema
 * - Generates endpoint documentation
 * - Supports authentication and security schemes
 */
interface OpenAPISchema {
    type?: string;
    format?: string;
    properties?: Record<string, OpenAPISchema>;
    required?: string[];
    items?: OpenAPISchema;
    enum?: string[];
    description?: string;
    default?: any;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    oneOf?: OpenAPISchema[];
}
interface OpenAPIParameter {
    name: string;
    in: 'query' | 'header' | 'path' | 'cookie';
    required?: boolean;
    schema: OpenAPISchema;
    description?: string;
}
interface OpenAPIRequestBody {
    required?: boolean;
    content: {
        'application/json': {
            schema: OpenAPISchema;
        };
    };
}
interface OpenAPIResponse {
    description: string;
    content?: {
        'application/json': {
            schema: OpenAPISchema;
        };
    };
}
interface OpenAPIOperation {
    summary: string;
    description?: string;
    operationId: string;
    tags?: string[];
    security?: Array<Record<string, string[]>>;
    parameters?: OpenAPIParameter[];
    requestBody?: OpenAPIRequestBody;
    responses: Record<string, OpenAPIResponse>;
}
interface OpenAPIPath {
    get?: OpenAPIOperation;
    post?: OpenAPIOperation;
    put?: OpenAPIOperation;
    delete?: OpenAPIOperation;
    options?: OpenAPIOperation;
}
interface OpenAPISpec {
    openapi: string;
    info: {
        title: string;
        version: string;
        description?: string;
    };
    servers: Array<{
        url: string;
        description?: string;
    }>;
    paths: Record<string, OpenAPIPath>;
    components: {
        schemas: Record<string, OpenAPISchema>;
        securitySchemes: Record<string, any>;
    };
    tags?: Array<{
        name: string;
        description?: string;
    }>;
}
export declare function generateOpenAPISpec(): OpenAPISpec;
/**
 * Export OpenAPI spec as JSON string
 */
export declare function getOpenAPIJSON(): string;
/**
 * Export OpenAPI spec as YAML string (basic conversion)
 */
export declare function getOpenAPIYAML(): string;
export {};
//# sourceMappingURL=openapi-generator.d.ts.map