<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea' // Assuming you have this
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import Editor from '@/components/Editor' // Reuse your editor
import { Trash2, PlusCircle } from 'lucide-vue-next';
import { toast } from 'vue-sonner'

interface SequenceStep {
  id?: string; // For potential updates later
  step_number: number;
  subject_template: string;
  body_template: string;
  delay_days: number;
}

const sequenceName = ref('');
const steps = reactive<SequenceStep[]>([
  // Start with one empty step
  { step_number: 1, subject_template: '', body_template: '', delay_days: 1 }
]);
const isLoading = ref(false);

// Backend API URL (consider moving to config)
const backendApiUrl = 'http://localhost:8080';

function addStep() {
  const nextStepNumber = steps.length > 0 ? Math.max(...steps.map(s => s.step_number)) + 1 : 1;
  steps.push({
    step_number: nextStepNumber,
    subject_template: '',
    body_template: '',
    delay_days: 3 // Default delay for subsequent steps
  });
  // Ensure step numbers are sequential after adding/deleting
  renumberSteps();
}

function removeStep(index: number) {
  if (steps.length <= 1) {
    toast.error("A sequence must have at least one step.");
    return;
  }
  steps.splice(index, 1);
  renumberSteps();
}

function renumberSteps() {
  steps.forEach((step, index) => {
    step.step_number = index + 1;
  });
}

async function saveSequence() {
  if (!sequenceName.value.trim()) {
      toast.error("Please enter a sequence name.");
      return;
  }
   if (steps.some(s => !s.subject_template.trim() || !s.body_template.trim())) {
        toast.error("Please fill in the subject and body for all steps.");
        return;
    }

  isLoading.value = true;
  try {
    const payload = {
      name: sequenceName.value,
      steps: steps.map(s => ({ // Ensure only needed fields are sent
        step_number: s.step_number,
        subject_template: s.subject_template,
        body_template: s.body_template,
        delay_days: s.delay_days
      }))
    };

    const response = await fetch(`${backendApiUrl}/api/sequences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || `HTTP error! status: ${response.status}`);
    }

    toast.success(result.message || 'Sequence saved successfully!');
    // Optionally reset form or navigate away
    // sequenceName.value = '';
    // steps.splice(0, steps.length, { step_number: 1, subject_template: '', body_template: '', delay_days: 1 });

  } catch (error: any) {
    console.error("Failed to save sequence:", error);
    toast.error(`Failed to save sequence: ${error.message}`);
  } finally {
    isLoading.value = false;
  }
}

</script>

<template>
  <Card class="w-full max-w-4xl mx-auto">
    <CardHeader>
      <CardTitle>Create New Sequence</CardTitle>
      <CardDescription>Define the steps and delays for your email sequence.</CardDescription>
    </CardHeader>
    <CardContent class="space-y-6">
      <div>
        <Label for="sequenceName">Sequence Name</Label>
        <Input id="sequenceName" v-model="sequenceName" placeholder="e.g., Q3 Prospecting Outreach" required />
      </div>

      <div v-for="(step, index) in steps" :key="index" class="border p-4 rounded-md relative space-y-4 bg-muted/20">
        <h3 class="font-semibold text-lg">Step {{ step.step_number }}</h3>

        <Button
          v-if="steps.length > 1"
          variant="ghost"
          size="icon"
          class="absolute top-2 right-2 text-destructive hover:bg-destructive/10"
          @click="removeStep(index)"
          title="Remove Step"
        >
          <Trash2 class="h-4 w-4" />
        </Button>

        <div>
          <Label :for="'delayDays-' + index">Delay Before Sending (Days)</Label>
           <Input
                :id="'delayDays-' + index"
                v-model.number="step.delay_days"
                type="number"
                min="0"
                required
                class="w-24"
              />
           <p class="text-xs text-muted-foreground mt-1">
                Wait {{ step.delay_days }} days after the previous step (or campaign start for Step 1).
           </p>
        </div>

        <div>
          <Label :for="'subject-' + index">Subject Template</Label>
          <Input :id="'subject-' + index" v-model="step.subject_template" :placeholder="'Subject for Step ' + step.step_number" required />
           <p class="text-xs text-muted-foreground mt-1">Use placeholders like {firstName}, {company}.</p>
        </div>

        <div>
           <Label :for="'body-' + index">Body Template</Label>
           <!-- Use v-model directly if Editor supports it, otherwise use @update -->
           <Editor
             :id="'body-' + index"
             :modelValue="step.body_template"
             initialContent=""
             @update="(val: string) => step.body_template = val"
             :placeholder="'Write email body for Step ' + step.step_number"
             required
             class="min-h-[200px]"
           />
        </div>
      </div>

       <div class="flex justify-center">
           <Button variant="outline" @click="addStep">
               <PlusCircle class="h-4 w-4 mr-2" /> Add Step
           </Button>
       </div>

    </CardContent>
    <CardFooter>
      <Button @click="saveSequence" :disabled="isLoading">
         <svg v-if="isLoading" class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">...</svg>
        {{ isLoading ? 'Saving...' : 'Save Sequence' }}
      </Button>
    </CardFooter>
  </Card>
</template>