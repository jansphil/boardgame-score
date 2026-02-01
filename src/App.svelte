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
  let sessionName = '';
  let sessionStarted = false;
  let newPlayerName = '';
  let newRowName = '';
  let resetArmed = false;
  let editingRowId: string | null = null;
  let editingRowName = '';
  let rowEditInput: HTMLInputElement | null = null;

  // rename state
  let editingPlayerId: string | null = null;
  let editingName = '';
  let renameInput: HTMLInputElement | null = null;
  let activeEditPill: HTMLDivElement | null = null;

  // add points state
  let addingPlayerId: string | null = null;
  let addInput: HTMLInputElement | null = null;
  let activeAddPill: HTMLDivElement | null = null;
  let activeResetPill: HTMLDivElement | null = null;
  let activeRowEditPill: HTMLDivElement | null = null;

  let addAmounts: Record<string, string> = {};
  let totals: Record<string, number> = {};

  const pillClass =
    'flex w-full items-center gap-2 rounded-full border border-gray-200 bg-white pl-4 pr-2 py-2 shadow-sm';
  const pillInputClass =
    'w-full bg-transparent text-lg font-medium outline-none';
  const pillNameButtonClass =
    'min-w-0 flex-1 truncate text-left text-lg font-medium';
  const iconClass = 'material-symbols-rounded text-[20px] leading-none';
  const circleButtonBase =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full';
  const circleButtonPrimary = `${circleButtonBase} bg-blue-600 text-white`;
  const circleButtonSuccess = `${circleButtonBase} bg-green-600 text-white`;
  const circleButtonDanger =
    `${circleButtonBase} border border-red-100 bg-red-50 text-red-500 hover:bg-red-100`;
  const circleButtonNeutral =
    `${circleButtonBase} border border-gray-200 text-gray-600 hover:bg-gray-50`;
  const resetPillClass =
    'flex w-full items-center gap-2 rounded-full border px-4 py-2 shadow-sm';
  const resetPillBaseText = 'text-lg font-semibold';

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
    tabularRows = await db.tabularRows.orderBy('order').toArray();
    tabularScores = await db.tabularScores.toArray();
    addAmounts = Object.fromEntries(players.map((p) => [p.id, '']));

    const settings = await db.settings.get('app');
    if (settings) {
      scoringMode = settings.scoringMode;
      sessionName = settings.sessionName ?? '';
      sessionStarted = settings.sessionStarted ?? false;
    } else {
      const now = Date.now();
      await db.settings.add({
        id: 'app',
        scoringMode: 'simple',
        sessionName: '',
        sessionStarted: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (editingPlayerId && activeEditPill) {
        if (!target || !activeEditPill.contains(target)) {
          cancelRename();
        }
      }
      if (addingPlayerId && activeAddPill) {
        if (!target || !activeAddPill.contains(target)) {
          addingPlayerId = null;
        }
      }
      if (editingRowId && activeRowEditPill) {
        if (!target || !activeRowEditPill.contains(target)) {
          cancelRowEdit();
        }
      }
      if (resetArmed && activeResetPill) {
        if (!target || !activeResetPill.contains(target)) {
          resetArmed = false;
        }
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
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

  function openRename(player: Player) {
    startRename(player);
  }

  function openAddPoints(playerId: string) {
    startAddPoints(playerId);
  }

  async function addSetupRow() {
    const name = newRowName.trim();
    if (!name) return;
    await addTabularRow(name);
    newRowName = '';
  }

  function startRowEdit(row: TabularRow) {
    editingRowId = row.id;
    editingRowName = row.name;
    tick().then(() => {
      rowEditInput?.focus();
      rowEditInput?.select();
    });
  }

  function cancelRowEdit() {
    editingRowId = null;
    editingRowName = '';
  }

  async function saveRowEdit(rowId: string) {
    const name = editingRowName.trim();
    if (!name) return;
    await renameTabularRow(rowId, name);
    cancelRowEdit();
  }

  async function moveRow(rowId: string, direction: 'up' | 'down') {
    const index = tabularRows.findIndex((row) => row.id === rowId);
    if (index < 0) return;
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= tabularRows.length) return;

    const current = tabularRows[index];
    const swap = tabularRows[swapIndex];
    const nextRows = [...tabularRows];
    nextRows[index] = { ...swap, order: current.order };
    nextRows[swapIndex] = { ...current, order: swap.order };
    tabularRows = nextRows;

    await db.transaction('rw', db.tabularRows, async () => {
      await db.tabularRows.update(current.id, { order: swap.order });
      await db.tabularRows.update(swap.id, { order: current.order });
    });
  }

  async function startSession() {
    const name = sessionName.trim();
    if (!name) return;
    sessionName = name;
    sessionStarted = true;
    await db.settings.update('app', {
      scoringMode,
      sessionName: name,
      sessionStarted: true,
      updatedAt: Date.now(),
    });
  }

  async function resetSession() {
    resetArmed = false;
    sessionStarted = false;
    sessionName = '';
    newPlayerName = '';
    newRowName = '';
    editingRowId = null;
    editingRowName = '';
    editingPlayerId = null;
    addingPlayerId = null;
    players = [];
    scoreEvents = [];
    tabularRows = [];
    tabularScores = [];
    addAmounts = {};

    await db.transaction(
      'rw',
      db.players,
      db.scoreEvents,
      db.tabularRows,
      db.tabularScores,
      db.settings,
      async () => {
        await db.players.clear();
        await db.scoreEvents.clear();
        await db.tabularRows.clear();
        await db.tabularScores.clear();
        await db.settings.update('app', {
          sessionStarted: false,
          sessionName: '',
          updatedAt: Date.now(),
        });
      }
    );
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
    const nextOrder =
      tabularRows.length === 0
        ? 0
        : Math.max(...tabularRows.map((row) => row.order)) + 1;
    const row: TabularRow = {
      id: crypto.randomUUID(),
      name,
      order: nextOrder,
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
    if (editingRowId === rowId) {
      cancelRowEdit();
    }

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

    {#if !sessionStarted}
      <section class="space-y-6">
        <div class="space-y-3">
          <p class="text-sm font-semibold text-gray-700">Session name</p>
          <div class={pillClass}>
            <input
              class={pillInputClass}
              placeholder="Name this session"
              bind:value={sessionName}
            />
          </div>
        </div>

        <div class="space-y-3">
          <p class="text-sm font-semibold text-gray-700">Scoring mode</p>
          <div class="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
            <button
              type="button"
              class={`w-full px-4 py-3 text-left text-lg font-medium ${
                scoringMode === 'simple' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
              }`}
              on:click={() => setScoringMode('simple')}
            >
              Simple scoring
            </button>
            <div class="h-px bg-gray-200"></div>
            <button
              type="button"
              class={`w-full px-4 py-3 text-left text-lg font-medium ${
                scoringMode === 'tabular' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
              }`}
              on:click={() => setScoringMode('tabular')}
            >
              Tabular scoring
            </button>
          </div>
        </div>

        {#if scoringMode === 'tabular'}
          <div class="space-y-3">
            <p class="text-sm font-semibold text-gray-700">
              Scoring conditions
            </p>
          {#if tabularRows.length > 0}
            <div class="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
                {#each tabularRows as row, index (row.id)}
                  {#if editingRowId === row.id}
                    <div class="flex items-center gap-2 px-4 py-3" bind:this={activeRowEditPill}>
                      <input
                        class={pillInputClass}
                        bind:this={rowEditInput}
                        bind:value={editingRowName}
                        on:keydown={(e) => {
                          if (e.key === 'Enter') saveRowEdit(row.id);
                          if (e.key === 'Escape') cancelRowEdit();
                        }}
                      />
                      <button
                        type="button"
                        class={circleButtonSuccess}
                        on:click={() => saveRowEdit(row.id)}
                        aria-label="Save scoring condition"
                      >
                        <span class={iconClass}>check</span>
                      </button>
                      <button
                        type="button"
                        class={circleButtonDanger}
                        on:click={() => removeTabularRow(row.id)}
                        aria-label="Remove scoring condition"
                      >
                        <span class={iconClass}>delete</span>
                      </button>
                    </div>
                  {:else}
                    <div class="flex items-center gap-2 px-4 py-3">
                      <button
                        type="button"
                        class="min-w-0 flex-1 truncate text-left text-lg font-medium"
                        on:click={() => startRowEdit(row)}
                        aria-label="Edit scoring condition"
                      >
                        {row.name}
                      </button>
                      <div class="flex items-center gap-2">
                        {#if index > 0}
                          <button
                            type="button"
                            class={circleButtonNeutral}
                            on:click={() => moveRow(row.id, 'up')}
                            aria-label="Move scoring condition up"
                          >
                            <span class={iconClass}>arrow_upward</span>
                          </button>
                        {/if}
                        {#if index < tabularRows.length - 1}
                          <button
                            type="button"
                            class={circleButtonNeutral}
                            on:click={() => moveRow(row.id, 'down')}
                            aria-label="Move scoring condition down"
                          >
                            <span class={iconClass}>arrow_downward</span>
                          </button>
                        {/if}
                        <button
                          type="button"
                          class={circleButtonDanger}
                          on:click={() => removeTabularRow(row.id)}
                          aria-label="Remove scoring condition"
                        >
                          <span class={iconClass}>delete</span>
                        </button>
                      </div>
                    </div>
                  {/if}
                  {#if index < tabularRows.length - 1}
                    <div class="h-px bg-gray-200"></div>
                  {/if}
                {/each}
              </div>
            {/if}
            <div class="flex w-full items-center gap-2 rounded-full border border-dashed border-gray-200 bg-white pl-4 pr-2 py-2 shadow-sm">
              <input
                class={pillInputClass}
                placeholder="Add scoring condition"
                bind:value={newRowName}
                on:keydown={(e) => e.key === 'Enter' && addSetupRow()}
              />
              <button
                type="button"
                class={circleButtonPrimary}
                on:click={addSetupRow}
                aria-label="Add scoring condition"
              >
                <span class={iconClass}>add</span>
              </button>
            </div>
          </div>
        {/if}

        <button
          type="button"
          class="flex w-full items-center justify-center rounded-full bg-blue-600 px-4 py-4 text-lg font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
          on:click={startSession}
          disabled={!sessionName.trim()}
        >
          Start session
        </button>
      </section>
    {:else}
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-gray-500">Session</p>
          <p class="text-xl font-semibold">{sessionName}</p>
        </div>
        <div class="text-sm text-gray-500">
          {players.length} {players.length === 1 ? 'player' : 'players'}
        </div>
      </div>

      <ul class="space-y-3">
        {#each players as player (player.id)}
          <li class="p-0">
            {#if editingPlayerId === player.id}
              <div class={pillClass} bind:this={activeEditPill}>
                <input
                  class={pillInputClass}
                  bind:this={renameInput}
                  bind:value={editingName}
                  on:keydown={(e) => {
                    if (e.key === 'Enter') saveRename(player.id);
                    if (e.key === 'Escape') cancelRename();
                  }}
                />
                <button
                  type="button"
                  class={circleButtonSuccess}
                  on:click={() => saveRename(player.id)}
                  aria-label="Save name"
                >
                  <span class={iconClass}>check</span>
                </button>
                <button
                  type="button"
                  class={circleButtonDanger}
                  on:click={() => removePlayer(player.id)}
                  aria-label="Remove player"
                  title="Remove"
                >
                  <span class={iconClass}>delete</span>
                </button>
              </div>
            {:else if scoringMode === 'simple' && addingPlayerId === player.id}
              <div class={pillClass} bind:this={activeAddPill}>
                <button
                  type="button"
                  class={pillNameButtonClass}
                  on:click={() => openRename(player)}
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
                  class={circleButtonPrimary}
                  on:click={() => submitAdd(player.id)}
                  aria-label="Add points"
                >
                  <span class={iconClass}>add</span>
                </button>
              </div>
            {:else}
              <div class={pillClass}>
                <button
                  type="button"
                  class={pillNameButtonClass}
                  on:click={() => openRename(player)}
                  aria-label="Edit player name"
                  title="Edit name"
                >
                  {player.name}
                </button>
                {#if scoringMode === 'simple'}
                  <button
                    type="button"
                    class="text-lg font-semibold tabular-nums hover:text-blue-700"
                    on:click={() => openAddPoints(player.id)}
                    aria-label="Edit score"
                  >
                    {totals[player.id] ?? 0}
                  </button>
                  <button
                    type="button"
                    class={circleButtonPrimary}
                    on:click={() => openAddPoints(player.id)}
                    aria-label="Open add points"
                  >
                    <span class={iconClass}>add</span>
                  </button>
                {/if}
              </div>
            {/if}
          </li>
        {/each}

        <li class="p-0">
          <div class="flex w-full items-center gap-2 rounded-full border border-dashed border-gray-200 bg-white pl-4 pr-2 py-2 shadow-sm">
            <input
              class={pillInputClass}
              placeholder="Add player"
              bind:value={newPlayerName}
              on:keydown={(e) => e.key === 'Enter' && addPlayer()}
            />
            <button
              type="button"
              class={circleButtonPrimary}
              on:click={addPlayer}
              aria-label="Add player"
            >
              <span class={iconClass}>add</span>
            </button>
          </div>
        </li>
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

      <div class="pt-4">
        <div
          class={`${resetPillClass} ${
            resetArmed
              ? 'border-red-200 bg-red-50'
              : 'border-red-100 bg-white'
          }`}
          bind:this={activeResetPill}
        >
          <button
            type="button"
            class={`flex-1 ${resetPillBaseText} ${
              resetArmed ? 'text-left text-red-800' : 'text-center text-red-600'
            }`}
            on:click={() => {
              if (!resetArmed) {
                resetArmed = true;
              }
            }}
            aria-label="Start new session"
          >
            {resetArmed
              ? 'Are you sure? This resets all data.'
              : 'Start new session'}
          </button>
          <button
            type="button"
            class={`${circleButtonDanger} ${resetArmed ? '' : 'opacity-0 pointer-events-none'}`}
            on:click={resetSession}
            aria-label="Confirm new session"
          >
            <span class={iconClass}>check</span>
          </button>
        </div>
      </div>
    {/if}
  </div>
</main>
