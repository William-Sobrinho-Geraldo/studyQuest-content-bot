import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { InstagramController } from './instagram.controller.js';
import { InstagramService } from './instagram.service.js';

@Module({
  imports: [
    MediaModule,
    HttpModule.register({
      timeout: 10_000,
      maxRedirects: 5,
    }),
  ],
  controllers: [InstagramController],
  providers: [InstagramService],
  exports: [InstagramService],
})
export class InstagramModule {}
