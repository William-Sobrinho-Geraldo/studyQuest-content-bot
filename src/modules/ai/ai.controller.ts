import { Body, Controller, Post } from '@nestjs/common';
import {
  AiService,
  type ContentMediaType,
  type ContentPlan,
} from './ai.service.js';

interface GenerateContentBody {
  topic?: string;
  mediaType?: ContentMediaType;
}

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('generate')
  async generate(@Body() body?: GenerateContentBody): Promise<ContentPlan> {
    return this.aiService.generateContentPlan(body?.topic, body?.mediaType);
  }
}
