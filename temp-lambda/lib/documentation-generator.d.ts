/**
 * Comprehensive Documentation Generator
 * Automatically generates API documentation, code documentation, and system guides
 */
export interface DocumentationConfig {
    outputDir: string;
    formats: DocumentationFormat[];
    includePrivate: boolean;
    includeInternal: boolean;
    theme: 'default' | 'dark' | 'minimal';
    language: 'en' | 'pt' | 'es';
    sections: DocumentationSection[];
}
export type DocumentationFormat = 'html' | 'markdown' | 'pdf' | 'json' | 'openapi';
export interface DocumentationSection {
    id: string;
    title: string;
    description: string;
    order: number;
    enabled: boolean;
    generator: DocumentationGenerator;
}
export interface APIEndpoint {
    path: string;
    method: string;
    summary: string;
    description: string;
    parameters: APIParameter[];
    requestBody?: APIRequestBody;
    responses: APIResponse[];
    tags: string[];
    security?: SecurityRequirement[];
    examples: APIExample[];
}
export interface APIParameter {
    name: string;
    in: 'path' | 'query' | 'header' | 'cookie';
    required: boolean;
    schema: JSONSchema;
    description: string;
    example?: any;
}
export interface APIRequestBody {
    description: string;
    required: boolean;
    content: Record<string, MediaType>;
}
export interface APIResponse {
    statusCode: number;
    description: string;
    content?: Record<string, MediaType>;
    headers?: Record<string, APIParameter>;
}
export interface MediaType {
    schema: JSONSchema;
    examples?: Record<string, APIExample>;
}
export interface JSONSchema {
    type: string;
    properties?: Record<string, JSONSchema>;
    items?: JSONSchema;
    required?: string[];
    enum?: any[];
    format?: string;
    description?: string;
    example?: any;
}
export interface APIExample {
    summary: string;
    description: string;
    value: any;
}
export interface SecurityRequirement {
    type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
    name: string;
    in?: 'header' | 'query' | 'cookie';
    scheme?: string;
    bearerFormat?: string;
}
export interface CodeDocumentation {
    file: string;
    classes: ClassDocumentation[];
    functions: FunctionDocumentation[];
    interfaces: InterfaceDocumentation[];
    types: TypeDocumentation[];
    constants: ConstantDocumentation[];
}
export interface ClassDocumentation {
    name: string;
    description: string;
    extends?: string;
    implements?: string[];
    properties: PropertyDocumentation[];
    methods: MethodDocumentation[];
    examples: CodeExample[];
    since?: string;
    deprecated?: boolean;
}
export interface FunctionDocumentation {
    name: string;
    description: string;
    parameters: ParameterDocumentation[];
    returns: ReturnDocumentation;
    throws?: ThrowsDocumentation[];
    examples: CodeExample[];
    since?: string;
    deprecated?: boolean;
}
export interface InterfaceDocumentation {
    name: string;
    description: string;
    extends?: string[];
    properties: PropertyDocumentation[];
    methods: MethodDocumentation[];
    examples: CodeExample[];
}
export interface TypeDocumentation {
    name: string;
    description: string;
    type: string;
    examples: CodeExample[];
}
export interface ConstantDocumentation {
    name: string;
    description: string;
    type: string;
    value: any;
}
export interface PropertyDocumentation {
    name: string;
    description: string;
    type: string;
    optional: boolean;
    readonly: boolean;
    static: boolean;
    private: boolean;
    protected: boolean;
}
export interface MethodDocumentation {
    name: string;
    description: string;
    parameters: ParameterDocumentation[];
    returns: ReturnDocumentation;
    throws?: ThrowsDocumentation[];
    static: boolean;
    private: boolean;
    protected: boolean;
    async: boolean;
}
export interface ParameterDocumentation {
    name: string;
    description: string;
    type: string;
    optional: boolean;
    defaultValue?: any;
}
export interface ReturnDocumentation {
    description: string;
    type: string;
}
export interface ThrowsDocumentation {
    type: string;
    description: string;
}
export interface CodeExample {
    title: string;
    description: string;
    code: string;
    language: string;
}
/**
 * Abstract Documentation Generator
 */
export declare abstract class DocumentationGenerator {
    protected config: DocumentationConfig;
    constructor(config: DocumentationConfig);
    abstract generate(): Promise<void>;
    protected writeFile(filePath: string, content: string): Promise<void>;
    protected getTemplate(templateName: string): string;
    private getDefaultTemplate;
    protected replaceTemplateVariables(template: string, variables: Record<string, string>): string;
}
/**
 * API Documentation Generator
 */
export declare class APIDocumentationGenerator extends DocumentationGenerator {
    private endpoints;
    addEndpoint(endpoint: APIEndpoint): void;
    addEndpoints(endpoints: APIEndpoint[]): void;
    generate(): Promise<void>;
    private generateHTML;
    private renderEndpointHTML;
    private generateMarkdown;
    private renderEndpointMarkdown;
    private generateOpenAPI;
    private generateOpenAPIPaths;
    private generateJSON;
}
/**
 * Code Documentation Generator
 */
export declare class CodeDocumentationGenerator extends DocumentationGenerator {
    private codeDocumentation;
    addCodeDocumentation(doc: CodeDocumentation): void;
    generate(): Promise<void>;
    private generateHTML;
    private renderFileDocumentationHTML;
    private renderClassHTML;
    private renderFunctionHTML;
    private renderInterfaceHTML;
    private renderPropertyHTML;
    private renderMethodHTML;
    private renderParameterHTML;
    private renderExampleHTML;
    private generateCodeIndex;
    private generateMarkdown;
    private renderFileDocumentationMarkdown;
    private renderClassMarkdown;
    private renderFunctionMarkdown;
    private generateJSON;
}
/**
 * Documentation Manager - Orchestrates all documentation generators
 */
export declare class DocumentationManager {
    private config;
    private generators;
    constructor(config: DocumentationConfig);
    private initializeGenerators;
    generateAll(): Promise<void>;
    private generateMainIndex;
    private writeFile;
}
export declare const DEFAULT_DOCUMENTATION_CONFIG: DocumentationConfig;
export declare const documentationManager: DocumentationManager;
//# sourceMappingURL=documentation-generator.d.ts.map