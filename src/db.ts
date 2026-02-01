import Dexie, { type Table } from 'dexie';

export type Player = {
  id: string;
  name: string;
  createdAt: number;
};

export type ScoringMode = 'simple' | 'tabular';

export type AppSettings = {
  id: 'app';
  scoringMode: ScoringMode;
  createdAt: number;
  updatedAt: number;
};

export type ScoreEvent = {
  id: string;
  playerId: string;
  delta: number;
  createdAt: number;
};

export type TabularRow = {
  id: string;
  name: string;
  createdAt: number;
};

export type TabularScore = {
  id: string;
  rowId: string;
  playerId: string;
  value: number;
};

class AppDB extends Dexie {
  players!: Table<Player, string>;
  settings!: Table<AppSettings, 'app'>;
  scoreEvents!: Table<ScoreEvent, string>;
  tabularRows!: Table<TabularRow, string>;
  tabularScores!: Table<TabularScore, string>;

  constructor() {
    super('boardgame_scores');
    this.version(1).stores({
      players: 'id, createdAt',
      scoreEvents: 'id, playerId, createdAt',
    });
    this.version(2)
      .stores({
        players: 'id, createdAt',
        settings: 'id',
        scoreEvents: 'id, playerId, createdAt',
        tabularRows: 'id, createdAt',
        tabularScores: 'id, rowId, playerId',
      })
      .upgrade(async (tx) => {
        const existing = await tx.table<AppSettings, 'app'>('settings').get('app');
        if (!existing) {
          await tx.table<AppSettings, 'app'>('settings').add({
            id: 'app',
            scoringMode: 'simple',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      });
  }
}

export const db = new AppDB();
