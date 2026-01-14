<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { KeyRound, Settings2 } from '@lucide/svelte';
	import {
		apiKeyDraft,
		clearApiKey,
		isSettingsOpen,
		loadApiKey,
		saveApiKey,
		setApiKeyDraft,
		settingsFeedback,
		toggleSettings
	} from '../stores/openrouter';

	let draftValue = '';
	let panelRef: HTMLDivElement | null = null;
	let inputRef: HTMLInputElement | null = null;
	const dialogTitleId = 'openrouter-settings-title';

	const unsubscribeDraft = apiKeyDraft.subscribe((value) => {
		draftValue = value;
	});

	onMount(() => {
		loadApiKey();
	});

	onDestroy(() => {
		unsubscribeDraft();
	});

	$: if ($isSettingsOpen) {
		tick().then(() => {
			if (panelRef) {
				panelRef.focus();
			}
			if (inputRef) {
				inputRef.focus();
				inputRef.select();
			}
		});
	}

	function handleInput(event: Event) {
		const next = (event.target as HTMLInputElement)?.value ?? '';
		setApiKeyDraft(next);
	}

	function handleSubmit(event: Event) {
		event.preventDefault();
		saveApiKey();
	}

	function handleClear() {
		clearApiKey();
	}

	function handleClose() {
		toggleSettings();
	}

	function handlePanelKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.stopPropagation();
			toggleSettings();
		}
	}
</script>

<div class="relative">
	<button
		type="button"
		on:click={toggleSettings}
		class="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
		aria-expanded={$isSettingsOpen}
		aria-controls="openrouter-settings-panel"
	>
		<Settings2 class="h-4 w-4" />
		{#if $isSettingsOpen}
			Close
		{:else}
			Settings
		{/if}
	</button>

	{#if $isSettingsOpen}
		<div
			id="openrouter-settings-panel"
			bind:this={panelRef}
			class="absolute right-0 z-20 mt-3 w-72 rounded-xl border border-slate-800 bg-slate-900/90 p-4 shadow-2xl shadow-black/30"
			tabindex="-1"
			role="dialog"
			aria-modal="true"
			aria-labelledby={dialogTitleId}
			on:keydown={handlePanelKeydown}
		>
			<form on:submit={handleSubmit} class="space-y-3">
				<div class="flex items-center justify-between text-sm font-semibold text-slate-200">
					<span id={dialogTitleId} class="inline-flex items-center gap-2">
						<KeyRound class="h-4 w-4 text-slate-400" />
						OpenRouter API Key
					</span>
					<button
						type="button"
						on:click={handleClose}
						class="text-xs font-medium text-slate-400 transition hover:text-slate-200"
					>
						Esc
					</button>
				</div>
				<label class="flex flex-col gap-2 text-sm text-slate-200">
					<input
						bind:this={inputRef}
						type="password"
						class="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
						placeholder="sk-or-..."
						value={draftValue}
						on:input={handleInput}
					/>
					<span class="text-xs text-slate-500"
						>Stored locally via chrome.storage (or localStorage during development).</span
					>
				</label>
				<div class="flex gap-2">
					<button
						type="submit"
						class="inline-flex flex-1 items-center justify-center rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-400"
					>
						Save
					</button>
					<button
						type="button"
						on:click={handleClear}
						class="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
					>
						Clear
					</button>
				</div>
				{#if $settingsFeedback}
					<p class="text-xs text-slate-400">{$settingsFeedback}</p>
				{/if}
			</form>
		</div>
	{/if}
</div>
