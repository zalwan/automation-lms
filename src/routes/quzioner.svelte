<script lang="ts">
	type Mode = 'yes' | 'no' | 'random';

	function fillRadiosInPage(mode: Mode) {
		const questionBlocks = document.querySelectorAll('div.MuiStack-root');

		if (questionBlocks.length === 0) {
			console.warn('[LMalaS] No questionnaire blocks detected on this page.');
			return;
		}

		const seen = new Set<string>();
		let counter = 1;

		questionBlocks.forEach((block) => {
			const questionTextEl = block.querySelector('p');
			let questionText = questionTextEl ? questionTextEl.innerText.trim() : '';

			if (!questionText) return;

			questionText = questionText.replace(/^\d+\.\s*/, '');

			if (seen.has(questionText)) return;
			seen.add(questionText);

			const radios = Array.from(block.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
			if (radios.length === 0) return;

			const choice = mode === 'yes' ? '1' : mode === 'no' ? '0' : Math.random() > 0.5 ? '1' : '0';
			const answerText = choice === '1' ? 'Yes' : 'No';

			const target = radios.find((r) => r.value === choice);
			if (target) {
				target.click();
				target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
				target.dispatchEvent(new Event('input', { bubbles: true }));
				target.dispatchEvent(new Event('change', { bubbles: true }));

				console.log(`[LMalaS] ${counter}. ${questionText} - ${answerText}`);
				counter++;
			}
		});
	}

	async function sendCommand(mode: Mode) {
		console.log('[LMalaS] Autofill mode selected:', mode);
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (!tab?.id) {
			console.error('[LMalaS] No active tab found.');
			return;
		}

		chrome.scripting.executeScript(
			{
				target: { tabId: tab.id },
				func: fillRadiosInPage,
				args: [mode]
			},
			(results) => {
				if (chrome.runtime.lastError) {
					console.error('[LMalaS] Failed to inject autofill script:', chrome.runtime.lastError.message);
				} else {
					console.log('[LMalaS] Autofill action completed:', results);
				}
			}
		);
	}
</script>

<section class="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl backdrop-blur">
	<header class="flex items-start justify-between gap-3">
		<div class="space-y-1">
			<h2 class="text-base font-semibold text-slate-100">Questionnaire Autofill</h2>
			<p class="text-sm text-slate-400">
				Apply consistent answers to the Mentari LMS survey with a single click.
			</p>
		</div>
		<span class="rounded-full border border-slate-700 px-2.5 py-0.5 text-[11px] uppercase tracking-wide text-slate-400">Beta</span>
	</header>

	<div class="mt-4 grid gap-2 sm:grid-cols-3">
		<button
			class="group flex items-center justify-center gap-2 rounded-xl bg-sky-500/90 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-400"
			on:click={() => sendCommand('yes')}
		>
			<span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">Y</span>
			All Yes
		</button>
		<button
			class="group flex items-center justify-center gap-2 rounded-xl bg-rose-500/90 px-3 py-2 text-sm font-medium text-white transition hover:bg-rose-400"
			on:click={() => sendCommand('no')}
		>
			<span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">N</span>
			All No
		</button>
		<button
			class="group flex items-center justify-center gap-2 rounded-xl bg-amber-500/90 px-3 py-2 text-sm font-medium text-slate-900 transition hover:bg-amber-400"
			on:click={() => sendCommand('random')}
		>
			<span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/10 text-xs font-semibold">?</span>
			Random Mix
		</button>
	</div>

	<p class="mt-4 text-xs leading-relaxed text-slate-500">
		Keep the Mentari questionnaire open in the active tab, then choose a mode above. Answers are logged to the browser console for review.
	</p>
</section>
