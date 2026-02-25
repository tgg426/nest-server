import { Injectable } from '@nestjs/common';
import { AbortRedisService } from './abort-redis.service';

@Injectable()
export class AbortService {
  constructor(private readonly redisService: AbortRedisService) {}

  async stopOutput(sessionId: string) {
    const pub = this.redisService.getPubClient();
    await pub.publish('abort-signal', sessionId);
    return { message: '终止信号已广播' };
  }
}
