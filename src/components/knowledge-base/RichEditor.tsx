import { useState, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bold, Italic, List, ListOrdered, Link2, Code, Eye, FileCode, Heading1, Heading2, Heading3, Quote, Image, Strikethrough, Table } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// XSS Prevention: Disallow dangerous HTML elements
const MARKDOWN_DISALLOWED_ELEMENTS = ['script', 'iframe', 'object', 'embed', 'link', 'style'];

interface RichEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function RichEditor({ value, onChange, placeholder }: RichEditorProps) {
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertMarkdown = (before: string, after: string = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);
    const newText = value.substring(0, start) + before + selectedText + after + value.substring(end);
    
    onChange(newText);
    
    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length);
    }, 0);
  };

  const insertAtLineStart = (prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const newText = value.substring(0, lineStart) + prefix + value.substring(lineStart);
    onChange(newText);
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length);
    }, 0);
  };

  return (
    <div className="space-y-2">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "edit" | "preview")}>
        <div className="flex items-center justify-between border border-border rounded-lg bg-muted/30 p-2">
          <div className="flex items-center gap-0.5 flex-wrap">
            {/* Text Formatting */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertMarkdown("**", "**")}
              title="Negrito (Ctrl+B)"
              className="h-8 w-8 p-0"
            >
              <Bold className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertMarkdown("_", "_")}
              title="Itálico (Ctrl+I)"
              className="h-8 w-8 p-0"
            >
              <Italic className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertMarkdown("~~", "~~")}
              title="Tachado"
              className="h-8 w-8 p-0"
            >
              <Strikethrough className="h-4 w-4" />
            </Button>
            
            <Separator orientation="vertical" className="mx-1 h-6" />
            
            {/* Headings */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertAtLineStart("# ")}
              title="Título 1"
              className="h-8 w-8 p-0"
            >
              <Heading1 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertAtLineStart("## ")}
              title="Título 2"
              className="h-8 w-8 p-0"
            >
              <Heading2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertAtLineStart("### ")}
              title="Título 3"
              className="h-8 w-8 p-0"
            >
              <Heading3 className="h-4 w-4" />
            </Button>
            
            <Separator orientation="vertical" className="mx-1 h-6" />
            
            {/* Lists */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertAtLineStart("- ")}
              title="Lista não ordenada"
              className="h-8 w-8 p-0"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertAtLineStart("1. ")}
              title="Lista ordenada"
              className="h-8 w-8 p-0"
            >
              <ListOrdered className="h-4 w-4" />
            </Button>
            
            <Separator orientation="vertical" className="mx-1 h-6" />
            
            {/* Insert Elements */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertMarkdown("[texto do link](", ")")}
              title="Inserir Link"
              className="h-8 w-8 p-0"
            >
              <Link2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertMarkdown("![alt text](", ")")}
              title="Inserir Imagem"
              className="h-8 w-8 p-0"
            >
              <Image className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertAtLineStart("> ")}
              title="Citação"
              className="h-8 w-8 p-0"
            >
              <Quote className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertMarkdown("`", "`")}
              title="Código inline"
              className="h-8 w-8 p-0"
            >
              <Code className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertMarkdown("```\n", "\n```")}
              title="Bloco de código"
              className="h-8 w-8 p-0"
            >
              <FileCode className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => insertMarkdown("\n| Coluna 1 | Coluna 2 |\n|----------|----------|\n| ", " |  |\n")}
              title="Inserir Tabela"
              className="h-8 w-8 p-0"
            >
              <Table className="h-4 w-4" />
            </Button>
          </div>
          
          <TabsList className="h-8">
            <TabsTrigger value="edit" className="text-xs">
              <FileCode className="h-3 w-3 mr-1" />
              Editar
            </TabsTrigger>
            <TabsTrigger value="preview" className="text-xs">
              <Eye className="h-3 w-3 mr-1" />
              Visualizar
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="edit" className="mt-2">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || "Digite seu conteúdo usando Markdown...\n\nDica: Use a barra de ferramentas acima para formatar seu texto!"}
            className="min-h-[500px] font-mono text-sm resize-y"
          />
        </TabsContent>

        <TabsContent value="preview" className="mt-2">
          <Card className="min-h-[500px] p-6 prose prose-sm max-w-none dark:prose-invert overflow-auto">
            {value ? (
              <ReactMarkdown disallowedElements={MARKDOWN_DISALLOWED_ELEMENTS}>{value}</ReactMarkdown>
            ) : (
              <p className="text-muted-foreground italic">Nenhum conteúdo para visualizar. Comece a escrever no editor!</p>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
