<script lang="ts">
	import '../app.css';
	import OpenRouterSettings from '../lib/components/OpenRouterSettings.svelte';

	let { children } = $props();
</script>

<div id="app" class="min-h-full bg-slate-950 text-slate-100">
	<header
		class="flex flex-col gap-2 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-4 shadow-lg"
	>
		<div class="flex items-center justify-between">
			<h1 class="text-xl font-semibold tracking-tight">
				LM<span class="text-sky-400">(ala)</span>S
			</h1>
			<OpenRouterSettings />
		</div>
		<p class="text-sm text-slate-300">
			Automation helpers for Mentari LMS tasks. created by lazyGuys
		</p>
	</header>

	<main class="mt-4 flex-1 overflow-y-auto">
		{@render children?.()}
	</main>
</div>
