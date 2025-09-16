<script lang="ts">
	type Mode = 'yes' | 'no' | 'random';

	// fungsi yang dieksekusi di halaman LMS
	function fillRadiosInPage(mode: Mode) {
		// Ambil semua blok pertanyaan
		const questionBlocks = document.querySelectorAll('div.MuiStack-root');

		if (questionBlocks.length === 0) {
			console.warn('[LMalaS] Tidak ada pertanyaan ditemukan.');
			return;
		}

		const seen = new Set<string>(); // untuk filter pertanyaan duplikat
		let counter = 1;

		questionBlocks.forEach((block) => {
			// Ambil teks pertanyaan dari <p>
			const questionTextEl = block.querySelector('p');
			let questionText = questionTextEl ? questionTextEl.innerText.trim() : '';

			if (!questionText) return;

			// Hapus nomor di depan (kalau ada)
			questionText = questionText.replace(/^\d+\.\s*/, '');

			// Skip kalau pertanyaan sudah pernah muncul
			if (seen.has(questionText)) return;
			seen.add(questionText);

			// Cari semua radio di dalam block
			const radios = Array.from(block.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
			if (radios.length === 0) return;

			// Tentukan pilihan
			const choice = mode === 'yes' ? '1' : mode === 'no' ? '0' : Math.random() > 0.5 ? '1' : '0';
			const answerText = choice === '1' ? 'Ya' : 'Tidak';

			// Pilih radio yang sesuai
			const target = radios.find((r) => r.value === choice);
			if (target) {
				target.click();
				target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
				target.dispatchEvent(new Event('input', { bubbles: true }));
				target.dispatchEvent(new Event('change', { bubbles: true }));

				// Tampilkan log dengan nomor + pertanyaan + jawaban
				console.log(`[LMalaS] ${counter}. ${questionText} → ${answerText}`);
				counter++;
			}
		});
	}

	async function sendCommand(mode: Mode) {
		console.log('[LMalaS] Tombol dipilih:', mode);
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (!tab?.id) {
			console.error('[LMalaS] Tidak ada tab aktif.');
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
					console.error('[LMalaS] Error inject:', chrome.runtime.lastError.message);
				} else {
					console.log('[LMalaS] Injection selesai:', results);
				}
			}
		);
	}
</script>

<div class="p-4">
	<h1 class="text-lg font-bold">Auto Fill LMS Quzioner</h1>
	<div class="flex gap-2 mt-4">
		<button class="btn preset-filled-tertiary-500" on:click={() => sendCommand('yes')}
			>All Yes</button
		>
		<button class="btn preset-filled-error-500" on:click={() => sendCommand('no')}>All No</button>
		<button class="btn preset-filled-warning-500" on:click={() => sendCommand('random')}
			>Random</button
		>
	</div>
</div>
