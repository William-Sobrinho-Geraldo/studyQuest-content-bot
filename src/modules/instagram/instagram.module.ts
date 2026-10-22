import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { InstagramController } from './instagram.controller.js';
import { InstagramService } from './instagram.service.js';

@Module({
  imports: [
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
