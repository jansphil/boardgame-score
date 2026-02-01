<script lang="ts">
  import type { Player, TabularRow, TabularScore } from '../db';

  export let players: Player[] = [];
  export let rows: TabularRow[] = [];
  export let scores: TabularScore[] = [];
  export let editingPlayerId: string | null = null;
  export let onAddRow: (name: string) => void;
  export let onRenameRow: (rowId: string, name: string) => void;
  export let onRemoveRow: (rowId: string) => void;
  export let onSetScore: (
    rowId: string,
    playerId: string,
    raw: string
  ) => void;

  let newRowName = '';
  let editingRowId: string | null = null;
  let editingRowName = '';
  let renameInput: HTMLInputElement | null = null;

  let scoreMap = new Map<string, number>();
  let totals: Record<string, number> = {};

  $: {
    const nextMap = new Map<string, number>();
    const nextTotals: Record<string, number> = {};

    for (const score of scores) {
      nextMap.set(`${score.rowId}:${score.playerId}`, score.value);
      nextTotals[score.playerId] = (nextTotals[score.playerId] ?? 0) + score.value;
    }

    scoreMap = nextMap;
    totals = nextTotals;
  }

  function scoreFor(rowId: string, playerId: string) {
    return scoreMap.get(`${rowId}:${playerId}`);
  }

  function startRowRename(row: TabularRow) {
    editingRowId = row.id;
    editingRowName = row.name;

    queueMicrotask(() => {
      renameInput?.focus();
      renameInput?.select();
    });
  }

  function cancelRowRename() {
    editingRowId = null;
    editingRowName = '';
  }

  function saveRowRename(rowId: string) {
    const name = editingRowName.trim();
    if (!name) return;
    onRenameRow(rowId, name);
    cancelRowRename();
  }

  function submitNewRow() {
    const name = newRowName.trim();
    if (!name) return;
    onAddRow(name);
    newRowName = '';
  }
</script>

<section class="mt-6 space-y-4">
  <div class="flex items-center justify-between gap-3">
    <h2 class="text-lg font-semibold">Tabular scoring</h2>
    <div class="flex gap-2">
      <input
        class="w-64 rounded border px-3 py-2"
        placeholder="Score row name"
        bind:value={newRowName}
        on:keydown={(e) => e.key === 'Enter' && submitNewRow()}
        disabled={editingPlayerId !== null}
      />
      <button
        class="rounded bg-blue-600 px-4 py-2 text-white"
        on:click={submitNewRow}
        disabled={editingPlayerId !== null}
      >
        Add row
      </button>
    </div>
  </div>

  {#if rows.length === 0}
    <p class="text-sm opacity-60">Add scoring rows to start the table.</p>
  {:else}
    <div class="overflow-x-auto rounded bg-white shadow">
      <table class="min-w-full border-separate border-spacing-0">
        <thead class="bg-gray-50 text-left text-sm">
          <tr>
            <th class="sticky left-0 z-10 w-48 border-b border-gray-200 bg-gray-50 p-3">
              Condition
            </th>
            {#each players as player (player.id)}
              <th class="border-b border-gray-200 p-3">{player.name}</th>
            {/each}
          </tr>
        </thead>
        <tbody class="text-sm">
          {#each rows as row (row.id)}
            <tr class="odd:bg-white even:bg-gray-50">
              <td class="sticky left-0 z-10 border-b border-gray-200 bg-inherit p-3">
                {#if editingRowId === row.id}
                  <input
                    class="w-full rounded border px-2 py-1"
                    bind:this={renameInput}
                    bind:value={editingRowName}
                    on:keydown={(e) => {
                      if (e.key === 'Enter') saveRowRename(row.id);
                      if (e.key === 'Escape') cancelRowRename();
                    }}
                  />
                  <div class="mt-2 flex gap-2">
                    <button
                      class="rounded bg-green-600 px-2 py-1 text-xs text-white"
                      on:click={() => saveRowRename(row.id)}
                    >
                      Save
                    </button>
                    <button
                      class="rounded bg-gray-200 px-2 py-1 text-xs"
                      on:click={cancelRowRename}
                    >
                      Cancel
                    </button>
                  </div>
                {:else}
                  <div class="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      class="min-w-0 truncate text-left font-medium hover:underline"
                      on:click={() => startRowRename(row)}
                      disabled={editingPlayerId !== null}
                      title="Click to edit"
                    >
                      {row.name}
                    </button>
                    <button
                      class="rounded p-1 text-red-600 hover:bg-red-50"
                      on:click={() => onRemoveRow(row.id)}
                      disabled={editingPlayerId !== null}
                      aria-label="Remove row"
                      title="Remove"
                    >
                      <span class="material-symbols-rounded text-[18px] leading-none">
                        delete
                      </span>
                    </button>
                  </div>
                {/if}
              </td>
              {#each players as player (player.id)}
                <td class="border-b border-gray-200 p-3">
                  <input
                    class="w-20 rounded border px-2 py-1 text-right tabular-nums"
                    inputmode="decimal"
                    value={scoreFor(row.id, player.id) ?? ''}
                    on:change={(e) =>
                      onSetScore(
                        row.id,
                        player.id,
                        (e.currentTarget as HTMLInputElement).value
                      )}
                    on:keydown={(e) => {
                      if (e.key === 'Enter') {
                        (e.currentTarget as HTMLInputElement).blur();
                      }
                    }}
                    disabled={editingPlayerId !== null}
                  />
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
        <tfoot class="bg-gray-100 text-sm font-semibold">
          <tr>
            <td class="sticky left-0 z-10 border-t border-gray-200 bg-gray-100 p-3">
              Total
            </td>
            {#each players as player (player.id)}
              <td class="border-t border-gray-200 p-3 text-right tabular-nums">
                {totals[player.id] ?? 0}
              </td>
            {/each}
          </tr>
        </tfoot>
      </table>
    </div>
  {/if}
</section>
