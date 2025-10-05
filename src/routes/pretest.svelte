<script lang="ts">
	function hasChromeApis() {
		return typeof chrome !== 'undefined' && !!chrome?.scripting && !!chrome?.tabs;
	}

	type Option = {
		letter: string;
		text: string;
		index: number;
	};

	type QuestionPayload = {
		questionId: string;
		questionText: string;
		options: Option[];
	};

	type SolveLog = {
		question: string;
		answer: string;
		matchedOption?: string;
		error?: string;
	};

	const STORAGE_KEY = 'openrouterApiKey';
	const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
	const MODEL_ID = 'deepseek/deepseek-chat-v3.1:free';

	let isSolving = false;
	let logs: SolveLog[] = [];
	let statusMessage = '';

	function updateStatus(message: string) {
		statusMessage = message;
	}

	function appendLog(entry: SolveLog) {
		logs = [{ ...entry }, ...logs].slice(0, 10);
	}

	function loadApiKey(): Promise<string> {
		return new Promise((resolve) => {
			if (typeof chrome !== 'undefined' && chrome?.storage?.sync) {
				chrome.storage.sync.get([STORAGE_KEY], (result) => {
					if (chrome.runtime.lastError) {
						console.error('[LMalaS] Unable to load API key:', chrome.runtime.lastError.message);
						return resolve('');
					}
					resolve(result?.[STORAGE_KEY] ?? '');
				});
			} else if (typeof localStorage !== 'undefined') {
				resolve(localStorage.getItem(STORAGE_KEY) ?? '');
			} else {
				resolve('');
			}
		});
	}

	async function getActiveTabId(): Promise<number | null> {
		if (!hasChromeApis()) return null;
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		return tab?.id ?? null;
	}

	function normalizeText(value: string) {
		return value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, ' ')
			.trim();
	}

	function matchOption(answerRaw: string, options: Option[]): Option | undefined {
		const cleaned = answerRaw.trim().toUpperCase();
		const letterMatches = cleaned.match(/[A-Z]/g);
		if (letterMatches && letterMatches.length > 0) {
			const letter = letterMatches[letterMatches.length - 1];
			const byLetter = options.find((opt) => opt.letter.toUpperCase().startsWith(letter));
			if (byLetter) return byLetter;
		}

		const normalizedAnswer = normalizeText(answerRaw);
		let best: { option: Option; score: number } | undefined;

		for (const option of options) {
			const normalizedOption = normalizeText(option.text);
			if (!normalizedAnswer || !normalizedOption) continue;
			const overlap = normalizedAnswer
				.split(' ')
				.filter((token) => normalizedOption.includes(token)).length;
			const score = overlap / Math.max(normalizedAnswer.split(' ').length, 1);
			if (!best || score > best.score) {
				best = { option, score };
			}
		}

		return best?.score && best.score >= 0.2 ? best.option : undefined;
	}

	async function fetchQuestions(tabId: number): Promise<QuestionPayload[]> {
		if (!hasChromeApis()) return [];
		const [{ result }] = await chrome.scripting.executeScript({
			target: { tabId },
			func: () => {
				const blocks = Array.from(
					document.querySelectorAll<HTMLDivElement>('div.MuiPaper-root[id]') ?? []
				);

				return blocks
					.map((block) => {
						const questionText = block
							.querySelector('.ck-content')
							?.textContent?.replace(/\s+/g, ' ')
							.trim();
						if (!questionText) return null;

						const optionNodes = Array.from(
							block.querySelectorAll<HTMLLabelElement>('label.MuiFormControlLabel-root') ?? []
						);

						const options = optionNodes
							.map((label, index) => {
								const letter = label
									.querySelector('p')
									?.textContent?.replace(/[^A-Za-z]/g, '')
									.trim();
								const optionText = label
									.querySelector('.ck-content')
									?.textContent?.replace(/\s+/g, ' ')
									.trim();

								if (!optionText) return null;

								return {
									letter: letter || String.fromCharCode(65 + index),
									text: optionText,
									index
								};
							})
							.filter(Boolean);

						if (options.length === 0) return null;

						return {
							questionId: block.id,
							questionText,
							options: options as Option[]
						};
					})
					.filter(Boolean) as QuestionPayload[];
			}
		});

		return result ?? [];
	}

	async function submitAnswer(tabId: number, payload: { questionId: string; optionIndex: number }) {
		if (!hasChromeApis()) return;
		await chrome.scripting.executeScript({
			target: { tabId },
			args: [payload],
			func: ({ questionId, optionIndex }) => {
				const block = document.getElementById(questionId);
				if (!block) return false;
				const labels = block.querySelectorAll('label.MuiFormControlLabel-root');
				const target = labels?.[optionIndex];
				const input = target?.querySelector<HTMLInputElement>('input[type="radio"]');
				if (!input) return false;
				input.click();
				input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
				input.dispatchEvent(new Event('input', { bubbles: true }));
				input.dispatchEvent(new Event('change', { bubbles: true }));
				return true;
			}
		});
	}

	async function askOpenRouter(key: string, question: QuestionPayload): Promise<string> {
		const prompt = `Question: ${question.questionText}\nOptions:\n${question.options
			.map((opt) => `${opt.letter}. ${opt.text}`)
			.join('\n')}\n\nSelect the best answer and respond with the option letter only.`;

		const response = await fetch(OPENROUTER_API_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${key}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: MODEL_ID,
				messages: [
					{
						role: 'system',
						content:
							'You are a specialist at answering multiple-choice questions. Reply with the single letter of the best option (A, B, C, etc.).'
					},
					{
						role: 'user',
						content: prompt
					}
				],
				max_tokens: 16,
				temperature: 0
			})
		});

		if (!response.ok) {
			throw new Error(`OpenRouter request failed with status ${response.status}`);
		}

		const data = await response.json();
		const answer = data?.choices?.[0]?.message?.content?.trim();
		if (!answer) {
			throw new Error('OpenRouter returned an empty response.');
		}
		return answer;
	}

	async function solvePretest() {
		if (isSolving) return;

		isSolving = true;
		updateStatus('Fetching question from active tab...');

		if (!hasChromeApis()) {
			updateStatus('Chrome extension APIs are not available in this context.');
			isSolving = false;
			return;
		}

		try {
			const key = await loadApiKey();
			if (!key) {
				updateStatus('Add your OpenRouter API key in Settings first.');
				isSolving = false;
				return;
			}

			const tabId = await getActiveTabId();
			if (!tabId) {
				updateStatus('No active tab detected. Open the Mentari pre-test page.');
				isSolving = false;
				return;
			}

			const questions = await fetchQuestions(tabId);
			if (questions.length === 0) {
				updateStatus('Could not find any multiple-choice questions on the page.');
				isSolving = false;
				return;
			}

			for (const question of questions) {
				updateStatus(`Solving question: ${question.questionText.slice(0, 64)}...`);

				try {
					const answer = await askOpenRouter(key, question);
					const matched = matchOption(answer, question.options);

					if (!matched) {
						appendLog({
							question: question.questionText,
							answer,
							error: 'Could not map the answer to any option.'
						});
						continue;
					}

					await submitAnswer(tabId, {
						questionId: question.questionId,
						optionIndex: matched.index
					});

					appendLog({
						question: question.questionText,
						answer,
						matchedOption: `${matched.letter}. ${matched.text}`
					});
				} catch (error) {
					const message = error instanceof Error ? error.message : 'Unknown error occurred.';
					appendLog({
						question: question.questionText,
						answer: '',
						error: message
					});
				}
			}

			updateStatus('Completed. Review answers before submitting the pre-test.');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error occurred.';
			console.error('[LMalaS] Pre-test solve failed:', message);
			updateStatus(message);
		} finally {
			isSolving = false;
		}
	}
</script>

<section class="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl backdrop-blur">
	<header class="flex items-start justify-between gap-3">
		<div class="space-y-1">
			<h2 class="text-base font-semibold text-slate-100">Pre-test Auto Solver</h2>
			<p class="text-sm text-slate-400">
				Scan the active Mentari pre-test question, ask the assistant for the most likely answer, and
				apply it automatically.
			</p>
		</div>
		<button
			type="button"
			on:click={solvePretest}
			disabled={isSolving}
			class="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
		>
			{isSolving ? 'Solving...' : 'Solve Visible Question'}
		</button>
	</header>

	{#if statusMessage}
		<p class="mt-4 text-xs text-slate-400">{statusMessage}</p>
	{/if}

	{#if logs.length > 0}
		<ul class="mt-4 space-y-3">
			{#each logs as log}
				<li class="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
					<p class="text-xs font-medium text-slate-300">{log.question}</p>
					{#if log.matchedOption}
						<p class="mt-1 text-xs text-emerald-400">Selected: {log.matchedOption}</p>
					{/if}
					{#if log.answer}
						<p class="mt-1 text-[11px] text-slate-500">Model response: {log.answer}</p>
					{/if}
					{#if log.error}
						<p class="mt-1 text-xs text-rose-400">{log.error}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
