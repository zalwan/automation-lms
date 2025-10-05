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
		isAnswered: boolean;
	};

	type SolveLog = {
		question: string;
		answer: string;
		matchedOption?: string;
		error?: string;
	};

	type NavigationOutcome = {
		success: boolean;
		disabled?: boolean;
	};

	const STORAGE_KEY = 'openrouterApiKey';
	const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
	const MODEL_ID = 'deepseek/deepseek-chat-v3.1:free';
	const MAX_AUTO_STEPS = 40;
	const QUESTION_POLL_ATTEMPTS = 30;
	const QUESTION_POLL_INTERVAL = 350;

	let isSolving = false;
	let logs: SolveLog[] = [];
	let statusMessage = '';

	function updateStatus(message: string) {
		statusMessage = message;
	}

	function appendLog(entry: SolveLog) {
		logs = [{ ...entry }, ...logs].slice(0, 20);
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
			const answerTokens = normalizedAnswer.split(' ');
			const overlap = answerTokens.filter((token) => normalizedOption.includes(token)).length;
			const score = overlap / Math.max(answerTokens.length, 1);
			if (!best || score > best.score) {
				best = { option, score };
			}
		}

		return best?.score && best.score >= 0.2 ? best.option : undefined;
	}

	async function fetchVisibleQuestion(tabId: number): Promise<QuestionPayload | null> {
		if (!hasChromeApis()) return null;
		const [{ result }] = await chrome.scripting.executeScript({
			target: { tabId },
			func: () => {
				const block = document.querySelector<HTMLDivElement>('div.MuiPaper-root[id]');
				if (!block) return null;

				const questionId = block.id;
				const questionText = block
					.querySelector('.ck-content')
					?.textContent?.replace(/\s+/g, ' ')
					.trim();
				if (!questionId || !questionText) return null;

				const optionNodes = Array.from(
					block.querySelectorAll<HTMLLabelElement>('label.MuiFormControlLabel-root') ?? []
				);

				const options = optionNodes
					.map((label, index) => {
						const letterRaw = label
							.querySelector('p')
							?.textContent?.replace(/[^A-Za-z]/g, '')
							.trim();
						const optionText = label
							.querySelector('.ck-content')
							?.textContent?.replace(/\s+/g, ' ')
							.trim();
						if (!optionText) return null;
						return {
							letter: letterRaw && letterRaw.length > 0 ? letterRaw : String.fromCharCode(65 + index),
							text: optionText,
							index
						};
					})
					.filter(Boolean) as Option[];

				const chipLabels = Array.from(
					block.querySelectorAll('.MuiChip-label, .MuiChip-labelSmall') ?? []
				).map((chip) => chip.textContent?.trim().toLowerCase() ?? '');
				const statusLabel = chipLabels.find((text) => /belum/i.test(text) || /sudah/i.test(text)) ?? '';
				const anyChecked = !!block.querySelector('input[type="radio"]:checked');
				const isAnswered = statusLabel ? !/belum/i.test(statusLabel) : anyChecked;

				return {
					questionId,
					questionText,
					options,
					isAnswered
				};
			}
		});

		return result ?? null;
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

	async function goToNextQuestion(tabId: number): Promise<NavigationOutcome> {
		if (!hasChromeApis()) return { success: false };
		const [{ result }] = await chrome.scripting.executeScript({
			target: { tabId },
			func: () => {
				const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
				const nextButton = buttons.find((button) => button.textContent?.trim().toLowerCase().startsWith('next'));
				if (!nextButton) {
					return { success: false };
				}
				if (nextButton.disabled) {
					return { success: false, disabled: true };
				}
				nextButton.click();
				return { success: true };
			}
		});

		return result ?? { success: false };
	}

	async function waitForQuestionChange(
		tabId: number,
		previousQuestionId: string,
		attempts = QUESTION_POLL_ATTEMPTS,
		interval = QUESTION_POLL_INTERVAL
	): Promise<QuestionPayload | null> {
		for (let attempt = 0; attempt < attempts; attempt += 1) {
			const question = await fetchVisibleQuestion(tabId);
			if (question && question.questionId && question.questionId !== previousQuestionId) {
				return question;
			}
			await new Promise((resolve) => setTimeout(resolve, interval));
		}
		return null;
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
		logs = [];
		updateStatus('Starting automatic pre-test solver...');

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

			let currentQuestion = await fetchVisibleQuestion(tabId);
			if (!currentQuestion) {
				updateStatus('Could not find any multiple-choice question on the page.');
				isSolving = false;
				return;
			}

			let step = 0;
			while (currentQuestion && step < MAX_AUTO_STEPS) {
				step += 1;
				updateStatus(`Solving question ${step}: ${currentQuestion.questionText.slice(0, 64)}...`);

				if (currentQuestion.isAnswered) {
					appendLog({
						question: currentQuestion.questionText,
						answer: '',
						error: 'Skipped (already answered on the page).'
					});
				} else if (currentQuestion.options.length === 0) {
					appendLog({
						question: currentQuestion.questionText,
						answer: '',
						error: 'No options detected for this question.'
					});
				} else {
					try {
						const answer = await askOpenRouter(key, currentQuestion);
						const matched = matchOption(answer, currentQuestion.options);

						if (!matched) {
							appendLog({
								question: currentQuestion.questionText,
								answer,
								error: 'Could not map the answer to any option.'
							});
						} else {
							await submitAnswer(tabId, {
								questionId: currentQuestion.questionId,
								optionIndex: matched.index
							});

							appendLog({
								question: currentQuestion.questionText,
								answer,
								matchedOption: `${matched.letter}. ${matched.text}`
							});
						}
					} catch (error) {
						const message = error instanceof Error ? error.message : 'Unknown error occurred.';
						appendLog({
							question: currentQuestion.questionText,
							answer: '',
							error: message
						});
					}
				}

				const navigation = await goToNextQuestion(tabId);
				if (!navigation.success) {
					if (navigation.disabled) {
						updateStatus('Reached the end of the pre-test. Review your answers before submitting.');
					} else {
						updateStatus('Unable to move to the next question. Check the page manually.');
					}
					break;
				}

				updateStatus('Waiting for the next question to load...');
				const nextQuestion = await waitForQuestionChange(tabId, currentQuestion.questionId);
				if (!nextQuestion) {
					updateStatus('Timed out while waiting for the next question. Solve the rest manually.');
					break;
				}

				currentQuestion = nextQuestion;
			}

			if (step >= MAX_AUTO_STEPS) {
				updateStatus('Stopped after solving multiple questions to avoid an infinite loop.');
			} else if (!statusMessage) {
				updateStatus('Completed. Review answers before submitting the pre-test.');
			}
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
				Scan the active Mentari pre-test question(s), ask the assistant for the most likely answer, and
				apply it automatically while navigating through the quiz.
			</p>
		</div>
		<button
			type="button"
			on:click={solvePretest}
			disabled={isSolving}
			class="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
		>
			{isSolving ? 'Solving...' : 'Solve Remaining Questions'}
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
