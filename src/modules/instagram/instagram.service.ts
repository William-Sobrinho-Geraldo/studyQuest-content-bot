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

interface InstagramResponse {
  id: string;
}

interface MediaContainerPayload {
  image_url?: string;
  video_url?: string;
  media_type?: 'REELS' | 'STORIES';
  caption?: string;
}

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
    const creationId = await this.createMediaContainer(imageUrl, caption);

    return this.publishMediaContainer(creationId);
  }

  async publishReels(videoUrl: string, caption: string): Promise<string> {
    const creationId = await this.createVideoContainer(videoUrl, caption);

    return this.publishMediaContainer(creationId);
  }

  async publishStory(imageUrl: string, caption: string): Promise<string> {
    const creationId = await this.createStoryContainer(imageUrl, caption);

    return this.publishMediaContainer(creationId);
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
