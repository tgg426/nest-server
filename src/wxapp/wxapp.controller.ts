import { Controller, Get, Req } from '@nestjs/common';
import { WxappService } from './wxapp.service';
import { Request } from 'express';

@Controller('wxapp')
export class WxappController {
  constructor(private readonly wxappService: WxappService) {}
  // 导入小程序的首页数据
  @Get('importwxdata')
  async importWxData(@Req() req: Request) {
    const host = req.headers.host as string; // 如：127.0.0.1:300
    console.log('Host:', host);
    return await this.wxappService.importWxData();
  }
  // 获取小程序端首页数据
  @Get('wxfrontpagedata')
  async wxFrontPageData() {
    return await this.wxappService.wxFrontPageData();
  }
}
