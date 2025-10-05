<script lang="ts">
	import { writable } from 'svelte/store';
	import { onDestroy, onMount } from 'svelte';
	import IconSend from '@lucide/svelte/icons/send-horizontal';
	import { Loader } from '@lucide/svelte';
	import { apiKey, loadApiKey } from '$lib/stores/openrouter';

	const userInput = writable('');
	const messages = writable<{ role: 'user' | 'assistant'; text: string }[]>([]);
	const isLoading = writable(false);

	let chatContainer: HTMLDivElement | null = null;
	let currentApiKey = '';

	const unsubscribeApiKey = apiKey.subscribe((value) => {
		currentApiKey = value;
	});

	const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
	const MODEL_NAME = 'DeepSeek V3.1 (free)';

	onDestroy(() => {
		unsubscribeApiKey();
	});

	async function sendMessage() {
		const input = $userInput.trim();
		if (!input) return;

		messages.update((m) => [...m, { role: 'user', text: input }]);
		userInput.set('');

		const key = currentApiKey.trim();
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
				throw new Error(`OpenRouter request failed with status ${res.status}`);
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let streamComplete = false;

			type StreamChunk = { choices?: { delta?: { content?: string } }[] };

			const processEventBlock = (block: string) => {
				for (const line of block.split('\n')) {
					const trimmed = line.trim();
					if (!trimmed.startsWith('data:')) continue;

					const payload = trimmed.slice(5).trim();
					if (!payload) continue;

					if (payload === '[DONE]') {
						streamComplete = true;
						return;
					}

					try {
						const parsed = JSON.parse(payload) as StreamChunk;
						const content = parsed.choices?.[0]?.delta?.content;
						if (content) {
							messages.update((m) => {
								const next = [...m];
								next[assistantIndex] = {
									...next[assistantIndex],
									text: `${next[assistantIndex].text}${content}`
								};
								return next;
							});
							if (chatContainer) {
								chatContainer.scrollTop = chatContainer.scrollHeight;
							}
						}
					} catch (err) {
						console.error('[LMalaS] Failed to parse OpenRouter chunk:', err);
					}
				}
			};

			while (!streamComplete) {
				const { value, done } = await reader.read();
				if (done) {
					buffer += decoder.decode();
					if (buffer.trim()) {
						processEventBlock(buffer);
					}
					break;
				}

				const chunk = decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
				buffer += chunk;

				let separatorIndex = buffer.indexOf('\n\n');
				while (separatorIndex !== -1) {
					const eventBlock = buffer.slice(0, separatorIndex);
					buffer = buffer.slice(separatorIndex + 2);
					processEventBlock(eventBlock);
					if (streamComplete) break;
					separatorIndex = buffer.indexOf('\n\n');
				}

				if (streamComplete) {
					break;
				}
			}

			isLoading.set(false);
			messages.update((m) => {
				const next = [...m];
				next[assistantIndex] = {
					...next[assistantIndex],
					text: next[assistantIndex].text.trim()
				};
				return next;
			});
			scrollToBottom();
		} catch (error) {
			console.error('[LMalaS] OpenRouter request error:', error);
			isLoading.set(false);
			messages.update((m) => [
				...m,
				{
					role: 'assistant',
					text: 'There was a problem contacting OpenRouter. Check the console for details.'
				}
			]);
			scrollToBottom();
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
	</header>

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
				<Loader class="h-4 w-4 animate-spin" />
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
		Shift + Enter inserts a new line. Responses stream in real time once the OpenRouter API key is
		set.
	</p>
</section>

<style>
	textarea {
		min-height: 2.5rem;
		max-height: 7.5rem;
		overflow-y: auto;
	}
</style>
