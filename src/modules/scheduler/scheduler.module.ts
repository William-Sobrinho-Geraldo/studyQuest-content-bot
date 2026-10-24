import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { InstagramModule } from '../instagram/instagram.module.js';
import { MediaModule } from '../media/media.module.js';
import { SchedulerController } from './scheduler.controller.js';
import { SchedulerTriggerGuard } from './scheduler-trigger.guard.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  imports: [InstagramModule, AiModule, MediaModule],
  controllers: [SchedulerController],
  providers: [SchedulerService, SchedulerTriggerGuard],
  exports: [SchedulerService],
})
export class SchedulerModule {}
