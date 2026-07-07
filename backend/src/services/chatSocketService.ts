import { EventEmitter } from 'events';

export const chatEmitter = new EventEmitter();
chatEmitter.setMaxListeners(200);

export interface ChatMessagePayload {
  id: number;
  channelId: number;
  userId: number | null;
  anonymousId: string | null;
  anonymousName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  content: string;
  createdAt: string;
}