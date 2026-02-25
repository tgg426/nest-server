import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { LoginUserDto, RegisterDto } from './userinfo.dto';
import { UserinfoService } from './userinfo.service';

@Controller('userinfo')
export class UserinfoController {
  constructor(private readonly UserinfoService: UserinfoService) {}
  // 注册
  @Post('registeruser')
  async registerUser(@Body() body: RegisterDto) {
    // console.log(body);
    // 比如密码和确认密码
    if (body.password !== body.confirmPassword) {
      throw new BadRequestException(['两次密码输入不一致']);
    }
    // 存储数据库
    return await this.UserinfoService.registerUser(
      body.phoneNumber,
      body.password,
    );
  }
  // 登录
  @Post('loginuser')
  async loginUser(@Body() body: LoginUserDto) {
    return await this.UserinfoService.loginUser(
      body.phoneNumber,
      body.password,
    );
  }
}
