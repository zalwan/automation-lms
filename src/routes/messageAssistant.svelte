<script lang="ts">
	import { writable } from 'svelte/store';
	import { onDestroy, onMount } from 'svelte';
	import IconSend from '@lucide/svelte/icons/send-horizontal';
	import { Loader } from '@lucide/svelte';
	import { apiKey, loadApiKey } from '$lib/stores/openrouter';
	// Using default model routing via openrouter/auto
	import { chatStream } from '$lib/openrouter';

	const userInput = writable('');
	const messages = writable<{ role: 'user' | 'assistant'; text: string }[]>([]);
	const isLoading = writable(false);

	const MAX_RESPONSE_CHARS = 700; // keep answers focused and not too long

	let chatContainer: HTMLDivElement | null = null;
	let currentApiKey = '';

	const unsubscribeApiKey = apiKey.subscribe((value) => {
		currentApiKey = value;
	});

	// Model label removed per request; UI will not display model name.

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
			const controller = new AbortController();
			await chatStream(
				{
					messages: [
						{
							role: 'system',
							content:
								"You are a focused learning assistant. Answer only questions related to coursework, study, and learning strategies. If the prompt is outside the learning scope, briefly say it is outside the learning scope and do not answer. Always reply in the same language as the user's message (e.g., Indonesian in Indonesian, English in English). When declining, also decline in the user's language. When answering, be concise, direct, and helpful."
						},
						{ role: 'user', content: input }
					],
					temperature: 0.2,
					apiKey: key,
					signal: controller.signal
				},
				{
					onDelta: (content) => {
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
						// Hard cap the response length
						let current = '';
						messages.update((m) => {
							current = m[assistantIndex].text;
							return m;
						});
						if (current.length >= MAX_RESPONSE_CHARS) {
							controller.abort();
						}
					}
				}
			);

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
			// Ignore abort errors due to length cap
			if (
				error &&
				typeof error === 'object' &&
				'name' in error &&
				(error as any).name === 'AbortError'
			) {
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
				return;
			}
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
			<p class="text-sm text-slate-400">Help provide all questions related to assignments</p>
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
