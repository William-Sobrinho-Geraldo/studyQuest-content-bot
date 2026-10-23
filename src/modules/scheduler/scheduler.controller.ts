import { Controller, Param, Post } from '@nestjs/common';
import {
  SchedulerService,
  type ManualPublishResult,
} from './scheduler.service.js';

@Controller('scheduler')
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Post('trigger/:type')
  async triggerManualPublish(
    @Param('type') type: string,
  ): Promise<ManualPublishResult> {
    return this.schedulerService.triggerManualPublish(type);
  }
}
