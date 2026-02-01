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
  sessionName: string;
  sessionStarted: boolean;
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
  order: number;
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
            sessionName: '',
            sessionStarted: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      });
    this.version(3)
      .stores({
        players: 'id, createdAt',
        settings: 'id',
        scoreEvents: 'id, playerId, createdAt',
        tabularRows: 'id, createdAt, order',
        tabularScores: 'id, rowId, playerId',
      })
      .upgrade(async (tx) => {
        const existing = await tx.table<AppSettings, 'app'>('settings').get('app');
        if (existing) {
          await tx.table<AppSettings, 'app'>('settings').update('app', {
            sessionName: existing.sessionName ?? '',
            sessionStarted: existing.sessionStarted ?? false,
            updatedAt: Date.now(),
          });
        } else {
          await tx.table<AppSettings, 'app'>('settings').add({
            id: 'app',
            scoringMode: 'simple',
            sessionName: '',
            sessionStarted: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      });
    this.version(4)
      .stores({
        players: 'id, createdAt',
        settings: 'id',
        scoreEvents: 'id, playerId, createdAt',
        tabularRows: 'id, createdAt, order',
        tabularScores: 'id, rowId, playerId',
      })
      .upgrade(async (tx) => {
        const table = tx.table<TabularRow, string>('tabularRows');
        const rows = await table.toArray();
        if (rows.length > 0 && rows.some((row) => row.order === undefined)) {
          const sorted = [...rows].sort((a, b) => a.createdAt - b.createdAt);
          await Promise.all(
            sorted.map((row, index) =>
              table.update(row.id, { order: index })
            )
          );
        }
        const settingsTable = tx.table<AppSettings, 'app'>('settings');
        const settings = await settingsTable.get('app');
        if (settings && settings.sessionStarted === false) {
          const playersCount = await tx.table<Player, string>('players').count();
          const scoresCount = await tx
            .table<ScoreEvent, string>('scoreEvents')
            .count();
          const tabularScoresCount = await tx
            .table<TabularScore, string>('tabularScores')
            .count();
          const tabularRowsCount = await table.count();
          if (
            playersCount > 0 ||
            scoresCount > 0 ||
            tabularScoresCount > 0 ||
            tabularRowsCount > 0
          ) {
            await settingsTable.update('app', {
              sessionStarted: true,
              updatedAt: Date.now(),
            });
          }
        }
      });
  }
}

export const db = new AppDB();
