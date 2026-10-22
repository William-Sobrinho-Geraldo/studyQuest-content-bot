import { Module } from '@nestjs/common';
import { InstagramModule } from '../instagram/instagram.module.js';
import { SchedulerController } from './scheduler.controller.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  imports: [InstagramModule],
  controllers: [SchedulerController],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
