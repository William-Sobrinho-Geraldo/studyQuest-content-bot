import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('should return an ok health status', () => {
      const health = appController.getHealth();

      expect(health.status).toBe('ok');
      expect(health.timestamp).toEqual(expect.any(String));
      expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(health.timezone).toBe('America/Sao_Paulo');
    });
  });
});
