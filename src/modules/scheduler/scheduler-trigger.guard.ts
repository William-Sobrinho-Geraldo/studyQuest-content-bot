import { timingSafeEqual } from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

const TOKEN_HEADER = 'x-scheduler-token';

@Injectable()
export class SchedulerTriggerGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expectedToken = this.configService
      .get<string>('SCHEDULER_TRIGGER_TOKEN')
      ?.trim();

    if (!expectedToken) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const headerValue = request.headers[TOKEN_HEADER];
    const providedToken = Array.isArray(headerValue)
      ? headerValue[0]
      : headerValue;

    if (!providedToken || !this.matches(providedToken, expectedToken)) {
      throw new UnauthorizedException('Invalid scheduler trigger token.');
    }

    return true;
  }

  private matches(providedToken: string, expectedToken: string): boolean {
    const provided = Buffer.from(providedToken);
    const expected = Buffer.from(expectedToken);

    return (
      provided.length === expected.length && timingSafeEqual(provided, expected)
    );
  }
}
