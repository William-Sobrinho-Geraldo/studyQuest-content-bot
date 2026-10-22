import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InstagramService } from '../instagram/instagram.service.js';

export type ScheduledPublicationType = 'post' | 'reels' | 'stories';

export interface ManualPublishResult {
  type: ScheduledPublicationType;
  mediaId: string;
}

interface ScheduledPublicationContent {
  imageUrl?: string;
  videoUrl?: string;
  caption: string;
}

const DEFAULT_POST_IMAGE_URL = 'https://picsum.photos/1080/1080';
const DEFAULT_STORY_IMAGE_URL = 'https://picsum.photos/1080/1920';
const DEFAULT_REELS_VIDEO_URL =
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

const DEFAULT_POST_CAPTION =
  'Bora estudar? 🚀 O StudyQuest transforma sua rotina de estudos em uma aventura gamificada. Baixe agora na Play Store! #StudyQuest #Estudos #Pomodoro';
const DEFAULT_REELS_CAPTION =
  'Novo vídeo no ar! 🎬 Veja como o StudyQuest pode turbinar seus estudos. #StudyQuest #Reels #Produtividade';
const DEFAULT_STORY_CAPTION =
  'Hora de estudar! 📚 Abra o StudyQuest e mantenha o foco. #StudyQuest #Stories';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private readonly instagramService: InstagramService) {}

  @Cron('0 9 * * *', {
    name: 'daily-post',
    timeZone: 'America/Sao_Paulo',
  })
  async handlePostSchedule(): Promise<void> {
    this.logger.log(
      '⏰ [CRON] Executando rotina diária de publicação de POST (feed)...',
    );

    await this.runScheduledPublication('post');
  }

  @Cron('0 18 * * *', {
    name: 'daily-reels',
    timeZone: 'America/Sao_Paulo',
  })
  async handleReelsSchedule(): Promise<void> {
    this.logger.log(
      '⏰ [CRON] Executando rotina diária de publicação de REELS...',
    );

    await this.runScheduledPublication('reels');
  }

  @Cron('0 12,20 * * *', {
    name: 'daily-stories',
    timeZone: 'America/Sao_Paulo',
  })
  async handleStoriesSchedule(): Promise<void> {
    this.logger.log(
      '⏰ [CRON] Executando rotina de publicação de STORY...',
    );

    await this.runScheduledPublication('stories');
  }

  async triggerManualPublish(
    type: ScheduledPublicationType | string,
  ): Promise<ManualPublishResult> {
    const publicationType = this.normalizeType(type);

    this.logger.log(
      `🚀 [MANUAL] Disparando publicação de ${publicationType.toUpperCase()}...`,
    );

    const mediaId = await this.publish(publicationType);

    this.logger.log(
      `✅ [MANUAL] Publicação de ${publicationType.toUpperCase()} concluída (mediaId: ${mediaId}).`,
    );

    return { type: publicationType, mediaId };
  }

  private async runScheduledPublication(
    type: ScheduledPublicationType,
  ): Promise<void> {
    try {
      const mediaId = await this.publish(type);

      this.logger.log(
        `✅ [CRON] Publicação de ${type.toUpperCase()} concluída (mediaId: ${mediaId}).`,
      );
    } catch (error) {
      this.logger.error(
        `❌ [CRON] Falha ao publicar ${type.toUpperCase()}: ${this.getErrorMessage(error)}`,
      );
    }
  }

  private async publish(type: ScheduledPublicationType): Promise<string> {
    const content = this.generateContent(type);

    switch (type) {
      case 'post':
        return this.instagramService.publishPhoto(
          content.imageUrl as string,
          content.caption,
        );
      case 'reels':
        return this.instagramService.publishReels(
          content.videoUrl as string,
          content.caption,
        );
      case 'stories':
        return this.instagramService.publishStory(
          content.imageUrl as string,
          content.caption,
        );
    }
  }

  private generateContent(
    type: ScheduledPublicationType,
  ): ScheduledPublicationContent {
    switch (type) {
      case 'post':
        return {
          imageUrl:
            process.env.SCHEDULER_POST_IMAGE_URL?.trim() ||
            DEFAULT_POST_IMAGE_URL,
          caption:
            process.env.SCHEDULER_POST_CAPTION?.trim() || DEFAULT_POST_CAPTION,
        };
      case 'reels':
        return {
          videoUrl:
            process.env.SCHEDULER_REELS_VIDEO_URL?.trim() ||
            DEFAULT_REELS_VIDEO_URL,
          caption:
            process.env.SCHEDULER_REELS_CAPTION?.trim() ||
            DEFAULT_REELS_CAPTION,
        };
      case 'stories':
        return {
          imageUrl:
            process.env.SCHEDULER_STORY_IMAGE_URL?.trim() ||
            DEFAULT_STORY_IMAGE_URL,
          caption:
            process.env.SCHEDULER_STORY_CAPTION?.trim() ||
            DEFAULT_STORY_CAPTION,
        };
    }
  }

  private normalizeType(
    type: ScheduledPublicationType | string,
  ): ScheduledPublicationType {
    const normalized = String(type).trim().toLowerCase();

    switch (normalized) {
      case 'post':
      case 'feed':
        return 'post';
      case 'reel':
      case 'reels':
        return 'reels';
      case 'story':
      case 'stories':
        return 'stories';
      default:
        throw new BadRequestException(
          `Unsupported publication type: ${type}. Use post, reels or stories.`,
        );
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
