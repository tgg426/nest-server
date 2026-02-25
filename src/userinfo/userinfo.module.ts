import { Module } from '@nestjs/common';
import { UserinfoController } from './userinfo.controller';
import { UserinfoService } from './userinfo.service';
import { UserInfoSchema, UserInfo } from './userinfo.schema';
import { MongooseModule } from '@nestjs/mongoose';
@Module({
  // 注册mongodb的数据模型
  imports: [
    // UserInfo.name得到的是class名称：UserInfo
    MongooseModule.forFeature([
      { name: UserInfo.name, schema: UserInfoSchema },
    ]),
  ],
  controllers: [UserinfoController],
  providers: [UserinfoService],
})
export class UserinfoModule {}
