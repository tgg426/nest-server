import { Module } from '@nestjs/common';
import { AbortRedisService } from './abort-redis.service';
import { AbortService } from './abort.service';

@Module({
  providers: [AbortRedisService, AbortService],
  exports: [AbortService, AbortRedisService], // 导出供 ChatModule 使用
})
export class AbortModule {}
