// 启动文件，它是整个应用的入口
//NestFactory，这是Nest提供的一个用于创建应用实例的工厂类。
import { NestFactory } from '@nestjs/core';
//根模块AppModule，这是Nest应用的起点，所有功能模块会被注册到这个模块中
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionFilter } from '../utils/all-exception.filter';
import { TransformInterceptor } from '../utils/transform.interceptor';
import { MyLogger } from '../utils/no-timestamp-logger';
import { listenAbortSignals } from './abort/abort.listener';
import { AbortRedisService } from './abort/abort-redis.service';
import { join } from 'path';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new MyLogger(),
  });
  // 把服务器本地的 uploads-image 文件夹暴露成一个可以通过 URL 访问的目录。
  // process.cwd()：获取当前运行项目的根目录
  // 用来拼接路径
  // express.static(uploadDir)：告诉 Express，
  // 这个文件夹是“静态资源目录”，里面的文件可以直接访问，不需要额外写路由
  // '/open-image'：设置访问 URL 前缀
  const uploadDir = join(process.cwd(), 'uploads-image');
  app.use('/open-image', express.static(uploadDir));
  //启动 HTTP 服务，监听端口
  app.setGlobalPrefix('api');
  const abortRedisService = app.get(AbortRedisService);
  await listenAbortSignals(abortRedisService);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, //自动去掉没有定义的字段
      forbidNonWhitelisted: true, //如果有多余的字段抛出错误
    }),
  );
  // 注册全局异常过滤器
  app.useGlobalFilters(new AllExceptionFilter());
  // 注册全局响应拦截器
  app.useGlobalInterceptors(new TransformInterceptor());
  // 允许跨域
  app.enableCors({
    origin: '*',
  });
  await app.listen(7005);
}
bootstrap();
