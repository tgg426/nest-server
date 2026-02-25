import { Module, OnModuleInit } from '@nestjs/common';
import { UserinfoModule } from './userinfo/userinfo.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { FileanagementModule } from './fileanagement/fileanagement.module';
import { ChatModule } from './chat/chat.module';
import { RedisModule } from '@nestjs-modules/ioredis';
import { RedisLoggerService } from './redis-logger.service';
import { WxappModule } from './wxapp/wxapp.module';
// import { McpModule } from './mcp/mcp.module';

@Module({
  imports: [
    // 加载环境变量
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // 连接mongodb数据库
    MongooseModule.forRootAsync({
      inject: [ConfigService], //先注入依赖
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
        serverSelectionTimeoutMS: 30000, //超时时间
        connectTimeoutMS: 30000, //tcp超时时间
        socketTimeoutMS: 30000, //套接字响应时间
      }),
    }),
    // 链接redis数据库
    RedisModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'single',
        options: {
          host: config.get<string>('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
          password: config.get<string>('REDIS_PASSWORD'),
          connectTimeout: 30000, // 连接超时，单位毫秒，1秒
          commandTimeout: 30000,
        },
      }),
    }),
    // 注册jwt模块,获取密钥
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: '10d' }, //10天之后登录失效，需要从新登录
      }),
    }),
    // 与用户相关的模块
    UserinfoModule,
    FileanagementModule,
    ChatModule,
    WxappModule,
  ],
  providers: [RedisLoggerService],
})
export class AppModule {}
