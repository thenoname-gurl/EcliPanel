import { describe, expect, it } from 'bun:test';
import {
  isOpenAIChatResponse,
  getAIChatResponseContent,
  type OpenAIChatCompletionResponse,
} from '../../src/types/openai';

describe('openai types', () => {
  const validResponse: OpenAIChatCompletionResponse = {
    id: 'chatcmpl-123',
    object: 'chat.completion',
    created: 1234567890,
    model: 'gpt-4',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: 'Hello, world!',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    },
  };

  describe('isOpenAIChatResponse', () => {
    it('should return true for valid chat completion response', () => {
      expect(isOpenAIChatResponse(validResponse)).toBe(true);
    });

    it('should return true for response with multiple choices', () => {
      const multiChoice = {
        ...validResponse,
        choices: [validResponse.choices[0], validResponse.choices[0]],
      };
      expect(isOpenAIChatResponse(multiChoice)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isOpenAIChatResponse(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isOpenAIChatResponse(undefined)).toBe(false);
    });

    it('should return false for object without choices array', () => {
      expect(isOpenAIChatResponse({ id: '123' })).toBe(false);
    });

    it('should return false for object with non-array choices', () => {
      expect(isOpenAIChatResponse({ id: '123', choices: 'not an array' })).toBe(false);
    });
  });

  describe('getAIChatResponseContent', () => {
    it('should extract content from first choice', () => {
      expect(getAIChatResponseContent(validResponse)).toBe('Hello, world!');
    });

    it('should return empty string for response without content', () => {
      const noContent: OpenAIChatCompletionResponse = {
        ...validResponse,
        choices: [
          {
            ...validResponse.choices[0],
            message: { role: 'assistant', content: '' },
          },
        ],
      };
      expect(getAIChatResponseContent(noContent)).toBe('');
    });

    it('should return empty string for response with empty choices', () => {
      const emptyChoices = { ...validResponse, choices: [] };
      expect(getAIChatResponseContent(emptyChoices)).toBe('');
    });

    it('should return JSON string for invalid response', () => {
      const invalid = { some: 'data' };
      expect(getAIChatResponseContent(invalid)).toBe('{"some":"data"}');
    });

    it('should return stringified null for null', () => {
      expect(getAIChatResponseContent(null)).toBe('null');
    });
  });
});
