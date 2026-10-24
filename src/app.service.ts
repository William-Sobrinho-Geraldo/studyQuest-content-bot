import { Injectable } from '@nestjs/common';

const HEALTH_TIME_ZONE = 'America/Sao_Paulo';

export interface HealthStatus {
  status: 'ok';
  timestamp: string;
  uptimeSeconds: number;
  timezone: string;
}

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  getHealth(): HealthStatus {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      timezone: HEALTH_TIME_ZONE,
    };
  }
}
