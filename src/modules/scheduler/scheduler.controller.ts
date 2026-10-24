import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { SchedulerTriggerGuard } from './scheduler-trigger.guard.js';
import {
  SchedulerService,
  type ManualPublishResult,
} from './scheduler.service.js';

@Controller('scheduler')
@UseGuards(SchedulerTriggerGuard)
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Post('trigger/:type')
  async triggerManualPublish(
    @Param('type') type: string,
  ): Promise<ManualPublishResult> {
    return this.schedulerService.triggerManualPublish(type);
  }
}
