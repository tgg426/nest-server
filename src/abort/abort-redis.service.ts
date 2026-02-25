import { Injectable } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';

@Injectable()
export class AbortRedisService {
  constructor(@InjectRedis() private readonly redisClient: Redis) {}

  getPubClient(): Redis {
    return this.redisClient;
  }

  getSubClient(): Redis {
    // 为避免 Redis 重用发布连接，可新建订阅连接（仍复用配置）
    return new Redis({
      host: this.redisClient.options.host as string,
      port: this.redisClient.options.port as number,
      password: this.redisClient.options.password as string,
    });
  }
}
