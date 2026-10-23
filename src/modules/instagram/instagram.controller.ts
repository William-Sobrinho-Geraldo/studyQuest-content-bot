import { Body, Controller, Post } from '@nestjs/common';
import { ensurePlayStoreCta } from '../../common/caption-cta.js';
import {
  MediaService,
  type ContentAssetKind,
  type ContentAssetType,
} from '../media/media.service.js';
import { InstagramService } from './instagram.service.js';

interface TestPublishBody {
  caption?: string;
}

const DEFAULT_CAPTIONS: Record<ContentAssetType, string> = {
  posts:
    'Teste de POST do StudyQuest! ⚔️ O app de estudos gamificado que transforma sua rotina em uma aventura. #studyquest #pomodoro',
  reels:
    'Teste de REELS do StudyQuest! 🎬 Veja como gamificar seus estudos e farmar XP. #studyquest #reels #produtividade',
  stories:
    'Teste de STORY do StudyQuest! ⚡ Mantenha o foco e evolua seus estudos. #studyquest #stories',
};

const MEDIA_TYPE_BY_ASSET_TYPE: Record<
  ContentAssetType,
  'POST' | 'REELS' | 'STORY'
> = {
  posts: 'POST',
  reels: 'REELS',
  stories: 'STORY',
};

@Controller('instagram')
export class InstagramController {
  constructor(
    private readonly instagramService: InstagramService,
    private readonly mediaService: MediaService,
  ) {}

  @Post('test-publish/posts')
  async testPublishPost(@Body() body?: TestPublishBody) {
    return this.publishTestContent('posts', 'image', body);
  }

  @Post('test-publish/reels')
  async testPublishReels(@Body() body?: TestPublishBody) {
    return this.publishTestContent('reels', 'video', body);
  }

  @Post('test-publish/stories')
  async testPublishStories(@Body() body?: TestPublishBody) {
    return this.publishTestContent('stories', 'image', body);
  }

  @Post('test-publish')
  async testPublish(@Body() body?: TestPublishBody) {
    return this.publishTestContent('posts', 'image', body);
  }

  private async publishTestContent(
    type: ContentAssetType,
    expectedKind: ContentAssetKind,
    body?: TestPublishBody,
  ) {
    const mediaType = MEDIA_TYPE_BY_ASSET_TYPE[type];
    const caption = ensurePlayStoreCta(
      body?.caption?.trim() || DEFAULT_CAPTIONS[type],
      mediaType,
      process.env.PLAYSTORE_APP_URL,
    );
    const asset = await this.mediaService.selectNextContentAsset(
      type,
      expectedKind,
    );

    let mediaId: string;

    switch (type) {
      case 'posts':
        mediaId = await this.instagramService.publishPhoto(
          asset.publicUrl,
          caption,
        );
        break;
      case 'reels':
        mediaId = await this.instagramService.publishReels(
          asset.publicUrl,
          caption,
        );
        break;
      case 'stories':
        mediaId = await this.instagramService.publishStory(
          asset.publicUrl,
          caption,
        );
        break;
    }

    return {
      success: true,
      mediaType,
      assetType: type,
      assetKind: asset.kind,
      mediaUrl: asset.publicUrl,
      mediaId,
      caption,
      publishedAt: new Date().toISOString(),
    };
  }
}
