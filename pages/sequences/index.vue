<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'vue-sonner'

interface SequenceMeta {
    id: string;
    name: string;
    step_count: number;
    created_at: string;
}

const sequences = ref<SequenceMeta[]>([]);
const isLoading = ref(false);
const backendApiUrl = 'http://localhost:8080';

async function fetchSequences() {
    try {
        const response = await fetch(`${backendApiUrl}/api/sequences`);
        if (!response.ok) throw new Error('Failed to fetch sequences');
        const result = await response.json();
        if (result.success) {
            sequences.value = result.data.map((seq: any) => ({
                ...seq,
                created_at: new Date(seq.created_at).toISOString()
            }));
        } else {
            throw new Error(result.message || 'Failed to fetch sequences');
        }
    } catch (error: any) {
        toast.error(`Error fetching sequences: ${error.message}`);
        sequences.value = [];
    }
}

onMounted(() => {
    fetchSequences();
});
</script>

<template>
    <div class="container mx-auto p-4 space-y-6">
        <div class="flex justify-between items-center mb-6">
            <h1 class="text-2xl font-bold">Email Sequences</h1>
            <NuxtLink to="/sequences/create">
                <Button>Create Sequence</Button>
            </NuxtLink>
        </div>
        <Card>
            <CardHeader>
                <CardTitle>Email Sequences</CardTitle>
                <CardDescription>Manage your email sequence templates.</CardDescription>
            </CardHeader>
            <CardContent>
                <div v-if="isLoading" class="text-center p-4">Loading sequences...</div>
                <div v-else-if="sequences.length === 0" class="text-center p-4 text-muted-foreground">
                    No sequences created yet.
                </div>
                <div v-else class="space-y-4">
                    <Card v-for="sequence in sequences" :key="sequence.id">
                        <CardHeader class="flex flex-row justify-between items-start">
                            <div>
                                <CardTitle class="text-lg">{{ sequence.name }}</CardTitle>
                                <CardDescription>
                                    {{ sequence.step_count }} steps
                                    <span class="text-xs text-muted-foreground ml-2">
                                        Created: {{ new Date(sequence.created_at).toLocaleDateString() }}
                                    </span>
                                </CardDescription>
                            </div>
                            <div class="flex gap-2">
                                <Button size="sm" variant="outline" @click="navigateTo('/sequences/' + sequence.id)">
                                    View/Edit
                                </Button>
                            </div>
                        </CardHeader>
                    </Card>
                </div>
            </CardContent>
        </Card>
    </div>
</template>