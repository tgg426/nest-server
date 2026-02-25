import { Module } from '@nestjs/common';
import { WxappController } from './wxapp.controller';
import { WxappService } from './wxapp.service';
import { WxApp, WxAppSchema } from './wxapp.schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: WxApp.name, schema: WxAppSchema }]),
  ],
  controllers: [WxappController],
  providers: [WxappService],
})
export class WxappModule {}
