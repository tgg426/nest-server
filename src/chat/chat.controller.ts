import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SendMessageQueryDto, SingleChatCataDto } from './chat.dto';
import { ChatService } from './chat.service';
import { Types } from 'mongoose';
import { Response } from 'express';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}
  // 用户发送消息
  @Post('sendmessage')
  @UseGuards(AuthGuard)
  async sendMessage(
    @Req() req: { user: { token: string } },
    @Body() body: SendMessageQueryDto,
    @Res() stream: Response,
  ) {
    console.log('8888');
    const {
      content,
      uploadFileList,
      sessionId,
      isKnowledgeBased,
      uploadImageList,
    } = body;
    console.log('body参数，是否携带图片');
    console.log(uploadImageList);
    const userId = new Types.ObjectId(req.user.token);
    await this.chatService.combineConvo(
      userId,
      sessionId,
      content,
      uploadFileList,
      stream,
      isKnowledgeBased,
      uploadImageList,
    );
  }
  // 获取对话列表
  @Get('getchatlist')
  @UseGuards(AuthGuard)
  async getChatList(@Req() req: { user: { token: string } }) {
    return await this.chatService.getChatList(req.user.token);
  }
  // 获取某个会话的对话数据
  @Get('singlechatdata')
  @UseGuards(AuthGuard)
  async singleChatData(
    @Req() req: { user: { token: string } },
    @Query() query: SingleChatCataDto,
  ) {
    const { sessionId } = query;
    return await this.chatService.singleChatData(req.user.token, sessionId);
  }
  // 终止模型的输出
  @Get('stopoutput')
  @UseGuards(AuthGuard)
  stopOutput(
    @Req() req: { user: { token: string } },
    @Query() query: SingleChatCataDto,
  ) {
    const { sessionId } = query;
    return this.chatService.stopOutput(sessionId);
  }
  //删除指定对话
  @Get('deletechat')
  @UseGuards(AuthGuard)
  deleteChat(
    @Req() req: { user: { token: string } },
    @Query() query: SingleChatCataDto,
  ) {
    const { sessionId } = query;
    return this.chatService.deleteChat(sessionId, req.user.token);
  }
}
