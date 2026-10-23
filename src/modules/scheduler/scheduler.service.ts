import {
  BadRequestException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { ensurePlayStoreCta } from '../../common/caption-cta.js';
import { AiService, type ContentMediaType } from '../ai/ai.service.js';
import { InstagramService } from '../instagram/instagram.service.js';
import {
  MediaService,
  type ContentAssetKind,
  type ContentAssetType,
} from '../media/media.service.js';

export type ScheduledPublicationType = 'post' | 'reels' | 'stories';
export type PublishedMediaType = 'POST' | 'REELS' | 'STORY';

export interface ManualPublishResult {
  success: true;
  mediaType: PublishedMediaType;
  topic: string;
  caption: string;
  mediaId: string;
  publishedAt: string;
}

interface ScheduledPublicationContent {
  topic: string;
  imageUrl?: string;
  videoUrl?: string;
  caption: string;
}

const DEFAULT_POST_CAPTION =
  'Bora estudar? 🚀 O StudyQuest transforma sua rotina de estudos em uma aventura gamificada. #StudyQuest #Estudos #Pomodoro';
const DEFAULT_REELS_CAPTION =
  'Novo vídeo no ar! 🎬 Veja como o StudyQuest pode turbinar seus estudos. #StudyQuest #Reels #Produtividade';
const DEFAULT_STORY_CAPTION =
  'Hora de estudar! 📚 Abra o StudyQuest e mantenha o foco. #StudyQuest #Stories';

const CRON_TIME_ZONE = 'America/Sao_Paulo';

const CRON_JOB_NAMES = [
  'story-morning',
  'post-lunch',
  'story-afternoon',
  'post-evening',
] as const;

const SCHEDULE_LOG_LINES = [
  `🗓️ [SCHEDULER] Agendamentos ativos (${CRON_TIME_ZONE}):`,
  '  • 08:00 — Story (manhã)',
  '  • 12:30 — Post (almoço)',
  '  • 18:30 — Story (fim de tarde)',
  '  • 20:30 — Post (noite)',
  '  • Reels: somente via trigger manual',
] as const;

@Injectable()
export class SchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly instagramService: InstagramService,
    private readonly aiService: AiService,
    private readonly mediaService: MediaService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    const registeredJobs = this.schedulerRegistry.getCronJobs();
    const missingJobs = CRON_JOB_NAMES.filter(
      (jobName) => !registeredJobs.has(jobName),
    );

    this.logger.log(SCHEDULE_LOG_LINES.join('\n'));

    if (missingJobs.length > 0) {
      this.logger.warn(
        `[SCHEDULER] Cron jobs não registrados: ${missingJobs.join(', ')}`,
      );
    }
  }

  onApplicationShutdown(): void {
    const registeredJobs = this.schedulerRegistry.getCronJobs();

    for (const jobName of CRON_JOB_NAMES) {
      if (!registeredJobs.has(jobName)) {
        continue;
      }

      this.schedulerRegistry.deleteCronJob(jobName);
      this.logger.log(`🛑 Cron job "${jobName}" stopped during shutdown.`);
    }
  }

  @Cron('0 0 8 * * *', {
    name: 'story-morning',
    timeZone: CRON_TIME_ZONE,
  })
  async handleMorningStorySchedule(): Promise<void> {
    this.logger.log(
      '⏰ [CRON] Executando publicação de STORY da manhã (08:00)...',
    );

    await this.runScheduledPublication('stories', 'STORY da manhã');
  }

  @Cron('0 30 12 * * *', {
    name: 'post-lunch',
    timeZone: CRON_TIME_ZONE,
  })
  async handleLunchPostSchedule(): Promise<void> {
    this.logger.log(
      '⏰ [CRON] Executando publicação de POST do almoço (12:30)...',
    );

    await this.runScheduledPublication('post', 'POST do almoço');
  }

  @Cron('0 30 18 * * *', {
    name: 'story-afternoon',
    timeZone: CRON_TIME_ZONE,
  })
  async handleAfternoonStorySchedule(): Promise<void> {
    this.logger.log(
      '⏰ [CRON] Executando publicação de STORY do fim de tarde (18:30)...',
    );

    await this.runScheduledPublication('stories', 'STORY do fim de tarde');
  }

  @Cron('0 30 20 * * *', {
    name: 'post-evening',
    timeZone: CRON_TIME_ZONE,
  })
  async handleEveningPostSchedule(): Promise<void> {
    this.logger.log(
      '⏰ [CRON] Executando publicação de POST da noite (20:30)...',
    );

    await this.runScheduledPublication('post', 'POST da noite');
  }

  async triggerManualPublish(
    type: ScheduledPublicationType | string,
  ): Promise<ManualPublishResult> {
    const publicationType = this.normalizeType(type);

    this.logger.log(
      `🚀 [MANUAL] Disparando publicação de ${publicationType.toUpperCase()}...`,
    );

    const result = await this.publish(publicationType);

    this.logger.log(
      `✅ [MANUAL] Publicação de ${publicationType.toUpperCase()} concluída (mediaId: ${result.mediaId}, topic: "${result.topic}").`,
    );

    return result;
  }

  private async runScheduledPublication(
    type: ScheduledPublicationType,
    label = type.toUpperCase(),
  ): Promise<void> {
    try {
      const result = await this.publish(type);

      this.logger.log(
        `✅ [CRON] ${label} concluída (mediaId: ${result.mediaId}, topic: "${result.topic}").`,
      );
    } catch (error) {
      this.logger.error(
        `❌ [CRON] Falha ao publicar ${label}: ${this.getErrorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async publish(
    type: ScheduledPublicationType,
  ): Promise<ManualPublishResult> {
    const content = await this.generateContent(type);
    const mediaId = await this.publishToInstagram(type, content);

    return {
      success: true,
      mediaType: this.toPublishedMediaType(type),
      topic: content.topic,
      caption: content.caption,
      mediaId,
      publishedAt: new Date().toISOString(),
    };
  }

  private async publishToInstagram(
    type: ScheduledPublicationType,
    content: ScheduledPublicationContent,
  ): Promise<string> {
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

  private async generateContent(
    type: ScheduledPublicationType,
  ): Promise<ScheduledPublicationContent> {
    const plan = await this.aiService.generateContentPlan(
      undefined,
      this.toContentMediaType(type),
    );
    const topic = plan.topic?.trim() || 'Conteúdo StudyQuest';
    const caption = ensurePlayStoreCta(
      plan.caption?.trim() || this.getDefaultCaption(type),
      this.toContentMediaType(type),
      process.env.PLAYSTORE_APP_URL,
    );
    const selectedAsset = await this.mediaService.selectNextContentAsset(
      this.toContentAssetType(type),
      this.toContentAssetKind(type),
    );

    if (type === 'reels') {
      return {
        topic,
        caption,
        videoUrl: selectedAsset.publicUrl,
      };
    }

    return {
      topic,
      caption,
      imageUrl: selectedAsset.publicUrl,
    };
  }

  private toContentAssetType(
    type: ScheduledPublicationType,
  ): ContentAssetType {
    switch (type) {
      case 'post':
        return 'posts';
      case 'reels':
        return 'reels';
      case 'stories':
        return 'stories';
    }
  }

  private toContentAssetKind(
    type: ScheduledPublicationType,
  ): ContentAssetKind {
    return type === 'reels' ? 'video' : 'image';
  }

  private getDefaultCaption(type: ScheduledPublicationType): string {
    switch (type) {
      case 'post':
        return (
          process.env.SCHEDULER_POST_CAPTION?.trim() || DEFAULT_POST_CAPTION
        );
      case 'reels':
        return (
          process.env.SCHEDULER_REELS_CAPTION?.trim() || DEFAULT_REELS_CAPTION
        );
      case 'stories':
        return (
          process.env.SCHEDULER_STORY_CAPTION?.trim() || DEFAULT_STORY_CAPTION
        );
    }
  }

  private toContentMediaType(type: ScheduledPublicationType): ContentMediaType {
    switch (type) {
      case 'post':
        return 'POST';
      case 'reels':
        return 'REELS';
      case 'stories':
        return 'STORY';
    }
  }

  private toPublishedMediaType(
    type: ScheduledPublicationType,
  ): PublishedMediaType {
    switch (type) {
      case 'post':
        return 'POST';
      case 'reels':
        return 'REELS';
      case 'stories':
        return 'STORY';
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
