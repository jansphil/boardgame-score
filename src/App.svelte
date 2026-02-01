<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    db,
    type Player,
    type ScoreEvent,
    type ScoringMode,
    type TabularRow,
    type TabularScore,
  } from './db';

  import TabularScoring from './scoring/TabularScoring.svelte';

  let players: Player[] = [];
  let scoreEvents: ScoreEvent[] = [];
  let tabularRows: TabularRow[] = [];
  let tabularScores: TabularScore[] = [];
  let scoringMode: ScoringMode = 'simple';
  let newPlayerName = '';

  // rename state
  let editingPlayerId: string | null = null;
  let editingName = '';
  let renameInput: HTMLInputElement | null = null;

  // add points state
  let addingPlayerId: string | null = null;
  let addInput: HTMLInputElement | null = null;

  let addAmounts: Record<string, string> = {};
  let totals: Record<string, number> = {};

  $: {
    const next: Record<string, number> = {};
    for (const e of scoreEvents) {
      next[e.playerId] = (next[e.playerId] ?? 0) + e.delta;
    }
    totals = next;
  }

  onMount(async () => {
    players = await db.players.orderBy('createdAt').toArray();
    scoreEvents = await db.scoreEvents.toArray();
    tabularRows = await db.tabularRows.orderBy('createdAt').toArray();
    tabularScores = await db.tabularScores.toArray();
    addAmounts = Object.fromEntries(players.map((p) => [p.id, '']));

    const settings = await db.settings.get('app');
    if (settings) {
      scoringMode = settings.scoringMode;
    } else {
      const now = Date.now();
      await db.settings.add({
        id: 'app',
        scoringMode: 'simple',
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  async function addPlayer() {
    const name = newPlayerName.trim();
    if (!name) return;
    const id = crypto.randomUUID();
    const player = { id, name, createdAt: Date.now() };
    players = [...players, player];

    await db.players.add(player);

    newPlayerName = '';
    addAmounts = { ...addAmounts, [id]: '' };
  }

  async function addScore(playerId: string, delta: number) {
    const event = {
      id: crypto.randomUUID(),
      playerId,
      delta,
      createdAt: Date.now(),
    };

    // Update UI immediately
    scoreEvents = [...scoreEvents, event];

    // Persist
    await db.scoreEvents.add(event);
  }

  function parseAmount(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const value = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(value) || value === 0) return null;
    return value;
  }

  async function submitAdd(playerId: string) {
    const raw = addAmounts[playerId] ?? '';
    const value = parseAmount(raw);
    if (value === null) return;

    await addScore(playerId, value);
    addAmounts = { ...addAmounts, [playerId]: '' };
    addingPlayerId = null;
  }

  async function startRename(player: Player) {
    addingPlayerId = null;
    editingPlayerId = player.id;
    editingName = player.name;

    await tick();
    renameInput?.focus();
    renameInput?.select();
  }

  function handleRenameFocusOut(event: FocusEvent) {
    const nextTarget = event.relatedTarget as Node | null;
    if (!event.currentTarget.contains(nextTarget)) {
      cancelRename();
    }
  }

  function cancelRename() {
    editingPlayerId = null;
    editingName = '';
  }

  async function saveRename(playerId: string) {
    const name = editingName.trim();
    if (!name) return;

    players = players.map((p) => (p.id === playerId ? { ...p, name } : p));

    await db.players.update(playerId, { name });

    cancelRename();
  }

  async function startAddPoints(playerId: string) {
    cancelRename();
    addingPlayerId = playerId;
    await tick();
    addInput?.focus();
    addInput?.select();
  }

  function handleAddFocusOut(event: FocusEvent) {
    const nextTarget = event.relatedTarget as Node | null;
    if (!event.currentTarget.contains(nextTarget)) {
      addingPlayerId = null;
    }
  }


  async function removePlayer(playerId: string) {
    players = players.filter((p) => p.id !== playerId);
    scoreEvents = scoreEvents.filter((e) => e.playerId !== playerId);
    tabularScores = tabularScores.filter((s) => s.playerId !== playerId);
    addAmounts = Object.fromEntries(
      players.map((p) => [p.id, addAmounts[p.id] ?? ''])
    );

    await db.transaction(
      'rw',
      db.players,
      db.scoreEvents,
      db.tabularScores,
      async () => {
        await db.tabularScores.where('playerId').equals(playerId).delete();
        await db.scoreEvents.where('playerId').equals(playerId).delete();
        await db.players.delete(playerId);
      }
    );
  }

  async function setScoringMode(mode: ScoringMode) {
    scoringMode = mode;
    await db.settings.update('app', { scoringMode: mode, updatedAt: Date.now() });
  }

  async function addTabularRow(name: string) {
    const row: TabularRow = {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now(),
    };
    tabularRows = [...tabularRows, row];
    await db.tabularRows.add(row);
  }

  async function renameTabularRow(rowId: string, name: string) {
    tabularRows = tabularRows.map((row) =>
      row.id === rowId ? { ...row, name } : row
    );
    await db.tabularRows.update(rowId, { name });
  }

  async function removeTabularRow(rowId: string) {
    tabularRows = tabularRows.filter((row) => row.id !== rowId);
    tabularScores = tabularScores.filter((score) => score.rowId !== rowId);

    await db.transaction('rw', db.tabularRows, db.tabularScores, async () => {
      await db.tabularScores.where('rowId').equals(rowId).delete();
      await db.tabularRows.delete(rowId);
    });
  }

  function parseTabularValue(raw: string): number | null | undefined {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const value = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(value)) return undefined;
    return value;
  }

  async function setTabularScore(
    rowId: string,
    playerId: string,
    raw: string
  ) {
    const parsed = parseTabularValue(raw);
    if (parsed === undefined) return;

    const id = `${rowId}:${playerId}`;

    if (parsed === null) {
      tabularScores = tabularScores.filter((score) => score.id !== id);
      await db.tabularScores.delete(id);
      return;
    }

    const existingIndex = tabularScores.findIndex((score) => score.id === id);
    if (existingIndex >= 0) {
      const next = [...tabularScores];
      next[existingIndex] = { ...next[existingIndex], value: parsed };
      tabularScores = next;
    } else {
      tabularScores = [
        ...tabularScores,
        { id, rowId, playerId, value: parsed },
      ];
    }

    await db.tabularScores.put({ id, rowId, playerId, value: parsed });
  }
</script>

<main class="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-200 p-6">
  <div class="max-w-xl mx-auto space-y-6">
    <h1 class="text-3xl font-semibold text-center tracking-tight">
      Boardgame Scores
    </h1>

    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <label class="text-sm font-semibold text-gray-700" for="scoringMode">
          Scoring mode
        </label>
        <div class="mt-1">
          <select
            id="scoringMode"
            class="rounded-full border border-gray-200 bg-white px-4 py-2 shadow-sm"
            bind:value={scoringMode}
            on:change={(e) =>
              setScoringMode((e.currentTarget as HTMLSelectElement).value as ScoringMode)}
          >
            <option value="simple">Simple scoring</option>
            <option value="tabular">Tabular scoring</option>
          </select>
        </div>
      </div>

      <div class="text-sm text-gray-500">
        {players.length} {players.length === 1 ? 'player' : 'players'}
      </div>
    </div>

    {#if players.length === 0}
      <p class="text-center opacity-60">No players yet</p>
    {/if}

    <ul class="space-y-3">
      {#each players as player (player.id)}
        <li class="p-0">
          {#if editingPlayerId === player.id}
            <div
              class="flex w-full items-center gap-2 rounded-full border border-gray-200 bg-white pl-4 pr-2 py-2 shadow-sm"
              on:focusout={handleRenameFocusOut}
            >
              <input
                class="w-full bg-transparent text-lg font-medium outline-none"
                bind:this={renameInput}
                bind:value={editingName}
                on:keydown={(e) => {
                  if (e.key === 'Enter') saveRename(player.id);
                  if (e.key === 'Escape') cancelRename();
                }}
              />
              <button
                type="button"
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-600 text-white"
                on:click={() => saveRename(player.id)}
                aria-label="Save name"
              >
                <span class="material-symbols-rounded text-[20px] leading-none">
                  check
                </span>
              </button>
              <button
                type="button"
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-red-100 bg-red-50 text-red-500 hover:bg-red-100"
                on:click={() => removePlayer(player.id)}
                aria-label="Remove player"
                title="Remove"
              >
                <span class="material-symbols-rounded text-[20px] leading-none">
                  delete
                </span>
              </button>
            </div>
          {:else if scoringMode === 'simple' && addingPlayerId === player.id}
            <div
              class="flex w-full items-center gap-2 rounded-full border border-gray-200 bg-white pl-4 pr-2 py-2 shadow-sm"
              on:focusout={handleAddFocusOut}
            >
              <button
                type="button"
                class="min-w-0 flex-1 truncate text-left text-lg font-medium"
                on:click={() => startRename(player)}
                aria-label="Edit player name"
                title="Edit name"
              >
                {player.name}
              </button>
              <input
                class="w-32 bg-transparent text-right text-lg tabular-nums outline-none"
                inputmode="decimal"
                placeholder="Add points"
                bind:this={addInput}
                bind:value={addAmounts[player.id]}
                on:keydown={(e) => {
                  if (e.key === 'Enter') submitAdd(player.id);
                  if (e.key === 'Escape') addingPlayerId = null;
                }}
              />
              <button
                type="button"
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white"
                on:click={() => submitAdd(player.id)}
                aria-label="Add points"
              >
                <span class="material-symbols-rounded text-[20px] leading-none">
                  add
                </span>
              </button>
            </div>
          {:else}
            <div class="flex w-full items-center gap-2 rounded-full border border-gray-200 bg-white pl-4 pr-2 py-2 shadow-sm">
              <button
                type="button"
                class="min-w-0 flex-1 truncate text-left text-lg font-medium"
                on:click={() => startRename(player)}
                aria-label="Edit player name"
                title="Edit name"
              >
                {player.name}
              </button>
              {#if scoringMode === 'simple'}
                <button
                  type="button"
                  class="text-lg font-semibold tabular-nums hover:text-blue-700"
                  on:click={() => startAddPoints(player.id)}
                  aria-label="Edit score"
                >
                  {totals[player.id] ?? 0}
                </button>
                <button
                  type="button"
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white"
                  on:click={() => startAddPoints(player.id)}
                  aria-label="Open add points"
                >
                  <span class="material-symbols-rounded text-[20px] leading-none">
                    add
                  </span>
                </button>
              {/if}
            </div>
          {/if}
        </li>
      {/each}

      {#if scoringMode === 'simple'}
        <li class="p-0">
          <div class="flex w-full items-center gap-2 rounded-full border border-dashed border-gray-200 bg-white pl-4 pr-2 py-2 shadow-sm">
            <input
              class="w-full bg-transparent text-lg font-medium outline-none"
              placeholder="Add player"
              bind:value={newPlayerName}
              on:keydown={(e) => e.key === 'Enter' && addPlayer()}
            />
            <button
              type="button"
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white"
              on:click={addPlayer}
              aria-label="Add player"
            >
              <span class="material-symbols-rounded text-[20px] leading-none">
                add
              </span>
            </button>
          </div>
        </li>
      {/if}
    </ul>

    {#if scoringMode === 'tabular'}
      <TabularScoring
        {players}
        rows={tabularRows}
        scores={tabularScores}
        {editingPlayerId}
        onAddRow={addTabularRow}
        onRenameRow={renameTabularRow}
        onRemoveRow={removeTabularRow}
        onSetScore={setTabularScore}
      />
    {/if}
  </div>
</main>
