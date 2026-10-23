import { Body, Controller, Post } from '@nestjs/common';
import { ensurePlayStoreCta } from '../../common/caption-cta.js';
import { MediaService } from '../media/media.service.js';
import { InstagramService } from './instagram.service.js';

interface TestPublishBody {
  imageUrl?: string;
  caption?: string;
}

const DEFAULT_CAPTION =
  'Teste de automação do StudyQuest! ⚔️ O app de estudos gamificado que transforma sua rotina em uma aventura. #studyquest #pomodoro';

@Controller('instagram')
export class InstagramController {
  constructor(
    private readonly instagramService: InstagramService,
    private readonly mediaService: MediaService,
  ) {}

  @Post('test-publish')
  async testPublish(@Body() body?: TestPublishBody) {
    const caption = ensurePlayStoreCta(
      body?.caption?.trim() || DEFAULT_CAPTION,
      'POST',
      process.env.PLAYSTORE_APP_URL,
    );
    const imageUrl =
      body?.imageUrl?.trim() ||
      (await this.mediaService.selectNextContentAsset('posts')).publicUrl;

    const mediaId = await this.instagramService.publishPhoto(imageUrl, caption);

    return {
      success: true,
      mediaId,
      imageUrl,
      publishedAt: new Date().toISOString(),
    };
  }
}
