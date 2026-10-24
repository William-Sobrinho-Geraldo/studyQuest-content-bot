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

interface CronJobDefinition {
  name: string;
  type: ScheduledPublicationType;
  label: string;
  schedule: string;
  expression: string;
}

type RegisteredCronJob = ReturnType<SchedulerRegistry['getCronJob']>;

const CRON_JOBS = {
  storyMorning: {
    name: 'story-morning',
    type: 'stories',
    label: 'STORY da manhã',
    schedule: '08:00',
    expression: '0 0 8 * * *',
  },
  postLunch: {
    name: 'post-lunch',
    type: 'post',
    label: 'POST do almoço',
    schedule: '12:30',
    expression: '0 30 12 * * *',
  },
  storyAfternoon: {
    name: 'story-afternoon',
    type: 'stories',
    label: 'STORY do fim de tarde',
    schedule: '18:30',
    expression: '0 30 18 * * *',
  },
  postEvening: {
    name: 'post-evening',
    type: 'post',
    label: 'POST da noite',
    schedule: '20:30',
    expression: '0 30 20 * * *',
  },
  testStoryMorning: {
    name: 'test-story-morning',
    type: 'stories',
    label: 'TESTE - Story da manhã',
    schedule: '09:00',
    expression: '0 0 9 * * *',
  },
  testPostAfternoon: {
    name: 'test-post-afternoon',
    type: 'post',
    label: 'TESTE - Post início da tarde',
    schedule: '14:00',
    expression: '0 0 14 * * *',
  },
  testStoryLateAfternoon: {
    name: 'test-story-late-afternoon',
    type: 'stories',
    label: 'TESTE - Story meio da tarde',
    schedule: '16:30',
    expression: '0 30 16 * * *',
  },
  testPostNight: {
    name: 'test-post-night',
    type: 'post',
    label: 'TESTE - Post fim da noite',
    schedule: '22:00',
    expression: '0 0 22 * * *',
  },
} as const satisfies Record<string, CronJobDefinition>;

const CRON_JOB_DEFINITIONS: readonly CronJobDefinition[] =
  Object.values(CRON_JOBS);

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
    const missingJobs = CRON_JOB_DEFINITIONS.filter(
      (job) => !registeredJobs.has(job.name),
    );

    this.logger.log(
      [
        `🗓️ [SCHEDULER:BOOT] startedAt=${this.formatSaoPauloDate(new Date())}`,
        `   node=${process.version} pid=${process.pid} env=${process.env.NODE_ENV ?? 'development'}`,
        `   renderService=${process.env.RENDER_SERVICE_NAME ?? 'n/a'} renderCommit=${process.env.RENDER_GIT_COMMIT ?? 'n/a'}`,
        '   Cron em memória: execuções perdidas durante sleep/deploy não são recuperadas.',
        '   Agendamentos:',
        ...CRON_JOB_DEFINITIONS.map((job) => {
          const nextRun = this.getNextRun(registeredJobs.get(job.name));

          return `   • ${job.schedule} ${CRON_TIME_ZONE} — ${job.label} (job=${job.name}, next=${nextRun})`;
        }),
        '   • Reels: somente via trigger manual',
      ].join('\n'),
    );

    if (missingJobs.length > 0) {
      this.logger.warn(
        `[SCHEDULER] Cron jobs não registrados: ${missingJobs.map((job) => job.name).join(', ')}`,
      );
    }

    if (!process.env.SCHEDULER_TRIGGER_TOKEN?.trim()) {
      this.logger.warn(
        '[SCHEDULER] SCHEDULER_TRIGGER_TOKEN não definido; POST /scheduler/trigger/:type está sem autenticação.',
      );
    }
  }

  onApplicationShutdown(): void {
    const registeredJobs = this.schedulerRegistry.getCronJobs();
    let stoppedJobs = 0;

    this.logger.log(
      `🛑 [SCHEDULER:SHUTDOWN] at=${this.formatSaoPauloDate(new Date())} — interrompendo cron jobs em memória (spin down/deploy).`,
    );

    for (const job of CRON_JOB_DEFINITIONS) {
      if (!registeredJobs.has(job.name)) {
        continue;
      }

      this.schedulerRegistry.deleteCronJob(job.name);
      stoppedJobs += 1;
    }

    this.logger.log(
      `🛑 [SCHEDULER:SHUTDOWN] ${stoppedJobs} cron job(s) removido(s).`,
    );
  }

  @Cron(CRON_JOBS.storyMorning.expression, {
    name: CRON_JOBS.storyMorning.name,
    timeZone: CRON_TIME_ZONE,
  })
  async handleMorningStorySchedule(): Promise<void> {
    await this.runScheduledPublication(CRON_JOBS.storyMorning);
  }

  @Cron(CRON_JOBS.postLunch.expression, {
    name: CRON_JOBS.postLunch.name,
    timeZone: CRON_TIME_ZONE,
  })
  async handleLunchPostSchedule(): Promise<void> {
    await this.runScheduledPublication(CRON_JOBS.postLunch);
  }

  @Cron(CRON_JOBS.storyAfternoon.expression, {
    name: CRON_JOBS.storyAfternoon.name,
    timeZone: CRON_TIME_ZONE,
  })
  async handleAfternoonStorySchedule(): Promise<void> {
    await this.runScheduledPublication(CRON_JOBS.storyAfternoon);
  }

  @Cron(CRON_JOBS.postEvening.expression, {
    name: CRON_JOBS.postEvening.name,
    timeZone: CRON_TIME_ZONE,
  })
  async handleEveningPostSchedule(): Promise<void> {
    await this.runScheduledPublication(CRON_JOBS.postEvening);
  }

  @Cron(CRON_JOBS.testStoryMorning.expression, {
    name: CRON_JOBS.testStoryMorning.name,
    timeZone: CRON_TIME_ZONE,
  })
  async handleTestMorningStorySchedule(): Promise<void> {
    await this.runScheduledPublication(CRON_JOBS.testStoryMorning);
  }

  @Cron(CRON_JOBS.testPostAfternoon.expression, {
    name: CRON_JOBS.testPostAfternoon.name,
    timeZone: CRON_TIME_ZONE,
  })
  async handleTestAfternoonPostSchedule(): Promise<void> {
    await this.runScheduledPublication(CRON_JOBS.testPostAfternoon);
  }

  @Cron(CRON_JOBS.testStoryLateAfternoon.expression, {
    name: CRON_JOBS.testStoryLateAfternoon.name,
    timeZone: CRON_TIME_ZONE,
  })
  async handleTestLateAfternoonStorySchedule(): Promise<void> {
    await this.runScheduledPublication(CRON_JOBS.testStoryLateAfternoon);
  }

  @Cron(CRON_JOBS.testPostNight.expression, {
    name: CRON_JOBS.testPostNight.name,
    timeZone: CRON_TIME_ZONE,
  })
  async handleTestNightPostSchedule(): Promise<void> {
    await this.runScheduledPublication(CRON_JOBS.testPostNight);
  }

  async triggerManualPublish(
    type: ScheduledPublicationType | string,
  ): Promise<ManualPublishResult> {
    const publicationType = this.normalizeType(type);
    const startedAtMs = Date.now();

    this.logger.log(
      `🚀 [MANUAL] Disparando publicação de ${publicationType.toUpperCase()}...`,
    );

    const result = await this.publish(publicationType);

    this.logger.log(
      `✅ [MANUAL] Publicação de ${publicationType.toUpperCase()} concluída (durationMs=${Date.now() - startedAtMs}, mediaId: ${result.mediaId}, topic: "${result.topic}").`,
    );

    return result;
  }

  private async runScheduledPublication(
    job: CronJobDefinition,
  ): Promise<void> {
    const startedAt = new Date();
    const startedAtMs = Date.now();

    this.logger.log(
      `⏰ [CRON:FIRE] job=${job.name} type=${this.toPublishedMediaType(job.type)} label="${job.label}" firedAt=${this.formatSaoPauloDate(startedAt)}`,
    );

    try {
      const result = await this.publish(job.type);

      this.logger.log(
        `✅ [CRON:DONE] job=${job.name} type=${result.mediaType} durationMs=${Date.now() - startedAtMs} mediaId=${result.mediaId} topic="${result.topic}"`,
      );
    } catch (error) {
      this.logger.error(
        `❌ [CRON:ERROR] job=${job.name} type=${this.toPublishedMediaType(job.type)} durationMs=${Date.now() - startedAtMs} message="${this.getErrorMessage(error)}"`,
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

  private getNextRun(job: RegisteredCronJob | undefined): string {
    if (!job) {
      return 'n/a';
    }

    try {
      return job.nextDate().toISO() ?? 'n/a';
    } catch {
      return 'n/a';
    }
  }

  private formatSaoPauloDate(date: Date): string {
    const localTime = new Intl.DateTimeFormat('pt-BR', {
      timeZone: CRON_TIME_ZONE,
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(date);

    return `${date.toISOString()} (${localTime} ${CRON_TIME_ZONE})`;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
