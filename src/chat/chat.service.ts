import { Injectable } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { uploadFileListType, MessagesType } from './chat';
import { Response } from 'express';
import { Fileanagement } from '../fileanagement/fileanagement.schema';
import { FileanagementService } from '../fileanagement/fileanagement.service';
import { InjectModel } from '@nestjs/mongoose';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { ChatData } from './chat.schema';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import { medAssistantDataPrompt, medelVlPrompt } from './roleDefinition';
import { toolsData } from './tools';
// 创建请求对话的终止控制器
// const controllerMap = new Map<string, AbortController>();
import { controllerMap } from '../abort/controller-map';
import { AbortService } from '../abort/abort.service';
import { MyLogger } from '../../utils/no-timestamp-logger';
import { readFileSync } from 'fs';
// import { Stream } from 'openai/streaming';
// mcp工具
import { McpService } from '../mcp/mcp.service';
// 调用的工具类型
type ToolType = 'knowledge' | 'bailian_web_search' | 'null' | undefined;

@Injectable()
export class ChatService {
  private openai: OpenAI;
  private readonly logger = new MyLogger(); //初始化·
  constructor(
    @InjectModel(Fileanagement.name)
    private fileanagementModel: Model<Fileanagement>,

    @InjectRedis()
    private readonly redis: Redis,

    @InjectModel(ChatData.name)
    private chatDataModel: Model<ChatData>,

    private configService: ConfigService,
    private fileanagementService: FileanagementService,

    private readonly abortService: AbortService,
    // mcp工具
    private readonly mcpService: McpService,
  ) {
    // 通义千问
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('TONGYI_AKI_KEY') as string,
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
  }
  // 通知流
  notifStream(stream: Response, streamData: any) {
    // 用于将数据分块（chunk）写入到响应体中)
    stream.write(JSON.stringify(streamData) + '###ABC###'); //###ABC###用于前端处理重叠
  }
  // 根据文档id查询文件管理数据库
  async queryFile(userId: any, docId: Types.ObjectId[]) {
    const fileData = await this.fileanagementModel
      .find({
        userId,
        _id: { $in: docId },
      })
      .select('fileText fileName fileSize fileType');
    return {
      uploadFileList: fileData.map((item) => ({
        fileName: item.fileName,
        fileSize: item.fileSize,
        fileType: item.fileType,
        docId: item._id.toString(),
      })),
      documents: fileData.map((item) => item.fileText),
    };
  }
  // 发送给模型之前需要整合对话结构
  async combineConvo(
    userId: Types.ObjectId, //用户id
    sessionId: Types.ObjectId | 'null', //会话id
    content: string, //用户的问题
    uploadFileList: uploadFileListType[] | undefined, //上传的文件列表
    stream: Response, //流式响应对象
    isKnowledgeBased: ToolType, //是否需要调用制定工具
    uploadImageList: MessagesType['uploadImageList'] | undefined, //携带的图片
  ) {
    // 组合对话字段：用户发送给模型的对话字段类型
    const messages: MessagesType = {
      role: 'user',
      content,
    };
    // 阅读的文件列表：最后需要交给大模型的回复里
    let readFileList: MessagesType['readFileData'] | undefined;
    // 防止用户传递错参数
    const allowed = ['null', 'knowledge', 'bailian_web_search'];
    if (!allowed.includes(isKnowledgeBased as any)) {
      isKnowledgeBased = 'null';
    }
    // 判断用户是否携带文档
    if (uploadFileList && uploadFileList.length > 0) {
      // 如果用户上传文档，禁止调用工具
      isKnowledgeBased = 'null';
      // 正在阅读文档
      this.notifStream(stream, {
        type: 'readDocument',
        statusInfo: 'inProgress',
        promptInfo: '正在阅读文档',
        fileList: [],
      });
      // 根据文档id查询文档内容
      const docIdArr = uploadFileList.map((item) => item.docId); //['xx','xxx']
      const docId = docIdArr.map((id) => new Types.ObjectId(id));
      const res = await this.queryFile(userId, docId);
      // 拼接文档内容：交给大模型
      const documentContent = res.documents.join('\n\n---\n\n');
      messages.content = `用户上传的文档内容如下:\n${documentContent}\n请基于文档内容回复用户问题:${content}`;
      // 取出原始问题
      messages.displayContent = content;
      // 取出文件列表数据
      messages.uploadFileList = res.uploadFileList;
      // 阅读的文件列表：最后需要交给大模型的回复里
      readFileList = {
        type: 'readDocument',
        statusInfo: 'completed',
        promptInfo: '文档阅读完毕',
        fileList: res.uploadFileList.map((item) => item.fileName),
      };
    }
    // 如果用户携带图片，禁止调用工具
    if (uploadImageList && Object.keys(uploadImageList).length > 0) {
      isKnowledgeBased = 'null';
      messages.uploadImageList = uploadImageList;
      // console.log('携带图片了');
      // console.log(uploadImageList);
    }
    // ---------------------请求数据库：获取历史对话，组合上下文，让模型有记忆能力-----------
    // 需要发送的模型的对话列表：历史对话+当前对话
    let historyConvoList: MessagesType[] = [];
    // 判断是否初次对话，新创建对话
    if (sessionId === 'null') {
      historyConvoList.push(messages);
    } else {
      // 查询redis是否有对话记录，有就使用redis，否则使用mongodb
      const redisKey = `chat_history:${userId}:${sessionId}`;
      const cachedData = await this.redis.get(redisKey);
      if (cachedData) {
        // redis里对话数据，那就直接取出来
        historyConvoList = JSON.parse(cachedData);
      } else {
        // redis没有数据，那就从mongodb取数据
        const chatData = await this.chatDataModel.find({
          userId,
          _id: sessionId,
        });
        historyConvoList = chatData[0].chatList || [];
        // 存储进redis,3个小时过期
        await this.redis.set(
          redisKey,
          JSON.stringify(historyConvoList),
          'EX',
          10800,
        );
      }
      // 把当前用户的问题加入历史对话的最后一项
      historyConvoList.push(messages);
    }
    // 调用模型
    this.modelResult(
      historyConvoList.splice(-21), //取最近的21条对话数据
      userId.toString(),
      stream,
      sessionId,
      readFileList,
      uploadFileList,
      isKnowledgeBased,
      uploadImageList,
    );
  }
  // 调用模型，文本模型
  async callingModel(
    messageList: MessagesType[],
    isKnowledgeBased?: ToolType,
    controller?: AbortController,
  ) {
    // 判断工具调用
    let tool_choice: any = 'none';
    if (isKnowledgeBased) {
      tool_choice =
        isKnowledgeBased === 'null'
          ? 'none'
          : { type: 'function', function: { name: isKnowledgeBased } };
    }
    // console.log('判断工具调用', tool_choice);

    // 获取联网搜索工具数据
    const webSearchTool = this.mcpService.getTools();
    const res = await this.openai.chat.completions.create(
      {
        model: 'qwen3-max',
        messages: [
          { role: 'system', content: medAssistantDataPrompt },
          ...messageList,
        ],
        stream: true,
        tools: [...toolsData, ...webSearchTool],
        tool_choice: tool_choice,
      }, //isKnowledgeBased:选择调用工具'knowledge':知识库 | 'bailian_web_search':联网搜索 | 'null':没有工具调用
      { signal: controller?.signal }, //中断模型输出
    );
    return res;
  }
  // 多模态模型
  async modelVlRes(
    messageList: MessagesType[],
    imageUrlObj: any,
    controller?: AbortController,
  ) {
    const res = await this.openai.chat.completions.create(
      {
        model: 'qwen-vl-max-latest',
        messages: [
          { role: 'system', content: medelVlPrompt },
          {
            role: 'user',
            content: [
              imageUrlObj,
              {
                type: 'text',
                text: messageList[messageList.length - 1].content,
              },
            ],
          },
        ],
        stream: true,
      },
      { signal: controller?.signal }, //中断模型输出
    );
    return res;
  }
  // 模型输出结果
  async modelResult(
    messageList: MessagesType[],
    userId: string,
    stream: Response,
    sessionId: Types.ObjectId | 'null' | undefined,
    readFileList: MessagesType['readFileData'] | undefined,
    uploadFileList: uploadFileListType[] | undefined,
    isKnowledgeBased: ToolType,
    uploadFileImage: MessagesType['uploadImageList'] | undefined, //携带的图片
  ) {
    const controller = new AbortController();
    // sessionId && sessionId !== 'null' ? sessionId.toString() : 'null' + 'abc';
    const userSessionId = sessionId ? sessionId.toString() : 'null';
    console.log('调用模型传入了会话id' + userSessionId);
    // console.log(messageList);
    controllerMap.set(userSessionId, controller);
    try {
      // 临时存储模型结果
      let res;
      // 判断是否该调用多模态模型
      if (uploadFileImage && Object.keys(uploadFileImage).length > 0) {
        // 图片，转换base64格式
        const imageUrlObj = this.encodeImage(
          uploadFileImage.imagePath,
          uploadFileImage.mimetype,
        );
        res = await this.modelVlRes(messageList, imageUrlObj, controller);
      } else {
        res = await this.callingModel(
          messageList,
          isKnowledgeBased,
          controller,
        );
      }
      // 如果用户携带文档对话，在这里返回前端
      if (uploadFileList && uploadFileList.length > 0) {
        this.notifStream(stream, readFileList);
      }
      // 工具参数
      let toolCallArgsStr = '';
      // 工具名称
      let toolName = '';
      // 标记工具是否开始调用
      let isToolCallStarted = false;
      // 模型回复的完整内容
      let assistantMessage = '';
      // 迭代
      if (!res) return false;
      for await (const chunk of res) {
        // console.log('模型输出----------');
        const chunObj = chunk.choices[0].delta;
        // console.log(JSON.stringify(chunObj));
        // 判断用户是否选择工具调用
        if (chunObj.tool_calls && chunObj.tool_calls[0].function?.name) {
          // 获取工具名称
          toolName += chunObj.tool_calls[0].function.name;
        }
        if (chunObj.tool_calls && chunObj.tool_calls[0].function?.arguments) {
          // 获取工具参数
          toolCallArgsStr += chunObj.tool_calls[0].function.arguments;
          isToolCallStarted = true;
        }
        // 判断工具回复结束，处理新问题
        if (chunk.choices[0].finish_reason === 'stop' && isToolCallStarted) {
          console.log('工具回复结束');
          // console.log(toolCallArgsStr, '----------', toolName);
          // 判断该调用哪个工具
          if (toolName === 'bailian_web_search') {
            console.log('触发联网搜索');
            // this.webSearchModel()
            const lastItem = messageList[messageList.length - 1];
            const res = await this.webSearchModel(
              toolName, //工具名称
              toolCallArgsStr, //工具参数
              stream,
              lastItem.content,
              messageList,
              readFileList,
              controller,
            );
            assistantMessage = res.assistantMessage;
            readFileList = res.readFileList;
          }
          if (toolName === 'knowledge') {
            console.log('触发知识库');
            let newUserContent = ''; //用户新问题
            // 调用知识库
            const newQuestion = JSON.parse(toolCallArgsStr) as {
              clarified_question: string;
            };
            if (
              newQuestion &&
              typeof newQuestion === 'object' &&
              'clarified_question' in newQuestion &&
              newQuestion.clarified_question.trim() !== ''
            ) {
              newUserContent = newQuestion.clarified_question;
            } else {
              // 工具没有生成新问题
              const lastItem = messageList[messageList.length - 1];
              newUserContent = lastItem.content;
            }
            // 查询知识库
            const res = await this.queryKb(
              stream,
              newUserContent,
              userId,
              messageList,
              readFileList,
              controller,
            );
            assistantMessage = res.assistantMessage;
            readFileList = res.readFileList;
          }
        }
        // 用户没有选择知识库按钮和联网搜索
        if (chunObj.content) {
          console.log('用户没有选择知识库按钮和联网搜索--------');
          const returnRes = {
            role: 'assistant',
            content: chunk.choices[0].delta.content,
          };
          this.notifStream(stream, returnRes);
          // 合并模型消息
          assistantMessage += chunk.choices[0].delta.content || '';
        }
      }
      // return false;
      // ----------------------存储对话记录到数据库------------------
      // 模型回复的数据结构
      const assistantMessageObj: MessagesType = {
        role: 'assistant',
        content: assistantMessage,
        ...(readFileList && { readFileData: readFileList }),
      };
      //整理一轮新的对话，
      const convoPair: MessagesType[] = [
        messageList[messageList.length - 1],
        assistantMessageObj,
      ];
      // 存储数据库
      if (sessionId == 'null') {
        // 新创建的对话
        const newChat = await this.chatDataModel.create({
          userId,
          chatList: convoPair,
        });
        // ---同步更新redis
        const redisKey = `chat_history:${userId}:${newChat._id}`;
        await this.redis.set(redisKey, JSON.stringify(convoPair), 'EX', 10800);
        // 返回会话id给前端
        this.notifStream(stream, {
          role: 'sessionId',
          content: newChat._id,
          modelPrompt: '新会话已创建，请保存会话id',
        });
      } else {
        // 不是新对话，是在历史对话上接着询问的
        await this.chatDataModel.updateOne(
          { userId, _id: sessionId },
          { $push: { chatList: { $each: convoPair } } },
        );
        // ---同步更新redis
        const redisKey = `chat_history:${userId}:${sessionId}`;
        const cachedData = (await this.redis.get(redisKey)) as string;
        const parsedHistory: MessagesType[] = JSON.parse(cachedData);
        const updatedHistory = [...parsedHistory, ...convoPair];
        await this.redis.set(
          redisKey,
          JSON.stringify(updatedHistory),
          'EX',
          10800,
        );
      }
    } catch (error) {
      // console.log('调用模型出错');
      // console.log(error);
      this.logger.error('模型回复出错' + error);
      this.notifStream(stream, {
        role: 'error',
        content: error,
        modelPrompt: '模型回复出错',
      });
    } finally {
      // 告知前端通知流结束
      console.log('模型回复完毕');
      stream.end();
      controllerMap.delete(userSessionId);
    }
  }
  // 根据用户问题，检索知识库
  async queryKb(
    stream: Response,
    userQuestion: string,
    userId: string,
    messageList: MessagesType[],
    readFileList: MessagesType['readFileData'] | undefined,
    controller: AbortController,
  ) {
    // 告知前端用户正在检索知识库
    this.notifStream(stream, {
      type: 'queryKB',
      statusInfo: 'inProgress',
      promptInfo: '正在检索知识库',
      fileList: [],
    });
    // 将用户问题转换为向量
    const vectorUserQuestion = await this.fileanagementService.embeddingsAliyun(
      [{ pageContent: userQuestion }],
    );
    // 查询向量数据库
    const searchResults = await this.fileanagementService.searchDatabase(
      userId,
      userQuestion,
      vectorUserQuestion[0].embedding,
    );
    // 取最后一项对话
    const lastItem = messageList[messageList.length - 1];
    // 用户原始问题
    lastItem['displayContent'] = lastItem.content;
    // 用户问题和文档内容
    lastItem.content = searchResults.searchDocText;
    // 告知前端用户知识库检索完毕
    readFileList = {
      type: 'queryKB',
      statusInfo: 'completed',
      promptInfo: `为你检索到${searchResults.searchDocTitle.length}篇知识库`,
      fileList: searchResults.searchDocTitle,
    };
    this.notifStream(stream, readFileList);
    // 模型回复的完成内容
    let assistantMessage = '';
    // 再次调用模型回复用户
    const res2 = await this.callingModel(messageList, 'null', controller);
    for await (const chunk2 of res2) {
      const returnRes = {
        role: 'assistant',
        content: chunk2.choices[0].delta.content,
      };
      this.notifStream(stream, returnRes);
      // 合并模型消息
      assistantMessage += chunk2.choices[0].delta.content || '';
    }
    return {
      assistantMessage,
      readFileList,
    };
  }
  // 获取对话列表
  async getChatList(userId: string) {
    const res = await this.chatDataModel.aggregate([
      { $match: { userId } },
      {
        $project: {
          sessionId: '$_id',
          _id: 0,
          createTime: 1,
          chatList: {
            $map: {
              input: { $slice: ['$chatList', 1] },
              as: 'item',
              in: {
                content: {
                  $ifNull: ['$$item.displayContent', '$$item.content'],
                },
              },
            },
          },
        },
      },
      { $sort: { createTime: -1 } },
      { $unwind: '$chatList' },
      {
        $project: {
          sessionId: 1,
          content: '$chatList.content',
        },
      },
    ]);
    return { result: res, message: 'SUCCESS' };
  }
  // 获取某个会话的对话数据
  async singleChatData(userId: string, sessionId: string) {
    // 存储要返回的对话数据
    let singleChatData: MessagesType[] = [];
    // 先查询redis是否有
    const redisKey = `chat_history:${userId}:${sessionId}`;
    const cachedData = await this.redis.get(redisKey);
    if (cachedData) {
      singleChatData = JSON.parse(cachedData);
    } else {
      // 从mongodb请求
      const chatData = await this.chatDataModel.find({
        userId,
        _id: sessionId,
      });
      singleChatData = chatData[0].chatList;
      await this.redis.set(
        redisKey,
        JSON.stringify(singleChatData),
        'EX',
        10800,
      );
    }
    return { result: singleChatData, message: 'SUCCESS' };
  }
  // 终止模型输出
  stopOutput(sessionId: string) {
    return this.abortService.stopOutput(sessionId);
    // pub.publish('abort-signal', sessionId);
    // return { result: [], message: '会话已经终止' };
    // const controller = controllerMap.get(sessionId);
    // console.log('终止模型的会话' + JSON.stringify(controller));
    // if (controller) {
    //   console.log('判断进来');
    //   controller.abort(); //停止生成
    //   stream.end();
    //   console.log('终止模型输出');
    //   controllerMap.delete(sessionId);
    //   return { result: [], message: '会话已经终止' };
    // } else {
    //   return { result: [], message: '会话没有找到，停止生成失败' };
    // }
  }
  // 删除指定对话
  async deleteChat(sessionId: string, userId: string) {
    await this.chatDataModel.deleteMany({ _id: sessionId, userId });
    return { result: [], message: '删除成功' };
  }
  // 将图片处理为base64编码
  encodeImage(imagePath: string, mimetype: string) {
    const imageFile = readFileSync(imagePath);
    const base64Image = imageFile.toString('base64');
    return {
      type: 'image_url',
      image_url: { url: `data:${mimetype};base64,${base64Image}` },
    };
  }
  // 调用mcp工具返回结果
  mcpResult(toolResult: any) {
    // 判断是否返回结果
    let searchResult = { title: [], snippet: '' } as {
      title: string[];
      snippet: string;
    };
    if (toolResult.content && toolResult.content[0].text) {
      const text = JSON.parse(toolResult.content[0].text);
      type PagesType = {
        snippet: string;
        title: string;
      }[];
      const pages = text.pages as PagesType;
      if (text.pages.length > 0) {
        // 存在数据
        // 取出网页标题和网页结果，
        pages.forEach((item, index) => {
          searchResult.title.push(item.title);
          searchResult.snippet += `第${index + 1}篇文章\n\n${item.snippet}\n\n`;
        });
        return searchResult;
      } else {
        // 不存在数据
        return (searchResult = { title: [], snippet: '没有搜索到内容' });
      }
    } else {
      // 不存在数据
      return (searchResult = { title: [], snippet: '没有搜索到内容' });
    }
  }
  // 根据用户问题，联网搜索
  async webSearchModel(
    toolName: string, //工具名称
    toolCallArgsStr: string, //工具参数
    stream: Response,
    userQuestion: string,
    messageList: MessagesType[],
    readFileList: MessagesType['readFileData'] | undefined,
    controller: AbortController,
  ) {
    // 告知前端用户正在联网搜索
    this.notifStream(stream, {
      type: 'queryKB',
      statusInfo: 'inProgress',
      promptInfo: '正在联网搜索',
      fileList: [],
    });
    // 调用联网搜索
    const mcpQuery = { query: JSON.parse(toolCallArgsStr).query };
    const toolResult: any = await this.mcpService.callTool(toolName, mcpQuery);
    // console.log(toolResult);
    // 判断是否返回网络搜索结果
    const mcpResult = this.mcpResult(toolResult);
    // 取最后一项对话
    const lastItem = messageList[messageList.length - 1];
    // 用户原始问题
    lastItem['displayContent'] = lastItem.content;
    // 用户问题和网络内容组合，需要交给模型处理
    lastItem.content = `请根据联网查询到的内容回复用户问题,用户问题:${userQuestion};\n查询到的网络内容::${mcpResult.snippet}`;
    // 告知前端用户联网搜索完毕
    readFileList = {
      type: 'queryKB',
      statusInfo: 'completed',
      promptInfo: `搜索到${mcpResult.title.length}篇网络内容`,
      fileList: mcpResult.title,
    };
    this.notifStream(stream, readFileList);
    // 模型回复的完成内容
    let assistantMessage = '';
    // 再次调用模型回复用户
    const res2 = await this.callingModel(messageList, 'null', controller);
    for await (const chunk2 of res2) {
      const returnRes = {
        role: 'assistant',
        content: chunk2.choices[0].delta.content,
      };
      this.notifStream(stream, returnRes);
      // 合并模型消息
      assistantMessage += chunk2.choices[0].delta.content || '';
    }
    return {
      assistantMessage,
      readFileList,
    };
  }
}
