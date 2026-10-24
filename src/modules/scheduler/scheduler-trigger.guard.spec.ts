import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerTriggerGuard } from './scheduler-trigger.guard.js';

function createContext(
  headers: Record<string, string> = {},
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

function createGuard(token?: string): SchedulerTriggerGuard {
  const configService = {
    get: () => token,
  } as unknown as ConfigService;

  return new SchedulerTriggerGuard(configService);
}

describe('SchedulerTriggerGuard', () => {
  it('allows requests when no token is configured', () => {
    const guard = createGuard();

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows requests with the configured token', () => {
    const guard = createGuard('secret-token');

    expect(
      guard.canActivate(
        createContext({ 'x-scheduler-token': 'secret-token' }),
      ),
    ).toBe(true);
  });

  it('rejects requests without the configured token', () => {
    const guard = createGuard('secret-token');

    expect(() => guard.canActivate(createContext())).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects requests with an invalid token', () => {
    const guard = createGuard('secret-token');

    expect(() =>
      guard.canActivate(createContext({ 'x-scheduler-token': 'wrong-token' })),
    ).toThrow(UnauthorizedException);
  });
});
