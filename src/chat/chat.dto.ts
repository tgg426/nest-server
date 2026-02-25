import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  // ArrayNotEmpty,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Types } from 'mongoose';

// 上传的文件列表
export class UploadFileDto {
  // 文件名称
  @IsString({ message: 'fileName必须是字符串类型' })
  @IsNotEmpty({ message: '文件名称不能为空' })
  fileName: string;

  // 文件大小
  @IsString({ message: 'fileSize必须是字符串类型' })
  @IsNotEmpty({ message: '文件大小不能为空' })
  fileSize: string;

  // 文件类型
  @IsString({ message: 'fileType必须是字符串类型' })
  @IsNotEmpty({ message: '文件类型不能为空' })
  fileType: string;

  // 文件id
  @IsString({ message: 'docId必须是字符串类型' })
  @IsNotEmpty({ message: '文件id不能为空' })
  docId: string;
}

// 上传的图片对象
class UploadImageDto {
  // 图片路径
  @IsString({ message: 'imagePath必须是字符串类型' })
  @IsNotEmpty({ message: '图片路径不能为空' })
  imagePath: string;

  // 图片类型
  @IsString({ message: 'mimetype必须是字符串类型' })
  @IsNotEmpty({ message: '图片类型不能为空' })
  mimetype: string;

  // 图片地址
  @IsString({ message: 'imageUrl必须是字符串类型' })
  @IsNotEmpty({ message: '图片地址不能为空' })
  imageUrl: string;
}

// 用户发来的消息字段
export class SendMessageQueryDto {
  // 用户发送的纯文本
  @IsString({ message: 'content必须是字符串类型' })
  @IsNotEmpty({ message: '请输入问题' })
  content: string;

  // 携带的文件列表
  @IsOptional()
  @IsArray({ message: 'uploadFileList必须是数组类型' })
  // @ArrayNotEmpty({ message: '上传的文件不能为空' })
  @ValidateNested({ each: true }) //对数组里的每一项进行校验
  @Type(() => UploadFileDto) //把数组里的对象转换为UploadFileDto的实例，如果不加Type会导致嵌套字段无效
  uploadFileList?: UploadFileDto[];

  // 对话id
  @IsString({ message: 'sessionId必须是字符串类型' })
  @IsNotEmpty({ message: '对话id不能为空' })
  sessionId: Types.ObjectId | 'null'; //创建新会话的时候前端携带null至过来

  // 是否基于知识库或者联网搜索回答
  @IsString({ message: 'isKnowledgeBased必须是字符串类型' })
  @IsNotEmpty({ message: 'isKnowledgeBased不能为空' })
  isKnowledgeBased?: 'knowledge' | 'bailian_web_search' | 'null';

  // 携带的图片对象
  @IsOptional()
  @ValidateNested()
  @Type(() => UploadImageDto)
  uploadImageList?: UploadImageDto;
}

// 获取某个会话的对话数据传递的会话id
export class SingleChatCataDto {
  @IsString({ message: 'sessionId必须是字符串类型' })
  @IsNotEmpty({ message: '对话id不能为空' })
  sessionId: string;
}
