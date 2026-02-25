import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { UserInfo } from './userinfo.schema';
import { Model } from 'mongoose';
import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class UserinfoService {
  constructor(
    @InjectModel(UserInfo.name) private userInfoModel: Model<UserInfo>,
    private configService: ConfigService,
    private jwtService: JwtService,
  ) {}

  // 注册
  async registerUser(phoneNumber: string, password: string) {
    // 查询该手机号是否存在，不存在就存储数据库，存储则提示
    const queryAccount = await this.userInfoModel.find({ phoneNumber });
    // console.log(queryAccount);
    if (queryAccount.length <= 0) {
      // 对密码加密的key
      const passwordKey = this.configService.get('PASSWORD_KEY') as string;
      const passwordHash = createHmac('sha256', passwordKey)
        .update(password)
        .digest('hex');
      console.log(passwordHash);

      await this.userInfoModel.create({ phoneNumber, password: passwordHash });
      return { message: 'SUCCESS', result: [] };
    } else {
      return { message: '该账号已存在', result: [], code: 422 };
    }
  }
  //登录
  async loginUser(phoneNumber: string, password: string) {
    // 对密码加密的key
    const passwordKey = this.configService.get('PASSWORD_KEY') as string;
    const passwordHash = createHmac('sha256', passwordKey)
      .update(password)
      .digest('hex');
    const queryAccount = await this.userInfoModel.find({
      phoneNumber,
      password: passwordHash,
    });
    if (queryAccount.length > 0) {
      // 把_id作为用户唯一身份标识，并且加密成token返回给前端缓存到浏览器
      const token = this.jwtService.sign({ token: queryAccount[0]._id });
      return {
        message: 'SUCCESS',
        result: {
          token,
          phoneNumber,
          avatar: queryAccount[0].avatar,
        },
      };
    } else {
      return { message: '账号或密码错误', result: [], code: 422 };
    }
  }
}
