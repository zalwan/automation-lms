<script>
	import Quzioner from './quzioner.svelte';
	import Pretest from './pretest.svelte';
	import OpenRouter from './openrouter.svelte';
</script>

<div class="mx-auto flex h-full max-w-xl flex-col gap-6">
	<section class="grid gap-4">
		<Quzioner />
		<Pretest />
		<OpenRouter />
	</section>
</div>
