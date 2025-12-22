import { useState } from "react";
import { bedrockAI } from "@/integrations/aws/bedrock-client";
import { useToast } from "@/hooks/use-toast";

export function useKnowledgeBaseAI() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const suggestTags = async (content: string): Promise<string[]> => {
    setIsLoading(true);
    try {
      const prompt = `Analyze the following content and suggest 5-8 relevant tags for categorization:

${content}

Return only the tags as a comma-separated list, no additional text.`;

      const response = await bedrockAI.generateQuickResponse(prompt);
      const tags = response.split(',').map(tag => tag.trim()).filter(Boolean);
      return tags;
    } catch (error: any) {
      toast({
        title: "Erro ao sugerir tags",
        description: error.message,
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const generateSummary = async (content: string): Promise<string> => {
    setIsLoading(true);
    try {
      const prompt = `Create a concise summary (2-3 sentences) of the following content:

${content}

Focus on the key points and main takeaways.`;

      const summary = await bedrockAI.generateQuickResponse(prompt);
      return summary;
    } catch (error: any) {
      toast({
        title: "Erro ao gerar resumo",
        description: error.message,
        variant: "destructive",
      });
      return "";
    } finally {
      setIsLoading(false);
    }
  };

  const improveWriting = async (content: string): Promise<string> => {
    setIsLoading(true);
    try {
      const prompt = `Improve the following text for clarity, grammar, and readability while maintaining the original meaning and technical accuracy:

${content}

Return only the improved text, no additional commentary.`;

      const improvedContent = await bedrockAI.generateAnalysis(prompt);
      return improvedContent;
    } catch (error: any) {
      toast({
        title: "Erro ao melhorar texto",
        description: error.message,
        variant: "destructive",
      });
      return content;
    } finally {
      setIsLoading(false);
    }
  };

  const translateContent = async (content: string, targetLanguage: string): Promise<string> => {
    setIsLoading(true);
    try {
      const prompt = `Translate the following content to ${targetLanguage}, maintaining technical accuracy and formatting:

${content}

Return only the translated text, preserving any markdown formatting.`;

      const translatedContent = await bedrockAI.generateAnalysis(prompt);
      return translatedContent;
    } catch (error: any) {
      toast({
        title: "Erro ao traduzir",
        description: error.message,
        variant: "destructive",
      });
      return content;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    suggestTags,
    generateSummary,
    improveWriting,
    translateContent,
    isLoading,
  };
}
