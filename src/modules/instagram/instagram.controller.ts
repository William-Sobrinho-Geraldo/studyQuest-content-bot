import { Body, Controller, Post } from '@nestjs/common';
import { InstagramService } from './instagram.service.js';

interface TestPublishBody {
  imageUrl?: string;
  caption?: string;
}

const DEFAULT_IMAGE_URL = 'https://picsum.photos/1080/1080';
const DEFAULT_CAPTION =
  'Teste de automação do StudyQuest! ⚔️ O app de estudos gamificado já está no ar na Play Store. #studyquest #pomodoro';

@Controller('instagram')
export class InstagramController {
  constructor(private readonly instagramService: InstagramService) {}

  @Post('test-publish')
  async testPublish(@Body() body?: TestPublishBody) {
    const imageUrl = body?.imageUrl?.trim() || DEFAULT_IMAGE_URL;
    const caption = body?.caption?.trim() || DEFAULT_CAPTION;

    const mediaId = await this.instagramService.publishPhoto(imageUrl, caption);

    return { success: true, mediaId };
  }
}
