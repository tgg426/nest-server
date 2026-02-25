import { intentUnderstandingPrompt } from './roleDefinition';
import { ChatCompletionTool } from 'openai/resources/chat/completions';
// import { ChatCompletionTool } from "openai/resources/chat/completions";
// 工具：意图理解用户的追问问题
export const toolsData: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'knowledge',
      description: intentUnderstandingPrompt,
      parameters: {
        type: 'object',
        properties: {
          clarified_question: {
            type: 'string',
            description:
              '请根据用户本轮提问（无论是否是追问）结合上下文，生成清晰完整的新问题，用于知识库检索。',
          },
        },
        required: ['clarified_question'],
      },
    },
  },
];
