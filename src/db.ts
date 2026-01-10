import Dexie, { type Table } from 'dexie';

export type Player = {
  id: string;
  name: string;
  createdAt: number;
};

export type ScoreEvent = {
  id: string;
  playerId: string;
  delta: number;
  createdAt: number;
};

class AppDB extends Dexie {
  players!: Table<Player, string>;
  scoreEvents!: Table<ScoreEvent, string>;

  constructor() {
    super('boardgame_scores');
    this.version(1).stores({
      players: 'id, createdAt',
      scoreEvents: 'id, playerId, createdAt',
    });
  }
}

export const db = new AppDB();
