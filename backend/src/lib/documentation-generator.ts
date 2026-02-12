/**
 * Comprehensive Documentation Generator
 * Automatically generates API documentation, code documentation, and system guides
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from './logger.js';

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
export abstract class DocumentationGenerator {
  protected config: DocumentationConfig;

  constructor(config: DocumentationConfig) {
    this.config = config;
  }

  abstract generate(): Promise<void>;

  protected async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.config.outputDir, filePath);
    const dir = path.dirname(fullPath);
    
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    
    logger.debug('Documentation file written', { filePath: fullPath });
  }

  protected getTemplate(templateName: string): string {
    // In a real implementation, this would load templates from files
    return this.getDefaultTemplate(templateName);
  }

  private getDefaultTemplate(templateName: string): string {
    const templates: Record<string, string> = {
      'api-html': `
<!DOCTYPE html>
<html>
<head>
    <title>{{title}}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .endpoint { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .method { display: inline-block; padding: 5px 10px; border-radius: 3px; color: white; font-weight: bold; }
        .get { background-color: #61affe; }
        .post { background-color: #49cc90; }
        .put { background-color: #fca130; }
        .delete { background-color: #f93e3e; }
        .parameters { margin: 10px 0; }
        .parameter { margin: 5px 0; padding: 5px; background: #f9f9f9; }
        .example { background: #f5f5f5; padding: 10px; border-radius: 3px; margin: 10px 0; }
        pre { background: #2d3748; color: #e2e8f0; padding: 15px; border-radius: 5px; overflow-x: auto; }
    </style>
</head>
<body>
    <h1>{{title}}</h1>
    <p>{{description}}</p>
    {{content}}
</body>
</html>
      `,
      
      'api-markdown': `
# {{title}}

{{description}}

{{content}}
      `,
      
      'code-html': `
<!DOCTYPE html>
<html>
<head>
    <title>{{title}} - Code Documentation</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
        .class, .function, .interface { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .signature { background: #f5f5f5; padding: 10px; border-radius: 3px; font-family: monospace; }
        .parameters { margin: 10px 0; }
        .parameter { margin: 5px 0; }
        .example { background: #f9f9f9; padding: 10px; border-radius: 3px; margin: 10px 0; }
        pre { background: #2d3748; color: #e2e8f0; padding: 15px; border-radius: 5px; overflow-x: auto; }
        .deprecated { opacity: 0.7; text-decoration: line-through; }
        .private { color: #666; }
    </style>
</head>
<body>
    <h1>{{title}}</h1>
    {{content}}
</body>
</html>
      `,
    };

    return templates[templateName] || '';
  }

  protected replaceTemplateVariables(template: string, variables: Record<string, string>): string {
    let result = template;
    
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    
    return result;
  }
}

/**
 * API Documentation Generator
 */
export class APIDocumentationGenerator extends DocumentationGenerator {
  private endpoints: APIEndpoint[] = [];

  addEndpoint(endpoint: APIEndpoint): void {
    this.endpoints.push(endpoint);
  }

  addEndpoints(endpoints: APIEndpoint[]): void {
    this.endpoints.push(...endpoints);
  }

  async generate(): Promise<void> {
    logger.info('Generating API documentation', {
      endpointCount: this.endpoints.length,
      formats: this.config.formats,
    });

    for (const format of this.config.formats) {
      switch (format) {
        case 'html':
          await this.generateHTML();
          break;
        case 'markdown':
          await this.generateMarkdown();
          break;
        case 'openapi':
          await this.generateOpenAPI();
          break;
        case 'json':
          await this.generateJSON();
          break;
      }
    }
  }

  private async generateHTML(): Promise<void> {
    const template = this.getTemplate('api-html');
    const content = this.endpoints.map(endpoint => this.renderEndpointHTML(endpoint)).join('\n');
    
    const html = this.replaceTemplateVariables(template, {
      title: 'EVO Platform API Documentation',
      description: 'Comprehensive API documentation for the EVO Platform system',
      content,
    });

    await this.writeFile('api/index.html', html);
  }

  private renderEndpointHTML(endpoint: APIEndpoint): string {
    const methodClass = endpoint.method.toLowerCase();
    
    return `
<div class="endpoint">
    <h2>
        <span class="method ${methodClass}">${endpoint.method.toUpperCase()}</span>
        ${endpoint.path}
    </h2>
    <p>${endpoint.description}</p>
    
    ${endpoint.parameters.length > 0 ? `
    <h3>Parameters</h3>
    <div class="parameters">
        ${endpoint.parameters.map(param => `
        <div class="parameter">
            <strong>${param.name}</strong> (${param.in}) - ${param.schema.type}
            ${param.required ? '<em>required</em>' : '<em>optional</em>'}
            <br>${param.description}
            ${param.example ? `<br><em>Example:</em> <code>${JSON.stringify(param.example)}</code>` : ''}
        </div>
        `).join('')}
    </div>
    ` : ''}
    
    ${endpoint.requestBody ? `
    <h3>Request Body</h3>
    <p>${endpoint.requestBody.description}</p>
    <pre><code>${JSON.stringify(endpoint.requestBody.content, null, 2)}</code></pre>
    ` : ''}
    
    <h3>Responses</h3>
    ${endpoint.responses.map(response => `
    <div class="response">
        <h4>${response.statusCode} - ${response.description}</h4>
        ${response.content ? `<pre><code>${JSON.stringify(response.content, null, 2)}</code></pre>` : ''}
    </div>
    `).join('')}
    
    ${endpoint.examples.length > 0 ? `
    <h3>Examples</h3>
    ${endpoint.examples.map(example => `
    <div class="example">
        <h4>${example.summary}</h4>
        <p>${example.description}</p>
        <pre><code>${JSON.stringify(example.value, null, 2)}</code></pre>
    </div>
    `).join('')}
    ` : ''}
</div>
    `.trim();
  }

  private async generateMarkdown(): Promise<void> {
    const template = this.getTemplate('api-markdown');
    const content = this.endpoints.map(endpoint => this.renderEndpointMarkdown(endpoint)).join('\n\n');
    
    const markdown = this.replaceTemplateVariables(template, {
      title: 'EVO Platform API Documentation',
      description: 'Comprehensive API documentation for the EVO Platform system',
      content,
    });

    await this.writeFile('api/README.md', markdown);
  }

  private renderEndpointMarkdown(endpoint: APIEndpoint): string {
    return `
## ${endpoint.method.toUpperCase()} ${endpoint.path}

${endpoint.description}

${endpoint.parameters.length > 0 ? `
### Parameters

${endpoint.parameters.map(param => `
- **${param.name}** (${param.in}) - ${param.schema.type} ${param.required ? '*(required)*' : '*(optional)*'}
  
  ${param.description}
  ${param.example ? `\n  Example: \`${JSON.stringify(param.example)}\`` : ''}
`).join('')}
` : ''}

${endpoint.requestBody ? `
### Request Body

${endpoint.requestBody.description}

\`\`\`json
${JSON.stringify(endpoint.requestBody.content, null, 2)}
\`\`\`
` : ''}

### Responses

${endpoint.responses.map(response => `
#### ${response.statusCode} - ${response.description}

${response.content ? `\`\`\`json\n${JSON.stringify(response.content, null, 2)}\n\`\`\`` : ''}
`).join('')}

${endpoint.examples.length > 0 ? `
### Examples

${endpoint.examples.map(example => `
#### ${example.summary}

${example.description}

\`\`\`json
${JSON.stringify(example.value, null, 2)}
\`\`\`
`).join('')}
` : ''}
    `.trim();
  }

  private async generateOpenAPI(): Promise<void> {
    const openApiSpec = {
      openapi: '3.0.3',
      info: {
        title: 'EVO Platform API',
        description: 'Comprehensive API for the EVO Platform system',
        version: '1.0.0',
        contact: {
          name: 'EVO Platform Team',
          email: 'api@evo-platform.com',
        },
      },
      servers: [
        {
          url: 'https://api.evo-platform.com/v1',
          description: 'Production server',
        },
        {
          url: 'https://staging-api.evo-platform.com/v1',
          description: 'Staging server',
        },
      ],
      paths: this.generateOpenAPIPaths(),
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    };

    await this.writeFile('api/openapi.json', JSON.stringify(openApiSpec, null, 2));
  }

  private generateOpenAPIPaths(): Record<string, any> {
    const paths: Record<string, any> = {};

    for (const endpoint of this.endpoints) {
      if (!paths[endpoint.path]) {
        paths[endpoint.path] = {};
      }

      paths[endpoint.path][endpoint.method.toLowerCase()] = {
        summary: endpoint.summary,
        description: endpoint.description,
        tags: endpoint.tags,
        parameters: endpoint.parameters.map(param => ({
          name: param.name,
          in: param.in,
          required: param.required,
          schema: param.schema,
          description: param.description,
          example: param.example,
        })),
        requestBody: endpoint.requestBody,
        responses: endpoint.responses.reduce((acc, response) => {
          acc[response.statusCode] = {
            description: response.description,
            content: response.content,
            headers: response.headers,
          };
          return acc;
        }, {} as Record<string, any>),
        security: endpoint.security,
      };
    }

    return paths;
  }

  private async generateJSON(): Promise<void> {
    const apiDoc = {
      title: 'EVO Platform API Documentation',
      description: 'Comprehensive API documentation for the EVO Platform system',
      version: '1.0.0',
      endpoints: this.endpoints,
      generatedAt: new Date().toISOString(),
    };

    await this.writeFile('api/api-documentation.json', JSON.stringify(apiDoc, null, 2));
  }
}

/**
 * Code Documentation Generator
 */
export class CodeDocumentationGenerator extends DocumentationGenerator {
  private codeDocumentation: CodeDocumentation[] = [];

  addCodeDocumentation(doc: CodeDocumentation): void {
    this.codeDocumentation.push(doc);
  }

  async generate(): Promise<void> {
    logger.info('Generating code documentation', {
      fileCount: this.codeDocumentation.length,
      formats: this.config.formats,
    });

    for (const format of this.config.formats) {
      switch (format) {
        case 'html':
          await this.generateHTML();
          break;
        case 'markdown':
          await this.generateMarkdown();
          break;
        case 'json':
          await this.generateJSON();
          break;
      }
    }
  }

  private async generateHTML(): Promise<void> {
    const template = this.getTemplate('code-html');
    
    for (const fileDoc of this.codeDocumentation) {
      const content = this.renderFileDocumentationHTML(fileDoc);
      const html = this.replaceTemplateVariables(template, {
        title: path.basename(fileDoc.file),
        content,
      });

      const outputPath = `code/${fileDoc.file.replace(/\.[^/.]+$/, '.html')}`;
      await this.writeFile(outputPath, html);
    }

    // Generate index
    await this.generateCodeIndex();
  }

  private renderFileDocumentationHTML(fileDoc: CodeDocumentation): string {
    let content = `<h2>File: ${fileDoc.file}</h2>\n`;

    // Classes
    if (fileDoc.classes.length > 0) {
      content += '<h3>Classes</h3>\n';
      for (const classDoc of fileDoc.classes) {
        content += this.renderClassHTML(classDoc);
      }
    }

    // Functions
    if (fileDoc.functions.length > 0) {
      content += '<h3>Functions</h3>\n';
      for (const funcDoc of fileDoc.functions) {
        content += this.renderFunctionHTML(funcDoc);
      }
    }

    // Interfaces
    if (fileDoc.interfaces.length > 0) {
      content += '<h3>Interfaces</h3>\n';
      for (const interfaceDoc of fileDoc.interfaces) {
        content += this.renderInterfaceHTML(interfaceDoc);
      }
    }

    return content;
  }

  private renderClassHTML(classDoc: ClassDocumentation): string {
    const deprecatedClass = classDoc.deprecated ? 'deprecated' : '';
    
    return `
<div class="class ${deprecatedClass}">
    <h4>${classDoc.name}</h4>
    <div class="signature">
        class ${classDoc.name}${classDoc.extends ? ` extends ${classDoc.extends}` : ''}${classDoc.implements ? ` implements ${classDoc.implements.join(', ')}` : ''}
    </div>
    <p>${classDoc.description}</p>
    
    ${classDoc.properties.length > 0 ? `
    <h5>Properties</h5>
    ${classDoc.properties.map(prop => this.renderPropertyHTML(prop)).join('')}
    ` : ''}
    
    ${classDoc.methods.length > 0 ? `
    <h5>Methods</h5>
    ${classDoc.methods.map(method => this.renderMethodHTML(method)).join('')}
    ` : ''}
    
    ${classDoc.examples.length > 0 ? `
    <h5>Examples</h5>
    ${classDoc.examples.map(example => this.renderExampleHTML(example)).join('')}
    ` : ''}
</div>
    `;
  }

  private renderFunctionHTML(funcDoc: FunctionDocumentation): string {
    const deprecatedClass = funcDoc.deprecated ? 'deprecated' : '';
    
    return `
<div class="function ${deprecatedClass}">
    <h4>${funcDoc.name}</h4>
    <div class="signature">
        function ${funcDoc.name}(${funcDoc.parameters.map(p => `${p.name}: ${p.type}`).join(', ')}): ${funcDoc.returns.type}
    </div>
    <p>${funcDoc.description}</p>
    
    ${funcDoc.parameters.length > 0 ? `
    <h5>Parameters</h5>
    ${funcDoc.parameters.map(param => this.renderParameterHTML(param)).join('')}
    ` : ''}
    
    <h5>Returns</h5>
    <p>${funcDoc.returns.description} (${funcDoc.returns.type})</p>
    
    ${funcDoc.examples.length > 0 ? `
    <h5>Examples</h5>
    ${funcDoc.examples.map(example => this.renderExampleHTML(example)).join('')}
    ` : ''}
</div>
    `;
  }

  private renderInterfaceHTML(interfaceDoc: InterfaceDocumentation): string {
    return `
<div class="interface">
    <h4>${interfaceDoc.name}</h4>
    <div class="signature">
        interface ${interfaceDoc.name}${interfaceDoc.extends ? ` extends ${interfaceDoc.extends.join(', ')}` : ''}
    </div>
    <p>${interfaceDoc.description}</p>
    
    ${interfaceDoc.properties.length > 0 ? `
    <h5>Properties</h5>
    ${interfaceDoc.properties.map(prop => this.renderPropertyHTML(prop)).join('')}
    ` : ''}
</div>
    `;
  }

  private renderPropertyHTML(prop: PropertyDocumentation): string {
    const modifiers = [
      prop.static ? 'static' : '',
      prop.readonly ? 'readonly' : '',
      prop.private ? 'private' : prop.protected ? 'protected' : 'public',
    ].filter(Boolean).join(' ');

    return `
<div class="parameter">
    <strong>${prop.name}</strong>: ${prop.type} ${prop.optional ? '(optional)' : ''}
    <br><em>${modifiers}</em>
    <br>${prop.description}
</div>
    `;
  }

  private renderMethodHTML(method: MethodDocumentation): string {
    const modifiers = [
      method.static ? 'static' : '',
      method.async ? 'async' : '',
      method.private ? 'private' : method.protected ? 'protected' : 'public',
    ].filter(Boolean).join(' ');

    return `
<div class="method">
    <strong>${method.name}</strong>(${method.parameters.map(p => `${p.name}: ${p.type}`).join(', ')}): ${method.returns.type}
    <br><em>${modifiers}</em>
    <br>${method.description}
</div>
    `;
  }

  private renderParameterHTML(param: ParameterDocumentation): string {
    return `
<div class="parameter">
    <strong>${param.name}</strong>: ${param.type} ${param.optional ? '(optional)' : ''}
    ${param.defaultValue !== undefined ? `<em>Default: ${JSON.stringify(param.defaultValue)}</em>` : ''}
    <br>${param.description}
</div>
    `;
  }

  private renderExampleHTML(example: CodeExample): string {
    return `
<div class="example">
    <h6>${example.title}</h6>
    <p>${example.description}</p>
    <pre><code class="${example.language}">${example.code}</code></pre>
</div>
    `;
  }

  private async generateCodeIndex(): Promise<void> {
    const indexContent = `
<h1>Code Documentation Index</h1>
<ul>
${this.codeDocumentation.map(doc => `
    <li><a href="${doc.file.replace(/\.[^/.]+$/, '.html')}">${doc.file}</a></li>
`).join('')}
</ul>
    `;

    const template = this.getTemplate('code-html');
    const html = this.replaceTemplateVariables(template, {
      title: 'Code Documentation',
      content: indexContent,
    });

    await this.writeFile('code/index.html', html);
  }

  private async generateMarkdown(): Promise<void> {
    for (const fileDoc of this.codeDocumentation) {
      const content = this.renderFileDocumentationMarkdown(fileDoc);
      const outputPath = `code/${fileDoc.file.replace(/\.[^/.]+$/, '.md')}`;
      await this.writeFile(outputPath, content);
    }
  }

  private renderFileDocumentationMarkdown(fileDoc: CodeDocumentation): string {
    let content = `# ${fileDoc.file}\n\n`;

    // Classes
    if (fileDoc.classes.length > 0) {
      content += '## Classes\n\n';
      for (const classDoc of fileDoc.classes) {
        content += this.renderClassMarkdown(classDoc);
      }
    }

    // Functions
    if (fileDoc.functions.length > 0) {
      content += '## Functions\n\n';
      for (const funcDoc of fileDoc.functions) {
        content += this.renderFunctionMarkdown(funcDoc);
      }
    }

    return content;
  }

  private renderClassMarkdown(classDoc: ClassDocumentation): string {
    return `
### ${classDoc.name}${classDoc.deprecated ? ' *(deprecated)*' : ''}

\`\`\`typescript
class ${classDoc.name}${classDoc.extends ? ` extends ${classDoc.extends}` : ''}${classDoc.implements ? ` implements ${classDoc.implements.join(', ')}` : ''}
\`\`\`

${classDoc.description}

${classDoc.examples.length > 0 ? `
#### Examples

${classDoc.examples.map(example => `
##### ${example.title}

${example.description}

\`\`\`${example.language}
${example.code}
\`\`\`
`).join('')}
` : ''}
    `;
  }

  private renderFunctionMarkdown(funcDoc: FunctionDocumentation): string {
    return `
### ${funcDoc.name}${funcDoc.deprecated ? ' *(deprecated)*' : ''}

\`\`\`typescript
function ${funcDoc.name}(${funcDoc.parameters.map(p => `${p.name}: ${p.type}`).join(', ')}): ${funcDoc.returns.type}
\`\`\`

${funcDoc.description}

${funcDoc.parameters.length > 0 ? `
#### Parameters

${funcDoc.parameters.map(param => `
- **${param.name}**: ${param.type} ${param.optional ? '*(optional)*' : ''}
  
  ${param.description}
`).join('')}
` : ''}

#### Returns

${funcDoc.returns.description} (${funcDoc.returns.type})

${funcDoc.examples.length > 0 ? `
#### Examples

${funcDoc.examples.map(example => `
##### ${example.title}

${example.description}

\`\`\`${example.language}
${example.code}
\`\`\`
`).join('')}
` : ''}
    `;
  }

  private async generateJSON(): Promise<void> {
    const codeDoc = {
      title: 'EVO Platform Code Documentation',
      description: 'Comprehensive code documentation for the EVO Platform system',
      files: this.codeDocumentation,
      generatedAt: new Date().toISOString(),
    };

    await this.writeFile('code/code-documentation.json', JSON.stringify(codeDoc, null, 2));
  }
}

/**
 * Documentation Manager - Orchestrates all documentation generators
 */
export class DocumentationManager {
  private config: DocumentationConfig;
  private generators: Map<string, DocumentationGenerator> = new Map();

  constructor(config: DocumentationConfig) {
    this.config = config;
    this.initializeGenerators();
  }

  private initializeGenerators(): void {
    for (const section of this.config.sections) {
      if (section.enabled) {
        this.generators.set(section.id, section.generator);
      }
    }
  }

  async generateAll(): Promise<void> {
    logger.info('Starting documentation generation', {
      sections: this.config.sections.filter(s => s.enabled).map(s => s.id),
      formats: this.config.formats,
      outputDir: this.config.outputDir,
    });

    // Create output directory
    await fs.mkdir(this.config.outputDir, { recursive: true });

    // Generate documentation for each section
    for (const [sectionId, generator] of this.generators) {
      try {
        logger.info('Generating documentation section', { sectionId });
        await generator.generate();
        logger.info('Documentation section completed', { sectionId });
      } catch (error) {
        logger.error('Documentation section failed', error as Error, { sectionId });
      }
    }

    // Generate main index
    await this.generateMainIndex();

    logger.info('Documentation generation completed', {
      outputDir: this.config.outputDir,
    });
  }

  private async generateMainIndex(): Promise<void> {
    const indexContent = `
<!DOCTYPE html>
<html>
<head>
    <title>EVO Platform Documentation</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .section { margin: 20px 0; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
        .section h2 { margin-top: 0; }
        .links { margin: 10px 0; }
        .links a { margin-right: 15px; padding: 5px 10px; background: #007cba; color: white; text-decoration: none; border-radius: 3px; }
        .links a:hover { background: #005a87; }
    </style>
</head>
<body>
    <h1>EVO Platform Documentation</h1>
    <p>Welcome to the comprehensive documentation for the EVO Platform system.</p>
    
    ${this.config.sections.filter(s => s.enabled).map(section => `
    <div class="section">
        <h2>${section.title}</h2>
        <p>${section.description}</p>
        <div class="links">
            ${this.config.formats.map(format => {
              const extension = format === 'html' ? 'html' : format === 'markdown' ? 'md' : format;
              return `<a href="${section.id}/index.${extension}">${format.toUpperCase()}</a>`;
            }).join('')}
        </div>
    </div>
    `).join('')}
</body>
</html>
    `;

    await this.writeFile('index.html', indexContent);
  }

  private async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.config.outputDir, filePath);
    const dir = path.dirname(fullPath);
    
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }
}

// Default documentation configuration
export const DEFAULT_DOCUMENTATION_CONFIG: DocumentationConfig = {
  outputDir: './docs',
  formats: ['html', 'markdown'],
  includePrivate: false,
  includeInternal: false,
  theme: 'default',
  language: 'en',
  sections: [
    {
      id: 'api',
      title: 'API Documentation',
      description: 'REST API endpoints and specifications',
      order: 1,
      enabled: true,
      generator: new APIDocumentationGenerator({} as DocumentationConfig),
    },
    {
      id: 'code',
      title: 'Code Documentation',
      description: 'Classes, functions, and interfaces',
      order: 2,
      enabled: true,
      generator: new CodeDocumentationGenerator({} as DocumentationConfig),
    },
  ],
};

// Global documentation manager
export const documentationManager = new DocumentationManager(DEFAULT_DOCUMENTATION_CONFIG);