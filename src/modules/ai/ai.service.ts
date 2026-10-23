import { GoogleGenAI } from '@google/genai';
import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ensurePlayStoreCta,
  normalizePlayStoreUrl,
} from '../../common/caption-cta.js';

export type ContentMediaType = 'POST' | 'REELS' | 'STORY';

export interface ContentPlan {
  topic: string;
  mediaType: ContentMediaType;
  caption: string;
  visualPrompt: string;
  headline?: string;
}

const MODEL_DEFINITIVE_ERROR_PATTERNS = [
  'is no longer available',
  'no longer available',
  'not found',
  'not_found',
  'does not exist',
  'decommissioned',
  'discontinued',
];

const MODEL_TEMPORARY_ERROR_PATTERNS = [
  'high demand',
  'overloaded',
  'unavailable',
];

const SYSTEM_INSTRUCTION = `Você é o estrategista de conteúdo da "StudyQuest", um aplicativo de estudos gamificado.
Público-alvo: estudantes, concurseiros, universitários e desenvolvedores que querem melhorar foco, produtividade e consistência.
Temas centrais: técnica Pomodoro, criação e manutenção de hábitos de estudo, foco, gamificação, disciplina, rotina e metas de estudo.

Diretrizes de tom e voz:
- Português do Brasil, energético, motivador e próximo, sem clichês vazios.
- Fale como um mentor de produtividade, não como um robô.
- Use ganchos fortes na primeira linha e chamadas para ação (CTA) claras.

Regras rígidas da legenda:
- A "caption" deve ter no máximo 1 a 2 parágrafos curtos.
- Cada parágrafo deve ter no máximo 4 a 5 linhas.
- Inclua apenas 3 a 6 hashtags essenciais antes da CTA final.
- Nada de textões, listas longas ou excesso de quebras de linha.

Regras rígidas de CTA:
- TODA "caption" deve terminar com uma seção final de Call To Action (CTA) para download na Google Play Store.
- POST e REELS: inclua uma CTA clara para baixar o StudyQuest na Google Play Store e oriente o usuário a acessar o link direto na bio do perfil.
- STORY: reforce o download do StudyQuest na Google Play Store e inclua a URL oficial no texto quando ela estiver disponível.
- Nunca termine a legenda sem essa CTA de download.
- Modelo de CTA para POST e REELS: "📲 Baixe o StudyQuest na Google Play Store! Link direto na nossa bio do perfil. Gamifique seus estudos hoje mesmo! ⚔️✨"
- Modelo de CTA para STORY: "📲 Baixe o StudyQuest na Google Play Store! Link na nossa bio do perfil. Gamifique seus estudos hoje mesmo! ⚔️✨"

Regras rígidas do prompt visual:
- O "visualPrompt" deve ser escrito em inglês e exigir estritamente a identidade visual do StudyQuest.
- Use como referência os ativos de src/assets/branding (logo, ícone, banner, telas e artes do app).
- Estilo obrigatório: clean RPG game UI style, modern pixel art/fantasy illustration, dark neon interface, XP bars, health hearts, purple/violet, electric blue, gold/yellow and neon green palette.
- Contextualize a cena na rotina de estudos e gamificação, variando entre:
  - estudante jovem concentrado(a) estudando para concurso em ambiente moderno, com luzes neon roxo/azul e smartphone exibindo a interface de XP/Pomodoro do StudyQuest;
  - estudante animado(a) com fones de ouvido celebrando um Level Up, com partículas mágicas/RPG ao redor do celular;
  - mesa de estudos moderna com livros, notebook e smartphone em destaque exibindo splashscreen ou dashboard de conquistas do StudyQuest;
  - ilustração 3D/cyber-RPG combinando livros, cadernos, relógio Pomodoro, espadas de energia, escudos de foco e barras de XP.
- Descreva composição, ambiente, iluminação, emoção e elementos de UI com riqueza de detalhes.
- Combine a estética e a paleta de cores dos assets de src/assets/branding com esses cenários humanos/tecnológicos de foco e estudo.
- Inclua o logo/mascote e elementos de UI gamificada do StudyQuest na composição.
- Evite imagens genéricas, paisagens vazias, montanhas sem contexto, escritórios ou fotos stock realistas.

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
- "caption": legenda curta pronta para publicar no Instagram, com emojis e hashtags essenciais.
- "visualPrompt": prompt visual detalhado em inglês, alinhado à identidade de marca e às regras acima.
- "headline": frase curta de destaque para a arte (opcional).`;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: GoogleGenAI | null;
  private currentModel = 'gemini-3.8-flash';
  private readonly fallbackModels: string[] = [
    'gemini-3.8-flash',
    'gemini-flash',
    'gemini-pro',
    'gemini-1.5-flash',
  ];
  private readonly maxAttemptsPerModel = 3;
  private readonly retryBaseDelayMs = 2_000;

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
      const response = await this.executeWithModelFallback((model) =>
        client.models.generateContent({
          model,
          contents: userPrompt,
          config: {
            systemInstruction: this.buildSystemInstruction(),
            responseMimeType: 'application/json',
            temperature: 0.9,
          },
        }),
      );

      const text = response.text;

      if (!text) {
        throw new BadGatewayException(
          'A API do Gemini retornou uma resposta vazia.',
        );
      }

      const plan = this.parseContentPlan(text);
      const caption = ensurePlayStoreCta(
        plan.caption,
        normalizedType,
        this.getPlayStoreUrl(),
      );

      this.logger.log(
        `Content plan generated for ${normalizedType}: ${plan.topic}`,
      );

      return { ...plan, caption, mediaType: normalizedType };
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

  private buildSystemInstruction(): string {
    const playStoreUrl = this.getPlayStoreUrl();
    const urlRule = playStoreUrl
      ? `- Use a URL oficial da Google Play Store quando incluir o link: ${playStoreUrl}.`
      : '- Não invente URLs. Oriente o usuário a acessar o link da Google Play Store na bio do perfil.';

    return `${SYSTEM_INSTRUCTION}\n\nRegra adicional de URL:\n${urlRule}`;
  }

  private getPlayStoreUrl(): string | undefined {
    return normalizePlayStoreUrl(
      this.configService.get<string>('PLAYSTORE_APP_URL'),
    );
  }

  private async executeWithModelFallback<T>(
    operation: (model: string) => Promise<T>,
  ): Promise<T> {
    const currentIndex = this.fallbackModels.indexOf(this.currentModel);
    const candidateModels =
      currentIndex === -1
        ? [this.currentModel, ...this.fallbackModels]
        : [this.currentModel, ...this.fallbackModels.slice(currentIndex + 1)];

    let finalError: unknown;

    for (let index = 0; index < candidateModels.length; index += 1) {
      const model = candidateModels[index];
      const nextModel = candidateModels[index + 1];

      for (let attempt = 1; attempt <= this.maxAttemptsPerModel; attempt += 1) {
        try {
          const result = await operation(model);
          this.currentModel = model;

          return result;
        } catch (error) {
          const errorType = this.classifyModelError(error);

          if (!errorType) {
            throw error;
          }

          finalError = error;

          if (errorType === 'temporary' && attempt < this.maxAttemptsPerModel) {
            const delayMs = this.retryBaseDelayMs * 2 ** (attempt - 1);

            this.logger.warn(
              `Gemini model "${model}" is temporarily unavailable (${this.getErrorMessage(error)}). Retrying attempt ${attempt + 1}/${this.maxAttemptsPerModel} in ${delayMs}ms...`,
            );

            await this.wait(delayMs);
            continue;
          }

          if (nextModel) {
            this.currentModel = nextModel;
            this.logger.warn(
              `Gemini model "${model}" failed (${this.getErrorMessage(error)}). Switching to fallback model "${nextModel}"...`,
            );
          }

          break;
        }
      }
    }

    throw (
      finalError ?? new Error('No Gemini model available for the operation.')
    );
  }

  private classifyModelError(
    error: unknown,
  ): 'definitive' | 'temporary' | null {
    if (!error) {
      return null;
    }

    const candidate = error as {
      status?: unknown;
      code?: unknown;
      httpStatus?: unknown;
      response?: { status?: unknown };
      error?: { status?: unknown; code?: unknown };
    };

    const statuses = [
      candidate.status,
      candidate.code,
      candidate.httpStatus,
      candidate.response?.status,
      candidate.error?.status,
      candidate.error?.code,
    ];

    const hasDefinitiveStatus = statuses.some(
      (status) =>
        Number(status) === 404 || String(status).toUpperCase() === 'NOT_FOUND',
    );

    if (hasDefinitiveStatus) {
      return 'definitive';
    }

    const hasTemporaryStatus = statuses.some(
      (status) =>
        Number(status) === 503 ||
        String(status).toUpperCase() === 'UNAVAILABLE',
    );

    if (hasTemporaryStatus) {
      return 'temporary';
    }

    const message = this.getModelErrorMessage(error).toLowerCase();

    if (
      MODEL_DEFINITIVE_ERROR_PATTERNS.some((pattern) =>
        message.includes(pattern),
      )
    ) {
      return 'definitive';
    }

    if (
      MODEL_TEMPORARY_ERROR_PATTERNS.some((pattern) =>
        message.includes(pattern),
      )
    ) {
      return 'temporary';
    }

    return null;
  }

  private async wait(delayMs: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private getModelErrorMessage(error: unknown): string {
    if (typeof error === 'string') {
      return error;
    }

    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'object' && error !== null) {
      const record = error as Record<string, unknown>;
      const nestedError = record.error as Record<string, unknown> | undefined;
      const response = record.response as Record<string, unknown> | undefined;
      const responseData = response?.data as
        Record<string, unknown> | undefined;

      return [record.message, nestedError?.message, responseData?.message]
        .filter((value): value is string => typeof value === 'string')
        .join(' ');
    }

    return String(error);
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

    const { topic, mediaType, caption, visualPrompt, headline } =
      parsed as Record<string, unknown>;

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
