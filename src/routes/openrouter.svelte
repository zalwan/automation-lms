<script lang="ts">
	import { writable } from 'svelte/store';
	import { onMount } from 'svelte';
	import IconSend from '@lucide/svelte/icons/send-horizontal';
	import { Loader2, KeyRound, Settings2 } from '@lucide/svelte';

	const userInput = writable('');
	const messages = writable<{ role: 'user' | 'assistant'; text: string }[]>([]);
	const isLoading = writable(false);

	let chatContainer: HTMLDivElement | null = null;
	let apiKey = '';
	let apiKeyDraft = '';
	let isSettingsOpen = false;
	let settingsFeedback = '';
	let feedbackTimeout: ReturnType<typeof setTimeout> | null = null;

	const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
	const STORAGE_KEY = 'openrouterApiKey';
	const MODEL_NAME = 'DeepSeek V3.1 (free)';

	function withFeedback(message: string) {
		if (feedbackTimeout) {
			clearTimeout(feedbackTimeout);
		}
		settingsFeedback = message;
		if (message) {
			feedbackTimeout = setTimeout(() => {
				settingsFeedback = '';
			}, 2800);
		}
	}

	function persistApiKey(value: string) {
		if (typeof chrome !== 'undefined' && chrome?.storage?.sync) {
			chrome.storage.sync.set({ [STORAGE_KEY]: value }, () => {
				if (chrome.runtime.lastError) {
					console.error('[LMalaS] Unable to store API key:', chrome.runtime.lastError.message);
					withFeedback('Could not store the API key. Try again.');
				}
			});
		} else if (typeof localStorage !== 'undefined') {
			localStorage.setItem(STORAGE_KEY, value);
		}
	}

	function removePersistedApiKey() {
		if (typeof chrome !== 'undefined' && chrome?.storage?.sync) {
			chrome.storage.sync.remove(STORAGE_KEY, () => {
				if (chrome.runtime.lastError) {
					console.error('[LMalaS] Unable to remove API key:', chrome.runtime.lastError.message);
					withFeedback('Could not remove the API key. Try again.');
				}
			});
		} else if (typeof localStorage !== 'undefined') {
			localStorage.removeItem(STORAGE_KEY);
		}
	}

	function loadApiKey() {
		if (typeof chrome !== 'undefined' && chrome?.storage?.sync) {
			chrome.storage.sync.get([STORAGE_KEY], (result) => {
				if (chrome.runtime.lastError) {
					console.error('[LMalaS] Unable to retrieve API key:', chrome.runtime.lastError.message);
					return;
				}
				const stored = result?.[STORAGE_KEY] ?? '';
				apiKey = stored;
				apiKeyDraft = stored;
			});
		} else if (typeof localStorage !== 'undefined') {
			const stored = localStorage.getItem(STORAGE_KEY) ?? '';
			apiKey = stored;
			apiKeyDraft = stored;
		}
	}

	function handleSaveApiKey() {
		apiKey = apiKeyDraft.trim();
		persistApiKey(apiKey);
		withFeedback(apiKey ? 'API key saved.' : 'API key cleared.');
	}

	function handleClearApiKey() {
		apiKey = '';
		apiKeyDraft = '';
		removePersistedApiKey();
		withFeedback('API key cleared.');
	}

	async function sendMessage() {
		const input = $userInput.trim();
		if (!input) return;

		messages.update((m) => [...m, { role: 'user', text: input }]);
		userInput.set('');

		const key = apiKey.trim();
		if (!key) {
			messages.update((m) => [
				...m,
				{
					role: 'assistant',
					text: 'Add your OpenRouter API key via Settings before sending prompts.'
				}
			]);
			scrollToBottom();
			return;
		}

		isLoading.set(true);

		let assistantIndex: number;
		messages.update((m) => {
			assistantIndex = m.length;
			return [...m, { role: 'assistant', text: '' }];
		});

		try {
			const res = await fetch(OPENROUTER_API_URL, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${key}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: 'deepseek/deepseek-chat-v3.1:free',
					messages: [{ role: 'user', content: input }],
					stream: true
				})
			});

			if (!res.ok || !res.body) {
				throw new Error(`Request failed with status ${res.status}`);
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });

				while (true) {
					const lineEnd = buffer.indexOf('\n');
					if (lineEnd === -1) break;

					const line = buffer.slice(0, lineEnd).trim();
					buffer = buffer.slice(lineEnd + 1);

					if (!line.startsWith('data: ')) continue;
					const data = line.slice(6);
					if (data === '[DONE]') break;

					try {
						const parsed = JSON.parse(data);
						const content = parsed?.choices?.[0]?.delta?.content;
						if (content) {
							messages.update((m) => {
								m[assistantIndex].text += content;
								return m;
							});
							scrollToBottom();
						}
					} catch (e) {
						console.warn('Invalid JSON chunk', line);
					}
				}
			}
		} catch (err) {
			console.error(err);
			messages.update((m) => {
				m[assistantIndex].text = 'Something went wrong while reaching OpenRouter.';
				return m;
			});
		} finally {
			isLoading.set(false);
		}
	}

	function handleKey(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	function scrollToBottom() {
		if (chatContainer) {
			setTimeout(() => {
				chatContainer!.scrollTop = chatContainer!.scrollHeight;
			}, 60);
		}
	}

	onMount(() => {
		loadApiKey();
		scrollToBottom();
	});
</script>

<section class="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl backdrop-blur">
	<header class="flex items-start justify-between gap-3">
		<div class="space-y-1">
			<h2 class="text-base font-semibold text-slate-100">AI Assistant</h2>
			<p class="text-sm text-slate-400">Chat with {MODEL_NAME} via OpenRouter.</p>
		</div>
		<button
			type="button"
			on:click={() => {
				isSettingsOpen = !isSettingsOpen;
				withFeedback('');
			}}
			class="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
		>
			<Settings2 class="h-4 w-4" />
			{isSettingsOpen ? 'Close' : 'Settings'}
		</button>
	</header>

	{#if isSettingsOpen}
		<form
			on:submit|preventDefault={handleSaveApiKey}
			class="mt-4 space-y-3 rounded-xl border border-slate-800 bg-slate-900/80 p-4"
		>
			<label class="flex flex-col gap-2 text-sm text-slate-200">
				<span class="inline-flex items-center gap-2 font-medium">
					<KeyRound class="h-4 w-4 text-slate-400" />
					OpenRouter API Key
				</span>
				<input
					type="password"
					class="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
					placeholder="sk-or-..."
					bind:value={apiKeyDraft}
				/>
				<span class="text-xs text-slate-500">Stored locally via chrome.storage (or localStorage during development).</span>
			</label>
			<div class="flex gap-2">
				<button
					type="submit"
					class="inline-flex items-center justify-center rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-400"
				>
					Save
				</button>
				<button
					type="button"
					on:click={handleClearApiKey}
					class="inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
				>
					Clear
				</button>
			</div>
			{#if settingsFeedback}
				<p class="text-xs text-slate-400">{settingsFeedback}</p>
			{/if}
		</form>
	{/if}

	<div
		bind:this={chatContainer}
		class="mt-4 flex h-60 flex-col gap-2 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/40 p-3"
	>
		{#each $messages as msg, index (index)}
			<div class={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
				<div
					class={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-lg shadow-black/20 ${msg.role === 'user' ? 'bg-sky-500 text-white rounded-br-sm' : 'bg-slate-800/80 text-slate-100 rounded-bl-sm'}`}
				>
					{msg.text}
				</div>
			</div>
		{/each}

		{#if $isLoading}
			<div class="flex items-center gap-2 text-sm text-slate-400">
				<Loader2 class="h-4 w-4 animate-spin" />
				Thinking...
			</div>
		{/if}
	</div>

	<div class="mt-4 flex gap-2">
		<textarea
			bind:value={$userInput}
			on:keydown={handleKey}
			class="flex-1 resize-none rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
			placeholder="Write your prompt and press Enter..."
			rows="2"
		></textarea>
		<button
			type="button"
			on:click={sendMessage}
			disabled={$isLoading}
			class="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500 text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
		>
			<IconSend class="h-5 w-5" />
		</button>
	</div>

	<p class="mt-2 text-xs text-slate-500">
		Shift + Enter inserts a new line. Responses stream in real time once the OpenRouter API key is set.
	</p>
</section>

<style>
	textarea {
		min-height: 2.5rem;
		max-height: 7.5rem;
		overflow-y: auto;
	}
</style>