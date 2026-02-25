// redis-logger.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class RedisLoggerService implements OnModuleInit {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  onModuleInit() {
    this.redis.on('ready', () => {
      console.log('✅ Redis 连接成功');
    });
    this.redis.on('error', (error) => {
      console.error('❌ Redis 连接失败:', error.message);
    });
  }
}
