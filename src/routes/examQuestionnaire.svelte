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

		const markChecked = (option: HTMLElement, checked: boolean) => {
			option.setAttribute('aria-checked', checked ? 'true' : 'false');
			const inner = option.querySelector<HTMLElement>('.q-radio__inner');
			if (inner) {
				inner.classList.toggle('q-radio__inner--truthy', checked);
				inner.classList.toggle('q-radio__inner--falsy', !checked);
			}
		};

		const isChecked = (option: HTMLElement) => {
			const input = option.querySelector<HTMLInputElement>('input[type="radio"]');
			if (input?.checked) return true;
			if (option.getAttribute('aria-checked') === 'true') return true;
			return option
				.querySelector<HTMLElement>('.q-radio__inner')
				?.classList.contains('q-radio__inner--truthy') ?? false;
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

		const forceSelectOption = (option: HTMLElement, allOptions: HTMLElement[]) => {
			const input = option.querySelector<HTMLInputElement>('input[type="radio"]');
			const label = option.querySelector<HTMLElement>('.q-radio__label');
			const inner = option.querySelector<HTMLElement>('.q-radio__inner');

			if (option.tabIndex >= 0) {
				option.focus();
			}
			triggerClick(inner);
			triggerClick(label);
			triggerClick(option);
			if (input) {
				input.click();
				input.checked = true;
				input.dispatchEvent(new Event('input', { bubbles: true }));
				input.dispatchEvent(new Event('change', { bubbles: true }));
			}

			allOptions.forEach((other) => {
				if (other === option) return;
				const otherInput = other.querySelector<HTMLInputElement>('input[type="radio"]');
				if (otherInput) {
					otherInput.checked = false;
				}
				markChecked(other, false);
			});
			markChecked(option, true);
			return isChecked(option);
		};

		const isVisible = (el: HTMLElement) =>
			!!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

		const getButtons = () =>
			Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter((btn) =>
				isVisible(btn)
			);

		const getButtonLabel = (btn: HTMLElement) =>
			normalizeText(btn.textContent ?? btn.getAttribute('aria-label') ?? '');

		const hasSaveButton = (buttons: HTMLButtonElement[]) =>
			buttons.some((btn) => SAVE_LABELS.some((label) => getButtonLabel(btn).includes(label)));

		const findNextButton = (buttons: HTMLButtonElement[]) =>
			buttons.find((btn) => NEXT_LABELS.some((label) => getButtonLabel(btn).includes(label)));

		const getStepMarker = () => {
			const activeTitle =
				document.querySelector('.q-stepper__tab--active .q-stepper__title')?.textContent?.trim() ??
				'';
			const firstQuestion =
				document.querySelector('.q-field__label')?.textContent?.trim() ?? '';
			return normalizeText(`${activeTitle}|${firstQuestion}`);
		};

		const waitForStepChange = async (marker: string) => {
			for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
				await sleep(POLL_INTERVAL);
				if (getStepMarker() !== marker) return true;
			}
			return false;
		};

		const fillCurrentStep = () => {
			const root =
				document.querySelector<HTMLElement>('.q-stepper__step') ?? document.documentElement;
			const groups = Array.from(
				root.querySelectorAll<HTMLElement>('[role="radiogroup"], .q-option-group')
			);
			if (groups.length === 0) {
				console.warn('[LMalaS] No exam questionnaire groups detected on this step.');
				return { answered: 0, skipped: 0, groups: 0 };
			}

			const matcherMap: Record<Exclude<ScaleMode, 'random'>, RegExp> = {
				selalu: /selalu/i,
				sering: /sering/i,
				kadang: /kadang/i,
				tidak: /tidak/i
			};

			const seen = new Set<string>();
			let counter = 1;
			let answered = 0;
			let skipped = 0;

			groups.forEach((group, index) => {
				const block = group.closest<HTMLElement>('.q-field') ?? group;
				let questionText =
					block.querySelector<HTMLElement>('.q-field__label')?.textContent?.trim() ??
					`Group ${index + 1}`;
				questionText = questionText.replace(/^\d+\.\s*/, '');
				if (seen.has(questionText)) return;
				seen.add(questionText);

				const options = Array.from(
					group.querySelectorAll<HTMLElement>('[role="radio"], .q-radio')
				);
				if (options.length === 0) {
					skipped += 1;
					return;
				}

				let target: HTMLElement | undefined;
				if (mode === 'random') {
					target = options[Math.floor(Math.random() * options.length)];
				} else {
					const matcher = matcherMap[mode];
					target = options.find((option) => matcher.test(normalizeText(getOptionLabel(option))));
				}

				if (!target) {
					skipped += 1;
					return;
				}

				const applied = forceSelectOption(target, options);
				if (!applied) {
					forceSelectOption(target, options);
				}

				const pickedLabel = getOptionLabel(target) || MODE_LABEL[mode];
				console.log(`[LMalaS] Exam questionnaire ${counter}. ${questionText} - ${pickedLabel}`);
				counter += 1;
				if (isChecked(target)) {
					answered += 1;
				} else {
					skipped += 1;
					console.warn('[LMalaS] Selection not confirmed for:', questionText);
				}
			});

			return { answered, skipped, groups: groups.length };
		};

		const summary: Summary = { answered: 0, skipped: 0, groups: 0, steps: 0, reason: '' };

		for (let step = 0; step < MAX_STEPS; step += 1) {
			const marker = getStepMarker();
			const current = fillCurrentStep();
			summary.answered += current.answered;
			summary.skipped += current.skipped;
			summary.groups += current.groups;
			summary.steps += 1;

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
			if (nextButton.disabled || nextButton.getAttribute('aria-disabled') === 'true') {
				summary.reason = 'next-disabled';
				break;
			}

			nextButton.click();
			const changed = await waitForStepChange(marker);
			if (!changed) {
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
