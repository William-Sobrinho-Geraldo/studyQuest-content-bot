import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { ensurePlayStoreCta } from '../../common/caption-cta.js';

interface InstagramResponse {
  id: string;
}

interface MediaContainerPayload {
  image_url?: string;
  video_url?: string;
  media_type?: 'REELS' | 'STORIES';
  caption?: string;
}

interface MediaContainerStatusResponse {
  status_code?: string;
}

const STATUS_POLL_INTERVAL_MS = 3_000;
const STATUS_POLL_MAX_ATTEMPTS = 10;
const READY_STATUS_CODES = new Set(['FINISHED', 'READY']);
const FAILED_STATUS_CODES = new Set(['ERROR', 'EXPIRED']);

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);
  private readonly graphBaseUrl = 'https://graph.instagram.com/v21.0';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async createMediaContainer(
    imageUrl: string,
    caption: string,
  ): Promise<string> {
    return this.createContainer({ image_url: imageUrl, caption });
  }

  async createVideoContainer(
    videoUrl: string,
    caption: string,
  ): Promise<string> {
    return this.createContainer({
      video_url: videoUrl,
      media_type: 'REELS',
      caption,
    });
  }

  async createStoryContainer(
    imageUrl: string,
    caption: string,
  ): Promise<string> {
    return this.createContainer({
      image_url: imageUrl,
      media_type: 'STORIES',
      caption,
    });
  }

  async publishMediaContainer(creationId: string): Promise<string> {
    const { accountId, accessToken } = this.getCredentials();

    await this.waitForContainerReady(creationId, accessToken);

    try {
      const { data } = await firstValueFrom(
        this.httpService.post<InstagramResponse>(
          `${this.graphBaseUrl}/${accountId}/media_publish`,
          {
            creation_id: creationId,
            access_token: accessToken,
          },
        ),
      );

      this.logger.log(`Media published: ${data.id}`);

      return data.id;
    } catch (error) {
      throw this.handleMetaError('publish media container', error);
    }
  }

  async publishPhoto(imageUrl: string, caption: string): Promise<string> {
    const creationId = await this.createMediaContainer(
      imageUrl,
      this.buildPublishCaption(caption, 'POST'),
    );

    return this.publishMediaContainer(creationId);
  }

  async publishReels(videoUrl: string, caption: string): Promise<string> {
    const creationId = await this.createVideoContainer(
      videoUrl,
      this.buildPublishCaption(caption, 'REELS'),
    );

    return this.publishMediaContainer(creationId);
  }

  async publishStory(imageUrl: string, caption: string): Promise<string> {
    const creationId = await this.createStoryContainer(
      imageUrl,
      this.buildPublishCaption(caption, 'STORY'),
    );

    return this.publishMediaContainer(creationId);
  }

  private buildPublishCaption(
    caption: string,
    mediaType: 'POST' | 'REELS' | 'STORY',
  ): string {
    return ensurePlayStoreCta(
      caption,
      mediaType,
      this.configService.get<string>('PLAYSTORE_APP_URL'),
    );
  }

  private async waitForContainerReady(
    creationId: string,
    accessToken: string,
  ): Promise<void> {
    for (let attempt = 1; attempt <= STATUS_POLL_MAX_ATTEMPTS; attempt += 1) {
      const statusCode = await this.getContainerStatusCode(
        creationId,
        accessToken,
      );

      if (statusCode && READY_STATUS_CODES.has(statusCode)) {
        this.logger.log(
          `Media container ${creationId} is ready (status: ${statusCode}, attempt ${attempt}/${STATUS_POLL_MAX_ATTEMPTS}).`,
        );

        return;
      }

      if (statusCode && FAILED_STATUS_CODES.has(statusCode)) {
        throw new BadGatewayException(
          `Media container ${creationId} cannot be published (status: ${statusCode}).`,
        );
      }

      this.logger.log(
        `Media container ${creationId} is not ready yet (status: ${statusCode ?? 'UNKNOWN'}, attempt ${attempt}/${STATUS_POLL_MAX_ATTEMPTS}).`,
      );

      if (attempt < STATUS_POLL_MAX_ATTEMPTS) {
        this.logger.log(
          `Waiting ${STATUS_POLL_INTERVAL_MS}ms before checking the container status again.`,
        );

        await this.wait(STATUS_POLL_INTERVAL_MS);
      }
    }

    throw new BadGatewayException(
      `Media container ${creationId} was not ready after ${STATUS_POLL_MAX_ATTEMPTS} status checks.`,
    );
  }

  private async getContainerStatusCode(
    creationId: string,
    accessToken: string,
  ): Promise<string | undefined> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<MediaContainerStatusResponse>(
          `${this.graphBaseUrl}/${creationId}`,
          {
            params: {
              fields: 'status_code',
              access_token: accessToken,
            },
          },
        ),
      );

      return data.status_code?.trim().toUpperCase();
    } catch (error) {
      throw this.handleMetaError('check media container status', error);
    }
  }

  private async wait(delayMs: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private async createContainer(
    payload: MediaContainerPayload,
  ): Promise<string> {
    const { accountId, accessToken } = this.getCredentials();

    try {
      const { data } = await firstValueFrom(
        this.httpService.post<InstagramResponse>(
          `${this.graphBaseUrl}/${accountId}/media`,
          {
            ...payload,
            access_token: accessToken,
          },
        ),
      );

      this.logger.log(`Media container created: ${data.id}`);

      return data.id;
    } catch (error) {
      throw this.handleMetaError('create media container', error);
    }
  }

  private getCredentials(): { accountId: string; accessToken: string } {
    const accountId = this.configService
      .get<string>('INSTAGRAM_ACCOUNT_ID')
      ?.trim();
    const accessToken = this.configService
      .get<string>('INSTAGRAM_ACCESS_TOKEN')
      ?.trim();

    if (!accountId || !accessToken) {
      throw new ServiceUnavailableException(
        'Instagram credentials are not configured. Set INSTAGRAM_ACCOUNT_ID and INSTAGRAM_ACCESS_TOKEN in the .env file.',
      );
    }

    return { accountId, accessToken };
  }

  private handleMetaError(action: string, error: unknown): Error {
    if (isAxiosError(error)) {
      const metaError = error.response?.data;
      this.logger.error(
        `Failed to ${action}: ${JSON.stringify(metaError ?? error.message)}`,
      );

      return new BadGatewayException({
        message: `Failed to ${action} via Meta Graph API.`,
        metaError,
      });
    }

    this.logger.error(`Failed to ${action}: ${String(error)}`);

    return new BadGatewayException(`Failed to ${action} via Meta Graph API.`);
  }
}
