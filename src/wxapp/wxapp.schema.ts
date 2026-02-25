import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ _id: false }) // 用于嵌套结构，不单独生成 _id
class WxAppItem {
  // 封面图
  @Prop({ required: true })
  cover: string;
  // 标题
  @Prop({ required: true })
  title: string;
  // 描述
  @Prop({ required: true })
  describe: string;
  // 问题
  @Prop({ required: true })
  question: string;
}

@Schema({ versionKey: false })
export class WxApp extends Document {
  // 类型
  @Prop({ required: true, enum: ['list', 'single'] })
  type: 'list' | 'single';

  // 标题
  @Prop()
  title?: string;

  // 说明
  @Prop()
  subtitle?: string;

  // 数据
  @Prop({ type: [WxAppItem], required: true })
  data: WxAppItem[];
}

export const WxAppSchema = SchemaFactory.createForClass(WxApp);
