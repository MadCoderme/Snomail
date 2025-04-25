<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'vue-sonner'

interface Campaign {
    id: string;
    name: string;
    status: string;
    sequence_name: string;
    created_at: string;
    total_contacts?: number;
    completed_contacts?: number;
    failed_contacts?: number;
}

const campaigns = ref<Campaign[]>([]);
const isLoading = ref(false);
const backendApiUrl = 'http://localhost:8080';

async function fetchCampaigns() {
    isLoading.value = true;
    try {
        const response = await fetch(`${backendApiUrl}/api/campaigns`);
        if (!response.ok) throw new Error('Failed to fetch campaigns');
        const result = await response.json();
        if (result.success) {
            campaigns.value = result.data;
        } else {
            throw new Error(result.message || 'Failed to fetch campaigns');
        }
    } catch (error: any) {
        toast.error(`Error fetching campaigns: ${error.message}`);
    } finally {
        isLoading.value = false;
    }
}


async function startCampaign(campaignId: string) {
    isLoading.value = true; // Use a specific loading state per campaign later
    try {
        const response = await fetch(`${backendApiUrl}/api/campaigns/${campaignId}/start`, { method: 'POST' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Failed to start campaign');
        toast.success(result.message);
        await fetchCampaigns(); // Refresh list
        // If viewing details, refresh them too
        navigateTo('/campaigns/' + campaignId);
    } catch (error: any) {
        toast.error(`Error starting campaign: ${error.message}`);
    } finally {
        isLoading.value = false;
    }
}

async function pauseCampaign(campaignId: string) {
    isLoading.value = true; // Use a specific loading state per campaign later
    try {
        const response = await fetch(`${backendApiUrl}/api/campaigns/${campaignId}/pause`, { method: 'POST' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Failed to pause campaign');
        toast.success(result.message);
        await fetchCampaigns(); // Refresh list
        // If viewing details, refresh them too
        navigateTo('/campaigns/' + campaignId);
    } catch (error: any) {
        toast.error(`Error pausing campaign: ${error.message}`);
    } finally {
        isLoading.value = false;
    }
}

function formatStatus(status: string): string {
    if (!status) return 'N/A';
    return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
}

onMounted(() => {
    fetchCampaigns();
});
</script>

<template>
    <div class="container mx-auto p-4 space-y-6">
        <div class="flex justify-between items-center mb-6">
            <h1 class="text-2xl font-bold">Campaigns</h1>
            <div>
            <NuxtLink to="/campaigns/create" class="mr-2">
                <Button>Create Campaign</Button>
            </NuxtLink>
            <NuxtLink to="/sequences">
                <Button>View Sequences</Button>
            </NuxtLink></div>
        </div>

        <Card>
                <CardHeader>
                    <CardTitle>Campaigns</CardTitle>
                    <CardDescription>Manage your email outreach campaigns.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div v-if="isLoading" class="text-center p-4">Loading campaigns...</div>
                    <div v-else-if="campaigns.length === 0" class="text-center p-4 text-muted-foreground">No campaigns
                        created yet.</div>
                    <div v-else class="space-y-4">
                        <Card v-for="campaign in campaigns" :key="campaign.id">
                            <CardHeader class="flex flex-row justify-between items-start">
                                <div>
                                    <CardTitle class="text-lg">{{ campaign.name }}</CardTitle>
                                    <CardDescription>Sequence: {{ campaign.sequence_name }} | Status: <span
                                            :class="{ 'text-green-600': campaign.status === 'active', 'text-yellow-600': campaign.status === 'paused', 'text-blue-600': campaign.status === 'completed' }">{{
                                                formatStatus(campaign.status) }}</span></CardDescription>
                                    <p class="text-xs text-muted-foreground mt-1">Created: {{ new
                                        Date(campaign.created_at).toLocaleDateString() }}</p>
                                    <p class="text-xs text-muted-foreground">Contacts: {{ campaign.total_contacts ??
                                        'N/A' }} (Completed: {{ campaign.completed_contacts ?? 0 }}, Failed: {{
                                            campaign.failed_contacts ?? 0 }})</p>
                                </div>
                                <div class="flex gap-2 items-center flex-shrink-0">
                                    <Button size="sm" variant="outline"
                                        @click="navigateTo('/campaigns/' + campaign.id);">Details</Button>
                                    <Button size="sm" v-if="campaign.status === 'draft' || campaign.status === 'paused'"
                                        @click="startCampaign(campaign.id)" :disabled="isLoading">Start</Button>
                                    <Button size="sm" variant="secondary" v-if="campaign.status === 'active'"
                                        @click="pauseCampaign(campaign.id)" :disabled="isLoading">Pause</Button>
                                    <!-- Add Delete button later -->
                                </div>
                            </CardHeader>
                        </Card>
                    </div>
                </CardContent>
            </Card>
    </div>
</template>