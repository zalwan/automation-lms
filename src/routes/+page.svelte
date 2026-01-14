<script>
	import Questionnaire from './questionnaire.svelte';
	import ExamQuestionnaire from './examQuestionnaire.svelte';
	import MultipleChoice from './multipleChoice.svelte';
	import MessageAI from './messageAssistant.svelte';
</script>

<div class="mx-auto flex h-full max-w-xl flex-col gap-6">
	<section class="grid gap-4">
		<Questionnaire />
		<ExamQuestionnaire />
		<MultipleChoice />
		<MessageAI />
	</section>
</div>
