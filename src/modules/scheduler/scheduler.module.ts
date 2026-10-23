import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { InstagramModule } from '../instagram/instagram.module.js';
import { MediaModule } from '../media/media.module.js';
import { SchedulerController } from './scheduler.controller.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  imports: [InstagramModule, AiModule, MediaModule],
  controllers: [SchedulerController],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
