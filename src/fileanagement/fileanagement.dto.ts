import { IsString, IsNotEmpty } from 'class-validator';
// 删除文件:文档类型
export class DeletefileDto {
  // 文件id
  @IsString({ message: 'docId必须是字符串' })
  @IsNotEmpty({ message: 'docId不能为空' })
  docId: string;
}
// 删除文件:图片类型
export class DeleteImageDto {
  // 文件路径
  @IsString({ message: 'imagePath必须是字符串' })
  @IsNotEmpty({ message: 'imagePath不能为空' })
  imagePath: string;
}
