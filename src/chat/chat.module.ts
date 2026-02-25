import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { FileanagementModule } from 'src/fileanagement/fileanagement.module';
import { ChatData, ChatSchema } from './chat.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { AbortModule } from '../abort/abort.module'; // ✅ 引入模块
import { McpModule } from '../mcp/mcp.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ChatData.name, schema: ChatSchema }]),
    FileanagementModule,
    AbortModule,
    McpModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
