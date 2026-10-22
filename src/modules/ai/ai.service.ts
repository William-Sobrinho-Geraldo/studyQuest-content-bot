import { GoogleGenAI } from '@google/genai';
import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ContentMediaType = 'POST' | 'REELS' | 'STORY';

export interface ContentPlan {
  topic: string;
  mediaType: ContentMediaType;
  caption: string;
  visualPrompt: string;
  headline?: string;
}

const DEFAULT_MODEL = 'gemini-2.5-flash';

const SYSTEM_INSTRUCTION = `Você é o estrategista de conteúdo da "StudyQuest", um aplicativo de estudos gamificado.
Público-alvo: estudantes, concurseiros, universitários e desenvolvedores que querem melhorar foco, produtividade e consistência.
Temas centrais: técnica Pomodoro, criação e manutenção de hábitos de estudo, foco, gamificação, disciplina, rotina e metas de estudo.

Diretrizes de tom e voz:
- Português do Brasil, energético, motivador e próximo, sem clichês vazios.
- Fale como um mentor de produtividade, não como um robô.
- Use ganchos fortes na primeira linha e chamadas para ação (CTA) claras.
- Inclua hashtags relevantes e específicas do nicho.

Formato da resposta:
- Responda SOMENTE com um objeto JSON válido, sem markdown, sem comentários e sem texto adicional.
- O JSON deve seguir exatamente este schema:
{
  "topic": string,
  "mediaType": "POST" | "REELS" | "STORY",
  "caption": string,
  "visualPrompt": string,
  "headline": string
}
- "caption": legenda pronta para publicar no Instagram, com emojis e hashtags.
- "visualPrompt": descrição detalhada da arte/vídeo para o designer (ou geração de imagem), incluindo estilo, cores e elementos.
- "headline": frase curta de destaque para a arte (opcional).`;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: GoogleGenAI | null;
  private readonly model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY')?.trim();
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  async generateContentPlan(
    topic?: string,
    mediaType: ContentMediaType = 'POST',
  ): Promise<ContentPlan> {
    const client = this.getClient();
    const normalizedType = this.normalizeMediaType(mediaType);
    const trimmedTopic = topic?.trim();

    const userPrompt = [
      `Gere um plano de conteúdo para uma publicação do tipo ${normalizedType} no Instagram da StudyQuest.`,
      trimmedTopic
        ? `Tema solicitado: "${trimmedTopic}".`
        : 'Escolha um tema relevante e de alta performance para o nicho de estudos gamificados.',
      `O campo "mediaType" do JSON deve ser exatamente "${normalizedType}".`,
    ].join('\n');

    try {
      const response = await client.models.generateContent({
        model: this.model,
        contents: userPrompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          temperature: 0.9,
        },
      });

      const text = response.text;

      if (!text) {
        throw new BadGatewayException(
          'A API do Gemini retornou uma resposta vazia.',
        );
      }

      const plan = this.parseContentPlan(text);

      this.logger.log(
        `Content plan generated for ${normalizedType}: ${plan.topic}`,
      );

      return { ...plan, mediaType: normalizedType };
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      this.logger.error(
        `Failed to generate content plan: ${this.getErrorMessage(error)}`,
      );

      throw new BadGatewayException(
        `Failed to generate content plan via Gemini API: ${this.getErrorMessage(error)}`,
      );
    }
  }

  private parseContentPlan(rawText: string): ContentPlan {
    const json = this.extractJson(rawText);

    let parsed: unknown;

    try {
      parsed = JSON.parse(json);
    } catch {
      throw new BadGatewayException(
        'A API do Gemini retornou um JSON inválido.',
      );
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new BadGatewayException(
        'A API do Gemini retornou um JSON em formato inesperado.',
      );
    }

    const {
      topic,
      mediaType,
      caption,
      visualPrompt,
      headline,
    } = parsed as Record<string, unknown>;

    if (
      typeof topic !== 'string' ||
      typeof caption !== 'string' ||
      typeof visualPrompt !== 'string'
    ) {
      throw new BadGatewayException(
        'A API do Gemini retornou um JSON sem os campos obrigatórios (topic, caption, visualPrompt).',
      );
    }

    return {
      topic,
      mediaType: this.normalizeMediaType(
        typeof mediaType === 'string' ? mediaType : 'POST',
      ),
      caption,
      visualPrompt,
      headline: typeof headline === 'string' ? headline : undefined,
    };
  }

  private extractJson(rawText: string): string {
    const trimmed = rawText.trim();

    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1);
    }

    return trimmed;
  }

  private normalizeMediaType(value: string): ContentMediaType {
    const normalized = String(value).trim().toUpperCase();

    switch (normalized) {
      case 'POST':
      case 'FEED':
        return 'POST';
      case 'REELS':
      case 'REEL':
        return 'REELS';
      case 'STORY':
      case 'STORIES':
        return 'STORY';
      default:
        return 'POST';
    }
  }

  private getClient(): GoogleGenAI {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Gemini credentials are not configured. Set GEMINI_API_KEY in the .env file.',
      );
    }

    return this.client;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
