<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { db, type Player, type ScoreEvent } from './db';

  import PencilIcon from './icons/Edit.svelte';
  import TrashIcon from './icons/Delete.svelte';

  let players: Player[] = [];
  let scoreEvents: ScoreEvent[] = [];
  let newPlayerName = '';

  // rename state
  let editingPlayerId: string | null = null;
  let editingName = '';
  let renameInput: HTMLInputElement | null = null;

  // per-player "add amount" (string so the input feels natural)
  const addAmounts: Record<string, string> = {};

  onMount(load);

  async function load() {
    players = await db.players.orderBy('createdAt').toArray();
    scoreEvents = await db.scoreEvents.toArray();

    // ensure every player has a default add amount
    for (const p of players) {
      if (addAmounts[p.id] === undefined) addAmounts[p.id] = '1';
    }
  }

  async function addPlayer() {
    const name = newPlayerName.trim();
    if (!name) return;

    const id = crypto.randomUUID();
    await db.players.add({ id, name, createdAt: Date.now() });

    newPlayerName = '';
    addAmounts[id] = '1';
    await load();
  }

  function totalFor(playerId: string) {
    return scoreEvents
      .filter((e) => e.playerId === playerId)
      .reduce((sum, e) => sum + e.delta, 0);
  }

  async function addScore(playerId: string, delta: number) {
    await db.scoreEvents.add({
      id: crypto.randomUUID(),
      playerId,
      delta,
      createdAt: Date.now(),
    });
    await load();
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

    // reset to 1 for rapid entry (common boardgame scoring flow)
    addAmounts[playerId] = '1';
  }

  async function startRename(player: Player) {
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

    await db.players.update(playerId, { name });
    cancelRename();
    await load();
  }

  async function removePlayer(playerId: string) {
    const player = players.find((p) => p.id === playerId);
    const ok = confirm(
      `Remove ${player?.name ?? 'this player'}? This will also delete their scores.`,
    );
    if (!ok) return;

    await db.transaction('rw', db.players, db.scoreEvents, async () => {
      await db.scoreEvents.where('playerId').equals(playerId).delete();
      await db.players.delete(playerId);
    });

    delete addAmounts[playerId];
    if (editingPlayerId === playerId) cancelRename();
    await load();
  }
</script>

<main class="min-h-screen bg-gray-100 p-6">
  <div class="max-w-xl mx-auto space-y-6">
    <h1 class="text-2xl font-bold text-center">Boardgame Scores</h1>

    <!-- Add player -->
    <div class="flex gap-2">
      <input
        class="flex-1 rounded border px-3 py-2"
        placeholder="Player name"
        bind:value={newPlayerName}
        on:keydown={(e) => e.key === 'Enter' && addPlayer()}
      />
      <button
        class="rounded bg-blue-600 px-4 py-2 text-white"
        on:click={addPlayer}
      >
        Add
      </button>
    </div>

    {#if players.length === 0}
      <p class="text-center opacity-60">No players yet</p>
    {/if}

    <ul class="space-y-3">
      {#each players as player (player.id)}
        <li class="rounded bg-white p-4 shadow">
          <div class="flex items-start justify-between gap-4">
            <!-- LEFT: name + icons + rename -->
            <div class="min-w-0 flex-1">
              {#if editingPlayerId === player.id}
                <input
                  class="w-full rounded border px-3 py-2"
                  bind:this={renameInput}
                  bind:value={editingName}
                  on:keydown={(e) => {
                    if (e.key === 'Enter') saveRename(player.id);
                    if (e.key === 'Escape') cancelRename();
                  }}
                />
                <div class="mt-2 flex gap-2">
                  <button
                    class="rounded bg-green-600 px-3 py-1 text-white"
                    on:click={() => saveRename(player.id)}
                  >
                    Save
                  </button>
                  <button
                    class="rounded bg-gray-200 px-3 py-1"
                    on:click={cancelRename}
                  >
                    Cancel
                  </button>
                </div>
              {:else}
                <div class="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    class="min-w-0 truncate text-left text-lg font-medium hover:underline"
                    on:click={() => startRename(player)}
                    disabled={editingPlayerId !== null}
                    aria-label="Edit player name"
                    title="Click to edit"
                  >
                    {player.name}
                  </button>

                  <button
                    class="rounded p-1 text-red-600 hover:bg-red-50"
                    on:click={() => removePlayer(player.id)}
                    disabled={editingPlayerId !== null}
                    aria-label="Remove player"
                    title="Remove"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              {/if}
            </div>

            <!-- RIGHT: score + quick add -->
            <div class="flex flex-col items-end gap-2">
              <div class="text-lg font-semibold tabular-nums">
                {totalFor(player.id)}
              </div>

              <div class="flex items-center gap-2">
                <input
                  class="w-24 rounded border px-3 py-2 text-right tabular-nums"
                  inputmode="decimal"
                  placeholder="1"
                  bind:value={addAmounts[player.id]}
                  on:keydown={(e) => {
                    if (e.key === 'Enter') submitAdd(player.id);
                  }}
                  disabled={editingPlayerId !== null}
                />
                <button
                  class="rounded bg-blue-600 px-4 py-2 text-white"
                  on:click={() => submitAdd(player.id)}
                  disabled={editingPlayerId !== null}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </li>
      {/each}
    </ul>
  </div>
</main>
