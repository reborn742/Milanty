
export interface Player {
  id: string;
  name: string;
  isAI: boolean;
  cards: number[];
  score: number;
  totalScore?: number;
  isOut: boolean;
  rank?: number;
  hasLeft?: boolean;
}

export interface Card {
  id: number;
  value: number;
  isPicked: boolean;
}

export enum GameStage {
  SETUP = 'SETUP',
  PICKING = 'PICKING',
  PASSING = 'PASSING',
  ROUND_OVER = 'ROUND_OVER',
  GAME_OVER = 'GAME_OVER'
}

export interface RoundHistory {
  winners: string[];
  losers: string[];
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  type: 'text' | 'image';
  text?: string;
  imageData?: string;
  timestamp: number;
}
