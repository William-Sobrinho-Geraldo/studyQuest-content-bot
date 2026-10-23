import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AiModule } from './modules/ai/ai.module.js';
import { InstagramModule } from './modules/instagram/instagram.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { SchedulerModule } from './modules/scheduler/scheduler.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    InstagramModule,
    SchedulerModule,
    AiModule,
    MediaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
