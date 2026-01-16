<script lang="ts">
	type ScaleMode = 'selalu' | 'sering' | 'kadang' | 'tidak' | 'random';
	type Summary = {
		answered: number;
		skipped: number;
		groups: number;
		steps: number;
		reason: string;
	};

	async function fillExamRadiosInPage(mode: ScaleMode): Promise<Summary> {
		const MODE_LABEL: Record<ScaleMode, string> = {
			selalu: 'Selalu',
			sering: 'Sering',
			kadang: 'Kadang-kadang',
			tidak: 'Tidak Pernah',
			random: 'Random Mix'
		};
		const NEXT_LABELS = ['selanjutnya', 'next', 'lanjut'];
		const SAVE_LABELS = ['simpan', 'save'];
		const MAX_STEPS = 40;
		const POLL_ATTEMPTS = 20;
		const POLL_INTERVAL = 350;
		const SELECTION_DELAY = 90;
		const RETRY_DELAY = 160;
		const MAX_SELECT_ATTEMPTS = 2;
		const STEP_SETTLE_DELAY = 450;

		const normalizeText = (value: string) =>
			value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
		const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

		const getOptionLabel = (option: HTMLElement) => {
			const label = option.querySelector<HTMLElement>('.q-radio__label');
			return (
				label?.textContent?.trim() ??
				option.getAttribute('aria-label') ??
				option.textContent?.trim() ??
				''
			);
		};

		const setCheckedState = (option: HTMLElement, checked: boolean) => {
			option.setAttribute('aria-checked', checked ? 'true' : 'false');
			const input = option.querySelector<HTMLInputElement>('input[type="radio"]');
			if (input) input.checked = checked;
			const inner = option.querySelector<HTMLElement>('.q-radio__inner');
			if (inner) {
				inner.classList.toggle('q-radio__inner--truthy', checked);
				inner.classList.toggle('q-radio__inner--falsy', !checked);
				inner.classList.toggle('text-blue-6', checked);
			}
		};

		const isChecked = (option: HTMLElement) => {
			const input = option.querySelector<HTMLInputElement>('input[type="radio"]');
			if (input?.checked) return true;
			if (option.getAttribute('aria-checked') === 'true') return true;
			return (
				option
					.querySelector<HTMLElement>('.q-radio__inner')
					?.classList.contains('q-radio__inner--truthy') ?? false
			);
		};

		const triggerClick = (el: HTMLElement | null) => {
			if (!el) return;
			const eventInit: MouseEventInit = { bubbles: true, cancelable: true, view: window };
			if (typeof PointerEvent !== 'undefined') {
				el.dispatchEvent(new PointerEvent('pointerdown', eventInit));
				el.dispatchEvent(new PointerEvent('pointerup', eventInit));
			}
			el.dispatchEvent(new MouseEvent('mousedown', eventInit));
			el.dispatchEvent(new MouseEvent('mouseup', eventInit));
			el.dispatchEvent(new MouseEvent('click', eventInit));
		};

		const triggerKey = (el: HTMLElement | null, key: string, code: string) => {
			if (!el) return;
			const eventInit: KeyboardEventInit = { bubbles: true, cancelable: true, key, code };
			el.dispatchEvent(new KeyboardEvent('keydown', eventInit));
			el.dispatchEvent(new KeyboardEvent('keyup', eventInit));
		};

		const emitVueUpdate = (group: HTMLElement, value: any) => {
			const vm =
				(group as any).__vueParentComponent ??
				(group.parentElement as any)?.__vueParentComponent ??
				null;
			const emitter = vm?.emit ?? vm?.ctx?.emit;
			if (typeof emitter === 'function') {
				try {
					emitter('update:modelValue', value);
					emitter('update:model-value', value);
					emitter('input', value);
				} catch (err) {
					console.warn('[LMalaS] Vue emit failed', err);
				}
			}
		};

		const commitSelection = (
			input: HTMLInputElement,
			group: HTMLElement,
			value: any
		) => {
			if (value !== undefined && value !== null) {
				input.value = String(value);
			}
			input.checked = true;
			input.dispatchEvent(new Event('input', { bubbles: true }));
			input.dispatchEvent(new Event('change', { bubbles: true }));
			group.dispatchEvent(new Event('input', { bubbles: true }));
			group.dispatchEvent(new Event('change', { bubbles: true }));
			emitVueUpdate(group, value);
		};

		const forceSelectOption = async (
			option: HTMLElement,
			group: HTMLElement,
			allOptions: HTMLElement[],
			value: any
		): Promise<boolean> => {
			const input = option.querySelector<HTMLInputElement>('input[type="radio"]');
			if (option.tabIndex >= 0) option.focus();

			// 1. Try native click on the wrapper (most reliable for Vue/Quasar)
			option.click();
			await sleep(50); // Give Vue time to process

			// 2. Check if that worked
			let selected = isChecked(option);

			// 3. Fallback: Try synthetic events on wrapper
			if (!selected) {
				triggerClick(option);
				triggerKey(option, ' ', 'Space');
				await sleep(50);
				selected = isChecked(option);
			}

			// 4. Fallback: Direct input manipulation
			if (!selected && input) {
				input.click();
				await sleep(50);
				commitSelection(input, group, value);
				selected = isChecked(option);
			}

			// 5. Final Fallback: Force visual state to ensure we don't get stuck
			if (!selected) {
				allOptions.forEach((opt) => setCheckedState(opt, opt === option));
			}

			return isChecked(option);
		};

		const isVisible = (el: HTMLElement) =>
			!!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

		const getStepRoot = () => {
			const steps = Array.from(document.querySelectorAll<HTMLElement>('.q-stepper__step'));
			const active =
				steps.find((step) => step.classList.contains('q-stepper__step--active')) ??
				steps.find((step) => isVisible(step));
			return active ?? document.documentElement;
		};

		const getButtons = () => {
			const raw = Array.from(
				document.querySelectorAll<HTMLElement>('button, [role="button"], .q-btn')
			);
			const dedup = Array.from(new Set(raw)); // avoid duplicates from overlapping selectors
			return dedup.filter((btn) => isVisible(btn));
		};

		const getButtonLabel = (btn: HTMLElement) =>
			normalizeText(btn.textContent ?? btn.getAttribute('aria-label') ?? '');

		const hasSaveButton = (buttons: HTMLElement[]) =>
			buttons.some((btn) => SAVE_LABELS.some((label) => getButtonLabel(btn).includes(label)));

		const findNextButton = (buttons: HTMLElement[]) =>
			buttons.find((btn) => NEXT_LABELS.some((label) => getButtonLabel(btn).includes(label)));

		const getStepMarker = () => {
			const root = getStepRoot();
			const activeTitle =
				document.querySelector('.q-stepper__tab--active .q-stepper__title')?.textContent?.trim() ??
				'';
			const firstQuestion =
				root.querySelector('.q-field__label')?.textContent?.trim() ?? '';
			return normalizeText(`${activeTitle}|${firstQuestion}`);
		};

		const waitForStepChange = async (marker: string) => {
			for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
				await sleep(POLL_INTERVAL);
				if (getStepMarker() !== marker) return true;
			}
			return false;
		};

		const matchScore = (label: string, variant: string) => {
			if (label === variant) return 3;
			if (` ${label} `.includes(` ${variant} `)) return 2;
			if (label.includes(variant)) return 1;
			return 0;
		};

		const variantMap: Record<Exclude<ScaleMode, 'random'>, string[]> = {
			selalu: ['selalu', 'sangat mampu'],
			sering: ['sering', 'mampu'],
			kadang: ['kadang-kadang', 'kadang kadang', 'kurang mampu'],
			tidak: ['tidak', 'tidak pernah', 'tidak mampu']
		};

		type OptionMeta = { el: HTMLElement; value: any; label: string };

		const pickOptionForMode = (options: OptionMeta[], mode: Exclude<ScaleMode, 'random'>) => {
			const variants = variantMap[mode].map((variant) => normalizeText(variant));
			let best: { option: OptionMeta; score: number } | null = null;

			for (const option of options) {
				const label = normalizeText(option.label);
				let score = 0;
				for (const variant of variants) {
					score = Math.max(score, matchScore(label, variant));
				}
				if (score > 0 && (!best || score > best.score)) {
					best = { option, score };
				}
			}

			return best?.option;
		};

		const fillCurrentStep = async (): Promise<{
			answered: number;
			skipped: number;
			groups: number;
			complete: boolean;
		}> => {
			const root = getStepRoot();
			const groups = Array.from(
				root.querySelectorAll<HTMLElement>('[role="radiogroup"], .q-option-group')
			).filter((group) => isVisible(group));
			if (groups.length === 0) {
				console.warn('[LMalaS] No exam questionnaire groups detected on this step.');
				return { answered: 0, skipped: 0, groups: 0, complete: false };
			}

			let counter = 1;
			let answered = 0;
			let skipped = 0;

			for (let index = 0; index < groups.length; index += 1) {
				const group = groups[index];
				const block = group.closest<HTMLElement>('.q-field') ?? group;
				let questionText =
					block.querySelector<HTMLElement>('.q-field__label')?.textContent?.trim() ??
					`Group ${index + 1}`;
				questionText = questionText.replace(/^\d+\.\s*/, '');
				const rawOptions = Array.from(
					group.querySelectorAll<HTMLElement>('input[type="radio"]').length
						? group.querySelectorAll<HTMLElement>('input[type="radio"]')
						: group.querySelectorAll<HTMLElement>('[role="radio"], .q-radio')
				);
				const options: OptionMeta[] = rawOptions.map((el, idx) => {
					const radioEl = (el.closest('.q-radio') as HTMLElement) ?? el;
					const input = radioEl.querySelector<HTMLInputElement>('input[type="radio"]');
					const labelText = getOptionLabel(radioEl);
					const explicitVal =
						input?.value?.trim() ||
						radioEl.getAttribute('data-value') ||
						radioEl.getAttribute('value');
					// Default to 1-based index if no explicit value found. This is critical for Likert scales.
					const value = explicitVal && explicitVal !== '' ? explicitVal : idx + 1;
					return { el: radioEl, value, label: labelText };
				});

				if (options.length === 0) {
					skipped += 1;
					continue;
				}

				let target: OptionMeta | undefined;
				if (mode === 'random') {
					target = options[Math.floor(Math.random() * options.length)];
				} else {
					target = pickOptionForMode(options, mode);
				}

				if (!target) {
					skipped += 1;
					continue;
				}

				const attemptTargets = [target, options[0]].filter(Boolean) as OptionMeta[];
				let applied = false;
				for (let attempt = 0; attempt < MAX_SELECT_ATTEMPTS && !applied; attempt += 1) {
					for (const candidate of attemptTargets) {
						applied = await forceSelectOption(candidate.el, group, options.map(o => o.el), candidate.value);
						if (applied) {
							target = candidate;
							break;
						}
					}
					if (!applied) {
						await sleep(RETRY_DELAY);
					}
				}

				const pickedLabel = target.label || MODE_LABEL[mode];
				console.log(`[LMalaS] Exam questionnaire ${counter}. ${questionText} - ${pickedLabel}`);
				counter += 1;
				if (isChecked(target.el)) {
					answered += 1;
				} else {
					skipped += 1;
					console.warn('[LMalaS] Selection not confirmed for:', questionText);
				}
				await sleep(SELECTION_DELAY);
			}

			const complete = groups.every((group) => {
				const checked =
					group.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ??
					group.querySelector<HTMLInputElement>('input[type="radio"]:checked');
				return !!checked;
			});
			return { answered, skipped, groups: groups.length, complete };
		};

		const isStepComplete = () => {
			const root = getStepRoot();
			const groups = Array.from(
				root.querySelectorAll<HTMLElement>('[role="radiogroup"], .q-option-group')
			).filter((group) => isVisible(group));
			if (groups.length === 0) return false;
			return groups.every((group) => {
				const checked =
					group.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ??
					group.querySelector<HTMLInputElement>('input[type="radio"]:checked');
				return !!checked;
			});
		};

		const summary: Summary = { answered: 0, skipped: 0, groups: 0, steps: 0, reason: '' };

		for (let step = 0; step < MAX_STEPS; step += 1) {
			const marker = getStepMarker();
			const current = await fillCurrentStep();
			summary.answered += current.answered;
			summary.skipped += current.skipped;
			summary.groups += current.groups;
			summary.steps += 1;

			if (current.groups === 0) {
				summary.reason = 'no-groups';
				break;
			}

			// Retry loop: keep trying to fill until complete or max retries exhausted
			const MAX_FILL_RETRIES = 5;
			for (let retryRound = 0; retryRound < MAX_FILL_RETRIES && !isStepComplete(); retryRound++) {
				console.log(`[LMalaS] Step not complete, retry round ${retryRound + 1}/${MAX_FILL_RETRIES}...`);
				await sleep(POLL_INTERVAL);
				// Re-run fillCurrentStep to catch any unfilled groups
				const retryResult = await fillCurrentStep();
				summary.answered += retryResult.answered;
				summary.skipped += retryResult.skipped;
				
				// Give the page time to process
				await sleep(STEP_SETTLE_DELAY);
			}
			
			// Final check: if still not complete after retries, stop
			if (!isStepComplete()) {
				summary.reason = 'incomplete';
				break;
			}

			const buttons = getButtons();
			if (hasSaveButton(buttons)) {
				summary.reason = 'save';
				break;
			}

			const nextButton = findNextButton(buttons);
			if (!nextButton) {
				summary.reason = 'no-next';
				break;
			}
			const nextDisabled =
				(nextButton as HTMLButtonElement).disabled ||
				nextButton.getAttribute('aria-disabled') === 'true';
			
			if (nextDisabled) {
				// The button might still be disabled while Vue processes the validation updates.
				// Wait a bit to see if it enables.
				let enabled = false;
				for (let i = 0; i < POLL_ATTEMPTS; i++) {
					await sleep(POLL_INTERVAL);
					const btnNow = getButtons().find(b => getButtonLabel(b) === getButtonLabel(nextButton));
					if (btnNow && !((btnNow as HTMLButtonElement).disabled || btnNow.getAttribute('aria-disabled') === 'true')) {
						enabled = true;
						break;
					}
				}
				
				if (!enabled) {
					summary.reason = 'next-disabled';
					break;
				}
			}

			await sleep(STEP_SETTLE_DELAY);
			nextButton.click();
			const changed = await waitForStepChange(marker);
			if (!changed) {
				// If no navigation happened, check if we're already at the final/save step.
				const buttonsAfter = getButtons();
				if (hasSaveButton(buttonsAfter)) {
					summary.reason = 'save';
					break;
				}
				if (!findNextButton(buttonsAfter)) {
					summary.reason = 'end';
					break;
				}
				summary.reason = 'timeout';
				break;
			}
		}

		if (!summary.reason && summary.steps >= MAX_STEPS) {
			summary.reason = 'max-steps';
		}

		return summary;
	}

	async function sendCommand(mode: ScaleMode) {
		console.log('[LMalaS] Exam questionnaire mode selected:', mode);
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (!tab?.id) {
			console.error('[LMalaS] No active tab found.');
			return;
		}

		chrome.scripting.executeScript(
			{
				target: { tabId: tab.id, allFrames: true },
				func: fillExamRadiosInPage,
				args: [mode]
			},
			(results) => {
				if (chrome.runtime.lastError) {
					console.error(
						'[LMalaS] Failed to inject exam questionnaire script:',
						chrome.runtime.lastError.message
					);
					return;
				}
				const summary = results
					.map((result) => result?.result)
					.filter((result): result is Summary => !!result)
					.reduce<Summary>(
						(acc, item) => ({
							answered: acc.answered + item.answered,
							skipped: acc.skipped + item.skipped,
							groups: acc.groups + item.groups,
							steps: Math.max(acc.steps, item.steps),
							reason: acc.reason || item.reason
						}),
						{ answered: 0, skipped: 0, groups: 0, steps: 0, reason: '' }
					);
				console.log('[LMalaS] Exam questionnaire action completed:', summary);
			}
		);
	}
</script>

<section class="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl backdrop-blur">
	<header class="flex items-start justify-between gap-3">
		<div class="space-y-1">
			<h2 class="text-base font-semibold text-slate-100">Midterm/Final Questionnaire</h2>
			<p class="text-sm text-slate-400">
				Fill the exam questionnaire scale in the active Mentari tab with one click.
			</p>
		</div>
		<span class="rounded-full border border-slate-700 px-2.5 py-0.5 text-[11px] uppercase tracking-wide text-slate-400"
			>Exam</span
		>
	</header>

	<div class="mt-4 grid gap-2 sm:grid-cols-3">
		<button
			class="group flex items-center justify-center gap-2 rounded-xl bg-emerald-500/90 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-400"
			on:click={() => sendCommand('selalu')}
		>
			Selalu
		</button>
		<button
			class="group flex items-center justify-center gap-2 rounded-xl bg-sky-500/90 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-400"
			on:click={() => sendCommand('sering')}
		>
			Sering
		</button>
		<button
			class="group flex items-center justify-center gap-2 rounded-xl bg-amber-500/90 px-3 py-2 text-sm font-medium text-slate-900 transition hover:bg-amber-400"
			on:click={() => sendCommand('kadang')}
		>
			Kadang-kadang
		</button>
		<button
			class="group flex items-center justify-center gap-2 rounded-xl bg-rose-500/90 px-3 py-2 text-sm font-medium text-white transition hover:bg-rose-400"
			on:click={() => sendCommand('tidak')}
		>
			Tidak Pernah
		</button>
		<button
			class="group flex items-center justify-center gap-2 rounded-xl bg-slate-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-600"
			on:click={() => sendCommand('random')}
		>
			Random Mix
		</button>
	</div>

	<p class="mt-4 text-xs leading-relaxed text-slate-500">
		Make sure the midterm/final questionnaire is open in the active tab before running.
	</p>
</section>
