import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { ChatCompletionTool } from 'openai/resources/chat/completions';
import { ConfigService } from '@nestjs/config';
// 阿里云联网搜索mcp
const MCP_SERVER_URL = new URL(
  'https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/sse',
);
const TOKEN = ''; // token

@Injectable()
export class McpService implements OnModuleInit {
  private client: Client;
  private tools: ChatCompletionTool[] = [];
  constructor(private configService: ConfigService) {}
  async onModuleInit() {
    await this.init();
  }

  private async init() {
    const token = this.configService.get<string>('TONGYI_AKI_KEY') as string;
    const transport = new SSEClientTransport(MCP_SERVER_URL, {
      requestInit: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });
    // 实例
    this.client = new Client({
      name: 'WebSearch',
      version: '1.0.0',
    });
    await this.client.connect(transport);
    // 获取工具列表
    const toolListResult = await this.client.listTools();
    // 重新整理千问需要的工具数据结构
    this.tools = toolListResult.tools.map((item) => ({
      type: 'function',
      function: {
        name: item.name,
        description: item.description,
        parameters: item.inputSchema,
      },
    }));
    console.log('服务器返回工具列表：', this.tools);
  }
  // 服务里使用
  getTools() {
    return this.tools;
  }
  // 请求mcp数据
  async callTool(name: string, argumentsObj: any) {
    console.log('mcp参数');
    console.log(name);
    console.log(argumentsObj);
    try {
      return await this.client.callTool({
        name,
        arguments: argumentsObj,
      });
    } catch (err: any) {
      console.warn('调用失败，尝试重连');
      try {
        await this.init(); // 重连
        return await this.client.callTool({
          name,
          arguments: argumentsObj,
        });
      } catch (retryErr) {
        console.error('MCP 重试失败');
        return {
          success: false,
          error: 'MCP_TOOL_FAILED',
          message: '联网搜索暂时不可用',
        };
      }
    }
  }
}
