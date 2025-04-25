<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'vue-sonner'

const route = useRoute()
const router = useRouter()
const backendApiUrl = 'http://localhost:8080'

// State
const isLoadingDetails = ref(false)
const isRetrying = ref(false)
const isAddingContacts = ref(false)
const showAddContactsModal = ref(false)
const selectedCampaignDetails = ref<any>(null)
const campaignContacts = ref<any[]>([])
const newContactsJsonText = ref('')
const newContactsJsonError = ref('')
const parsedNewContacts = ref<any[]>([])

// Watch for JSON validation
watch(newContactsJsonText, (newValue) => {
    if (!newValue.trim()) {
        newContactsJsonError.value = ''
        parsedNewContacts.value = []
        return
    }

    try {
        const parsed = JSON.parse(newValue)
        if (!Array.isArray(parsed)) throw new Error("Input must be a JSON array.")
        const validContacts = parsed.filter(item =>
            typeof item === 'object' &&
            item !== null &&
            typeof item.email === 'string' &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email)
        )

        if (validContacts.length === 0 && parsed.length > 0) {
            throw new Error("No valid contact objects found.")
        }
        parsedNewContacts.value = validContacts
        newContactsJsonError.value = ''
    } catch (e: any) {
        newContactsJsonError.value = `Invalid JSON: ${e.message}`
        parsedNewContacts.value = []
    }
})

// Methods
async function fetchCampaignDetails() {
    isLoadingDetails.value = true
    selectedCampaignDetails.value = null
    campaignContacts.value = []
    
    try {
        // Fetch campaign general info
        const campaignRes = await fetch(`${backendApiUrl}/api/campaigns/${route.params.id}`)
        if (!campaignRes.ok) throw new Error('Failed to fetch campaign details')
        const campaignResult = await campaignRes.json()
        if (!campaignResult.success) throw new Error(campaignResult.message)
        selectedCampaignDetails.value = campaignResult.data

        // Fetch campaign contacts list
        const contactsRes = await fetch(`${backendApiUrl}/api/campaigns/${route.params.id}/contacts`)
        if (!contactsRes.ok) throw new Error('Failed to fetch campaign contacts')
        const contactsResult = await contactsRes.json()
        if (!contactsResult.success) throw new Error(contactsResult.message)
        campaignContacts.value = contactsResult.data
    } catch (error: any) {
        toast.error(`Error loading campaign details: ${error.message}`)
        router.push('/campaigns')
    } finally {
        isLoadingDetails.value = false
    }
}

async function startCampaign() {
    try {
        const response = await fetch(`${backendApiUrl}/api/campaigns/${route.params.id}/start`, { method: 'POST' })
        const result = await response.json()
        if (!response.ok) throw new Error(result.message)
        toast.success(result.message)
        await fetchCampaignDetails()
    } catch (error: any) {
        toast.error(`Error starting campaign: ${error.message}`)
    }
}

async function pauseCampaign() {
    try {
        const response = await fetch(`${backendApiUrl}/api/campaigns/${route.params.id}/pause`, { method: 'POST' })
        const result = await response.json()
        if (!response.ok) throw new Error(result.message)
        toast.success(result.message)
        await fetchCampaignDetails()
    } catch (error: any) {
        toast.error(`Error pausing campaign: ${error.message}`)
    }
}

async function retryFailedContacts() {
    isRetrying.value = true
    try {
        const response = await fetch(`${backendApiUrl}/api/campaigns/${route.params.id}/retry-failed`, {
            method: 'POST'
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.message)
        toast.success(result.message)
        await fetchCampaignDetails()
    } catch (error: any) {
        toast.error(`Error retrying failed contacts: ${error.message}`)
    } finally {
        isRetrying.value = false
    }
}

async function addContactsToCampaign() {
    if (!parsedNewContacts.value.length) {
        toast.error("Please add valid contacts first.")
        return
    }

    isAddingContacts.value = true
    try {
        const response = await fetch(`${backendApiUrl}/api/campaigns/${route.params.id}/contacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contacts: parsedNewContacts.value })
        })

        const result = await response.json()
        if (!response.ok) throw new Error(result.message)

        toast.success(result.message)
        if (result.errors?.length) {
            toast.warning(`Some contacts had issues: ${result.errors.join(', ')}`)
        }

        newContactsJsonText.value = ''
        showAddContactsModal.value = false
        await fetchCampaignDetails()
    } catch (error: any) {
        toast.error(`Error adding contacts: ${error.message}`)
    } finally {
        isAddingContacts.value = false
    }
}

function formatStatus(status: string): string {
    if (!status) return 'N/A'
    return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')
}

onMounted(() => {
    fetchCampaignDetails()
})
</script>

<template>
    <div class="container mx-auto p-4 space-y-6">
        <Card>
            <CardHeader>
                <NuxtLink to="/">
                    <Button variant="outline" size="sm" class="mb-4">← Back to Campaigns</Button>
                </NuxtLink>
                <div v-if="isLoadingDetails">Loading details...</div>
                <div v-if="selectedCampaignDetails">
                    <CardTitle>{{ selectedCampaignDetails.name }}</CardTitle>
                    <CardDescription>
                        Sequence: {{ selectedCampaignDetails.sequence_name }} | Status: {{
                            formatStatus(selectedCampaignDetails.status) }}
                    </CardDescription>
                    <div class="mt-2 flex gap-2">
                        <Button size="sm" v-if="selectedCampaignDetails.status === 'draft' || selectedCampaignDetails.status === 'paused'"
                            @click="startCampaign">Start</Button>
                        <Button size="sm" variant="secondary" v-if="selectedCampaignDetails.status === 'active'"
                            @click="pauseCampaign">Pause</Button>
                        <Button size="sm" variant="secondary" v-if="selectedCampaignDetails.status === 'active'"
                            @click="retryFailedContacts" :disabled="isRetrying">
                            {{ isRetrying ? 'Retrying...' : 'Retry Failed' }}
                        </Button>
                        <Button size="sm" variant="secondary" v-if="selectedCampaignDetails.status === 'active'"
                            @click="showAddContactsModal = true">
                            Add Contacts
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent v-if="selectedCampaignDetails && !isLoadingDetails">
                <h3 class="font-semibold mb-3">Contact Progress</h3>
                <div v-if="campaignContacts.length === 0" class="text-muted-foreground">
                    No contacts found for this campaign.
                </div>
                <div v-else class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="border-b">
                                <th class="text-left p-2">Email</th>
                                <th class="text-left p-2">Status</th>
                                <th class="text-left p-2">Current Step</th>
                                <th class="text-left p-2">Next Send</th>
                                <th class="text-left p-2">Last Updated</th>
                                <th class="text-left p-2">Error</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="contact in campaignContacts" :key="contact.id"
                                class="border-b hover:bg-muted/50">
                                <td class="p-2">{{ contact.contact_email }}</td>
                                <td class="p-2">{{ formatStatus(contact.status) }}</td>
                                <td class="p-2">{{ contact.current_step_number }}</td>
                                <td class="p-2">{{ contact.next_send_time ? new
                                    Date(contact.next_send_time).toLocaleString() : 'N/A' }}</td>
                                <td class="p-2">{{ new Date(contact.updated_at).toLocaleString() }}</td>
                                <td class="p-2 text-red-600 text-xs">{{ contact.last_error }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>

        <Dialog :open="showAddContactsModal" @update:open="showAddContactsModal = false">
            <DialogContent class="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Add Contacts to Campaign</DialogTitle>
                    <DialogDescription>
                        Add new contacts to "{{ selectedCampaignDetails?.name }}". Emails will be scheduled
                        automatically.
                    </DialogDescription>
                </DialogHeader>
                <div class="space-y-4 py-4">
                    <div class="space-y-2">
                        <Label for="newContactsJson">Contact Data (JSON Array)</Label>
                        <Textarea id="newContactsJson" v-model="newContactsJsonText"
                            placeholder='[{"email":"test@example.com", "firstName":"John"}, ...]' rows="6"
                            :class="{ 'border-red-500': newContactsJsonError }" />
                        <p v-if="newContactsJsonError" class="text-xs text-red-600">
                            {{ newContactsJsonError }}
                        </p>
                        <p v-else class="text-xs text-muted-foreground">
                            Found {{ parsedNewContacts.length }} valid contacts to add.
                        </p>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="showAddContactsModal = false">Cancel</Button>
                    <Button @click="addContactsToCampaign" :disabled="isAddingContacts || !parsedNewContacts.length">
                        {{ isAddingContacts ? 'Adding...' : 'Add Contacts' }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>