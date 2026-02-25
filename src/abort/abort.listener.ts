import { AbortRedisService } from './abort-redis.service';
import { controllerMap } from './controller-map';

export async function listenAbortSignals(abortRedisService: AbortRedisService) {
  const sub = abortRedisService.getSubClient();

  await sub.subscribe('abort-signal');
  console.log('[监听] 正在监听 abort-signal');

  sub.on('message', (channel, message) => {
    if (channel === 'abort-signal') {
      const sessionId = message;
      const controller = controllerMap.get(sessionId);
      if (controller) {
        console.log(`[中断] 收到中断信号，终止 session: ${sessionId}`);
        controller.abort();
        controllerMap.delete(sessionId);
      } else {
        console.log(`[中断] 当前进程没有控制器，忽略 session: ${sessionId}`);
      }
    }
  });
}
