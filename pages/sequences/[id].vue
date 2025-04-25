<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'vue-sonner'

const route = useRoute()
const router = useRouter()
const backendApiUrl = 'http://localhost:8080'

// State
const isLoading = ref(false)
const isEditing = ref(false)
const sequenceDetails = ref<{
    id: string;
    name: string;
    steps: Array<{
        step_number: number;
        delay_days: number;
        subject_template: string;
        body_template: string;
    }>;
} | null>(null)

// Methods
async function fetchSequenceDetails() {
    isLoading.value = true
    try {
        const response = await fetch(`${backendApiUrl}/api/sequences/${route.params.id}`)
        if (!response.ok) throw new Error('Failed to fetch sequence details')
        const result = await response.json()
        if (!result.success) throw new Error(result.message)
        sequenceDetails.value = result.data
    } catch (error: any) {
        toast.error(`Error loading sequence: ${error.message}`)
        router.push('/sequences')
    } finally {
        isLoading.value = false
    }
}

async function saveSequence() {
    if (!sequenceDetails.value) return

    isLoading.value = true
    try {
        const response = await fetch(`${backendApiUrl}/api/sequences/${route.params.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: sequenceDetails.value.name,
                steps: sequenceDetails.value.steps
            })
        })

        if (!response.ok) throw new Error('Failed to update sequence')
        const result = await response.json()
        
        toast.success('Sequence updated successfully')
        isEditing.value = false
    } catch (error: any) {
        toast.error(`Failed to update sequence: ${error.message}`)
        await fetchSequenceDetails() // Reload original data
    } finally {
        isLoading.value = false
    }
}

function addStep() {
    if (!sequenceDetails.value) return
    
    const lastStep = sequenceDetails.value.steps[sequenceDetails.value.steps.length - 1]
    sequenceDetails.value.steps.push({
        step_number: sequenceDetails.value.steps.length + 1,
        delay_days: lastStep ? lastStep.delay_days + 2 : 0,
        subject_template: '',
        body_template: ''
    })
}

function removeStep(index: number) {
    if (!sequenceDetails.value || sequenceDetails.value.steps.length <= 1) return
    
    sequenceDetails.value.steps.splice(index, 1)
    // Reorder step numbers
    sequenceDetails.value.steps.forEach((step, idx) => {
        step.step_number = idx + 1
    })
}

// Fetch data on mount
onMounted(() => {
    fetchSequenceDetails()
})
</script>

<template>
    <div class="container mx-auto p-4">
        <Card>
            <CardHeader>
                <NuxtLink to="/sequences">
                    <Button variant="outline" size="sm" class="mb-4">← Back to Sequences</Button>
                </NuxtLink>
                <div v-if="isLoading && !sequenceDetails">Loading sequence details...</div>
                <div v-if="sequenceDetails" class="flex justify-between items-center">
                    <div class="space-y-2 flex-1">
                        <div class="flex items-center gap-4">
                            <Input v-if="isEditing" 
                                v-model="sequenceDetails.name" 
                                class="max-w-md"
                                placeholder="Sequence name" 
                            />
                            <h2 v-else class="text-2xl font-bold">{{ sequenceDetails.name }}</h2>
                            <Button size="sm" @click="isEditing ? saveSequence() : isEditing = true"
                                :disabled="isLoading">
                                {{ isEditing ? 'Save Changes' : 'Edit Sequence' }}
                            </Button>
                        </div>
                        <CardDescription>
                            {{ sequenceDetails.steps.length }} steps
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>

            <CardContent v-if="sequenceDetails" class="space-y-6">
                <div v-for="(step, index) in sequenceDetails.steps" 
                    :key="index" 
                    class="border rounded-lg p-4 space-y-4"
                >
                    <div class="flex justify-between items-center">
                        <h3 class="font-semibold">Step {{ step.step_number }}</h3>
                        <div class="flex items-center gap-4">
                            <div class="flex items-center gap-2">
                                <Label>Delay (days)</Label>
                                <Input 
                                    v-model.number="step.delay_days"
                                    type="number"
                                    class="w-20"
                                    min="0"
                                    :disabled="!isEditing"
                                />
                            </div>
                            <Button 
                                v-if="isEditing && sequenceDetails.steps.length > 1"
                                variant="destructive"
                                size="sm"
                                @click="removeStep(index)"
                            >
                                Remove
                            </Button>
                        </div>
                    </div>

                    <div class="space-y-2">
                        <Label>Subject Template</Label>
                        <Input 
                            v-model="step.subject_template"
                            placeholder="Email subject with {placeholders}"
                            :disabled="!isEditing"
                        />
                        <p class="text-xs text-muted-foreground">
                            Available placeholders: {firstName}, {lastName}, {email}, {company}
                        </p>
                    </div>

                    <div class="space-y-2">
                        <Label>Email Body Template</Label>
                        <Textarea 
                            v-model="step.body_template"
                            placeholder="Email body with {placeholders}"
                            rows="6"
                            :disabled="!isEditing"
                        />
                        <p class="text-xs text-muted-foreground">
                            Use markdown formatting and {placeholders} for personalization
                        </p>
                    </div>
                </div>

                <Button 
                    v-if="isEditing"
                    variant="outline" 
                    class="w-full" 
                    @click="addStep"
                >
                    Add Step
                </Button>
            </CardContent>
        </Card>
    </div>
</template>