import { BadRequestException, Injectable } from '@nestjs/common';
// 读取pdf
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
// 读取doc
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
// 文本拆分
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
// import { chromium } from 'playwright';
import { PlaywrightWebBaseLoader } from '@langchain/community/document_loaders/web/playwright';
import { Document } from '@langchain/core/documents';
import { Fileanagement } from './fileanagement.schema';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import {
  MilvusClient,
  DataType,
  WeightedRanker,
  SearchResultData,
} from '@zilliz/milvus2-sdk-node';
import { ConfigService } from '@nestjs/config';
import Openai from 'openai';
import * as path from 'path';
import * as fs from 'fs';
import { kwExtractionPrompt } from '../chat/roleDefinition';

@Injectable()
export class FileanagementService {
  private milvusclient: MilvusClient;
  private openai: Openai;
  constructor(
    @InjectModel(Fileanagement.name)
    private fileanagementModel: Model<Fileanagement>,
    private configService: ConfigService,
  ) {
    // 向量数据库连接
    this.milvusclient = new MilvusClient({
      address: this.configService.get<string>('MILVUS_ADDRESS') as string,
    });
    // 通义千问
    this.openai = new Openai({
      apiKey: this.configService.get<string>('TONGYI_AKI_KEY') as string,
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
  }
  //#region
  // 读取文档，知识库需要拆分文档，对话框上传的不拆分，'UD':对话框，'UB'知识库
  async readFile(file: Express.Multer.File, uploadType: 'UD' | 'UB') {
    // 判断文件类型
    const fileType = file.mimetype === 'application/pdf' ? 'PDF' : 'DOCX';
    // 1.读取文档
    const loader =
      fileType === 'PDF' ? new PDFLoader(file.path) : new DocxLoader(file.path);
    const docs = await loader.load();
    // console.log(docs);
    // 2.拆分文档（主要针对知识库上传的才拆分）
    const first = docs[0];
    for (let i = 1; i < docs.length; i++) {
      first.pageContent += '\n' + docs[i].pageContent;
    }
    // console.log(first);
    let splitDocument: Document<Record<string, any>>[] = [];
    if (uploadType === 'UB') {
      // 按字符拆分，
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 800, //每段的最大字符数
        chunkOverlap: 100, //每段之间的重叠字符数
      });
      splitDocument = await textSplitter.splitDocuments([first]);
    }
    return {
      mergeTexts: first.pageContent, //完整的文本
      splitDocument, //拆分的文档数组
    };
  }
  // 上传文件到数据库
  async uploadFile(
    file: Express.Multer.File,
    userId: string,
    fileText: string,
    uploadType: 'UD' | 'UB',
  ) {
    const fileType = file.mimetype === 'application/pdf' ? 'PDF' : 'DOCX';
    const docId = await this.fileanagementModel.create({
      userId,
      fileName: file.originalname,
      filePath: file.path,
      fileType,
      fileSize: `${(file.size / 1024).toFixed(2)}kb`,
      fileText,
      uploadType,
    });
    return docId._id;
  }
  // 创建集合
  async createCollection(collectionName: string) {
    const fields = [
      {
        name: 'id', //字段名称
        data_type: DataType.Int64, //字段类型
        is_primary_key: true, //是否是主键字段
        autoID: true, //是否自增
        description: '主键id字段',
      },
      {
        name: 'docId', //文档id
        data_type: DataType.VarChar,
        description: '文档id',
        max_length: 100,
      },
      {
        name: 'docTitle',
        data_type: DataType.VarChar,
        description: '文档标题',
        max_length: 500,
      },
      {
        name: 'docText',
        data_type: DataType.VarChar,
        description: '文档切块的片段',
        max_length: 9000,
      },
      {
        name: 'embedDocTitle',
        data_type: DataType.FloatVector,
        description: '向量的文档标题',
        dim: 1536, //维度
      },
      {
        name: 'embedDocText',
        data_type: DataType.FloatVector,
        description: '向量的文档内容片段',
        dim: 1536, //维度
      },
    ];
    // 创建索引
    const index_params = [
      {
        field_name: 'id',
        index_type: 'AUTOINDEX',
      },
      {
        field_name: 'docId',
        index_type: 'AUTOINDEX',
      },
      {
        field_name: 'docTitle',
        index_type: 'AUTOINDEX',
      },
      {
        field_name: 'embedDocTitle',
        index_type: 'AUTOINDEX',
        metric_type: 'COSINE', //余弦相似度
      },
      {
        field_name: 'embedDocText',
        index_type: 'AUTOINDEX',
        metric_type: 'COSINE', //余弦相似度
      },
    ];
    await this.milvusclient.createCollection({
      collection_name: collectionName, //不能以数字开头
      fields,
      index_params,
    });
    // 释放集合，以免占用内存
    await this.milvusclient.releaseCollection({
      collection_name: collectionName,
    });
  }
  // 阿里云向量数据
  async embeddingsAliyun(
    allSplits: Document<Record<string, any>>[] | [{ pageContent: string }],
  ) {
    const completion = await this.openai.embeddings.create({
      model: 'text-embedding-v2',
      input: allSplits.map((item) => item.pageContent), //['收拾收拾','dddddd']
      dimensions: 1536,
    });
    return completion.data;
  }
  // 插入数据：向量数据库
  async insertData(
    collectionName: string,
    originalname: string,
    docId: Types.ObjectId,
    data: Document<Record<string, any>>[],
    vectorsDocTitle: Openai.Embeddings.Embedding[],
    vectorsDocText: Openai.Embeddings.Embedding[],
  ) {
    const group = data.map((item, index) => ({
      docId: docId.toHexString(),
      docTitle: originalname,
      docText: item.pageContent,
      embedDocTitle: vectorsDocTitle[0].embedding,
      embedDocText: vectorsDocText[index].embedding,
    }));
    try {
      const res = await this.milvusclient.insert({
        collection_name: collectionName,
        data: group,
      });
      if (res.status.error_code === 'Success') {
        return '插入数据成功';
      } else {
        throw new BadRequestException(`插入向量数据库失败:${res}`);
      }
    } catch (error) {
      throw new BadRequestException(`插入向量数据库失败:${error}`);
    }
  }
  // 向量，向量存储
  async vectorStorage(
    file: Express.Multer.File,
    splitDocument: Document<Record<string, any>>[],
    userId: string,
    docId: Types.ObjectId,
  ) {
    // 集合名称
    const collectionName = `_${userId}`;
    // 1.判断集合是否创建
    const queryCollection = await this.milvusclient.hasCollection({
      collection_name: collectionName,
    });
    if (!queryCollection.value) {
      // 创建集合，每个用户一个集合，集合名称_+用户的唯一标识
      await this.createCollection(collectionName);
    }
    // 2.向量文档的标题
    const vectorsDocTitle = await this.embeddingsAliyun([
      { pageContent: file.originalname },
    ]);
    // 3.向量文档被拆分的片段
    // 分批处理，因为阿里云最多一次性处理25块文本
    const batchSize = 25;
    for (let i = 0; i < splitDocument.length; i += batchSize) {
      const batch = splitDocument.splice(i, i + batchSize);
      const vectorsDocText = await this.embeddingsAliyun(batch);
      await this.insertData(
        collectionName,
        file.originalname,
        docId,
        batch,
        vectorsDocTitle,
        vectorsDocText,
      );
    }
    return file.originalname;
  }
  // // 删除知识库指定文件
  async deleteFileKb(userId: string, docId: string) {
    // 删除mongodb数据库文件和服务器文件
    await this.deleteFile(userId, docId);
    // 集合名称
    const collectionName = `_${userId}`;
    // 先加载集合
    await this.milvusclient.loadCollection({ collection_name: collectionName });
    // 删除向量数据库里的指定文件
    await this.milvusclient.delete({
      collection_name: collectionName,
      filter: `docId == '${docId}'`,
    });
    // 释放集合
    await this.milvusclient.releaseCollection({
      collection_name: collectionName,
    });
    return { result: [], message: 'SUCCESS' };
  }
  // 删除mongodb和服务器上的文件
  async deleteFile(userId: string, docId: string) {
    // 先查找文件的路径
    const fileRecord = await this.fileanagementModel.findOne({
      userId,
      _id: docId,
    });
    // 删除mongodb数据库文件
    await this.fileanagementModel.deleteOne({
      _id: docId,
      userId,
    });
    // 拼接路径
    const filePath = path.join(process.cwd(), fileRecord?.filePath as string);
    try {
      // 删除服务器上的文件
      fs.unlinkSync(filePath);
      return { result: [], message: 'SUCCESS' };
    } catch {
      return { result: [], message: '删除失败', code: 422 };
    }
  }
  // 查询向量数据库
  async searchDatabase(
    userId: string,
    userQuestion: string,
    questionVector: number[],
  ) {
    // 集合名称
    const collectionName = `_${userId}`;
    // 先加载集合
    await this.milvusclient.loadCollection({ collection_name: collectionName });
    // 混合搜索
    const search_param_1 = {
      data: questionVector,
      anns_field: 'embedDocTitle',
      param: {
        metric_type: 'COSINE',
      },
      limit: 9,
    };
    const search_param_2 = {
      data: questionVector,
      anns_field: 'embedDocText',
      param: {
        metric_type: 'COSINE',
      },
      limit: 9,
    };
    const res = await this.milvusclient.search({
      collection_name: collectionName,
      data: [search_param_1, search_param_2],
      limit: 18,
      output_fields: ['docTitle', 'docText'],
      rerank: WeightedRanker([0.3, 0.8]),
    });
    // console.log('搜索向量数据库结果');
    // console.log(res.results);
    // 释放集合
    this.milvusclient.releaseCollection({ collection_name: collectionName });
    // 提取关键词
    const keyWordList = await this.extractKeywords(userQuestion);
    // console.log('提取到的关键词-------' + JSON.stringify(keyWordList));
    if (
      res.status.error_code === 'Success' &&
      res.status.code === 0 &&
      res.results &&
      res.results.length > 0
    ) {
      // 用关键词去匹配检索到的文档
      const filterDocList = this.filterDocsByKeywords(
        res.results,
        keyWordList.keyWord,
      );
      // console.log('关键词过滤出来的');
      // console.log(filterDocList);
      // 匹配得到的标题
      let searchDocTitle: string[] = [];
      // 匹配得到的内容
      let searchDocText = '';
      if (filterDocList.length > 0) {
        // 去重
        searchDocTitle = [
          ...new Set(filterDocList.map((item) => item.docTitle)),
        ];
        filterDocList.forEach(
          (item, index) => (searchDocText += index + 1 + '.' + item.docText),
        );
      } else {
        searchDocTitle = [];
        searchDocText = '&没有检索到相关文档&';
      }
      return {
        searchDocTitle,
        searchDocText: `请根据检索到的知识库文档内容回复用户问题,用户问题:${userQuestion};\n文档内容:${searchDocText}`,
      };
    } else {
      return {
        searchDocTitle: [],
        searchDocText: `请根据检索到的知识库文档内容回复用户问题,用户问题:${userQuestion};\n文档内容:&没有检索到相关文档&`,
      };
    }
  }
  // 让模型提取关键词
  async extractKeywords(content: string) {
    const res = await this.openai.chat.completions.create({
      model: 'qwen-plus',
      messages: [
        { role: 'system', content: kwExtractionPrompt },
        { role: 'user', content },
      ],
      stream: false,
      response_format: { type: 'json_object' },
    });
    return JSON.parse(res.choices[0].message.content as string) as {
      keyWord: string[];
    };
  }
  // 关键词匹配检索到的文档
  filterDocsByKeywords(docList: SearchResultData[], keyWords: string[]) {
    const result: SearchResultData[] = [];
    for (const doc of docList) {
      const combinedText = `${doc.docTitle}${doc.docText}`;
      const hasKeyword = keyWords.some((item) => combinedText.includes(item));
      if (hasKeyword) {
        result.push(doc);
      }
    }
    return result;
  }
  //#endregion
  // 网页内容提取
  async extractWebContent() {
    const loader = new PlaywrightWebBaseLoader(
      'https://mp.weixin.qq.com/s/Eb7k_EsDer3Zh76ARvjn8w',
      {
        launchOptions: {
          headless: true,
        },
        gotoOptions: {
          waitUntil: 'domcontentloaded',
        },
        evaluate: async (page) => {
          await page.waitForSelector('#activity-name');
          await page.waitForSelector('#js_content');

          const title = await page.$eval(
            '#activity-name',
            (el) => el.textContent?.trim() || '',
          );
          const content = await page.$eval(
            '#js_content',
            (el) => el.textContent?.trim() || '',
          );

          // 拼接标题 + 正文作为 pageContent 返回
          return `标题：${title}\n\n${content}`;
        },
      },
    );
    const docs = await loader.load();
    // console.log(docs);
  }
  // 删除服务器上的图片
  deleteImage(imagePath: string) {
    // console.log(imagePath);
    // 拼接路径
    // const filePath = path.join(process.cwd(), imagePath);
    // console.log(filePath);
    try {
      // 删除服务器上的文件
      fs.unlinkSync(imagePath);
      return { result: [], message: 'SUCCESS' };
    } catch {
      return { result: [], message: '删除失败', code: 422 };
    }
  }
}
