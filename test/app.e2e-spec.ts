import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

const EXPECTED_CRON_JOBS = [
  'story-morning',
  'post-lunch',
  'story-afternoon',
  'post-evening',
  'test-story-morning',
  'test-story-imminent',
  'test-post-afternoon',
  'test-story-late-afternoon',
  'test-post-night',
];

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      timezone: 'America/Sao_Paulo',
    });
    expect(response.body.timestamp).toEqual(expect.any(String));
    expect(response.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('should keep all expected cron jobs registered', () => {
    const schedulerRegistry = app.get(SchedulerRegistry);
    const registeredJobs = schedulerRegistry.getCronJobs();

    for (const jobName of EXPECTED_CRON_JOBS) {
      expect(registeredJobs.has(jobName)).toBe(true);
    }
  });

  afterEach(async () => {
    await app.close();
  });
});
