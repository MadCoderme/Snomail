<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select' // Assuming you add this Shadcn component
import { toast } from 'vue-sonner'
import { Dialog, DialogScrollContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import SequenceBuilder from '@/components/SequenceBuilder.vue'; // Import the new component

// --- Component State ---
type View = 'campaignList' | 'createCampaign' | 'createSequence' | 'campaignDetails' | 'sequenceList' | 'sequenceDetails'
const currentView = ref<View>('campaignList');

// --- Campaign Data ---
interface Campaign {
    id: string;
    name: string;
    status: string;
    sequence_name: string;
    created_at: string;
    total_contacts?: number;
    completed_contacts?: number;
    failed_contacts?: number;
    // Add more fields as needed
}
const campaigns = ref<Campaign[]>([]);
const selectedCampaignDetails = ref<any>(null); // For detail view
const campaignContacts = ref<any[]>([]); // For detail view
const isRetrying = ref(false);

// --- Sequence Data ---
interface SequenceMeta {
    id: string;
    name: string;
    step_count: number;
}
const availableSequences = ref<SequenceMeta[]>([]);
const selectedSequenceDetails = ref<any>(null);
const isEditingSequence = ref(false);

// --- Create Campaign Form State ---
const newCampaignName = ref('');
const selectedSequenceId = ref<string | null>(null);
const newCampaignFromEmail = ref('your-default@example.com'); // Set a default or fetch from user settings
const recipientsJsonText = ref(''); // Keep JSON input for now
const jsonParseError = ref<string | null>(null);

// SMTP Config state (keep similar fields)
const smtpConfig = reactive({
    smtpHost: ref('smtp.ethereal.email'),
    smtpPort: ref(587),
    smtpUser: ref('nathanial.pfannerstill60@ethereal.email'),
    smtpPass: ref('YutHqSqWs1HqYjCrAT'), // Important: Handle password input securely
    smtpSecure: ref(false),
});

const isLoading = ref(false);
const isLoadingDetails = ref(false);

const showAddContactsModal = ref(false);
const newContactsJsonText = ref('');
const newContactsJsonError = ref<string | null>(null);
const isAddingContacts = ref(false);
const parsedNewContacts = ref<any[]>([]);

const backendApiUrl = 'http://localhost:8080';

// Replace the computed property with a standard ref to store the parsed data
const parsedRecipients: Ref<any[]> = ref([]);

// Add this watch to update parsedRecipients whenever recipientsJsonText changes
watch(recipientsJsonText, (newValue) => {
    jsonParseError.value = null; // Reset error on change

    if (newValue.trim().length === 0) {
        parsedRecipients.value = [];
        return;
    }

    try {
        const parsed = JSON.parse(recipientsJsonText.value);
        if (!Array.isArray(parsed)) throw new Error("Input must be a JSON array.");
        const validRecipients = parsed.filter(item => typeof item === 'object' && item !== null && typeof item.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email));
        if (validRecipients.length !== parsed.length) console.warn("Filtered out invalid recipient objects.");
        if (validRecipients.length === 0 && parsed.length > 0) throw new Error("No valid recipient objects found.");
        parsedRecipients.value = validRecipients
    } catch (e) {
        jsonParseError.value = `Invalid JSON: ${e.message}`;
        parsedRecipients.value = [];
    }
}, { immediate: true });
// Add this watch effect with your other watchers
watch(newContactsJsonText, (newValue) => {
    newContactsJsonError.value = null;

    if (newValue.trim().length === 0) {
        parsedNewContacts.value = [];
        return;
    }

    try {
        const parsed = JSON.parse(newValue);
        if (!Array.isArray(parsed)) throw new Error("Input must be a JSON array.");
        const validContacts = parsed.filter(item =>
            typeof item === 'object' &&
            item !== null &&
            typeof item.email === 'string' &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email)
        );

        if (validContacts.length !== parsed.length) {
            console.warn("Filtered out invalid contact objects.");
        }
        if (validContacts.length === 0 && parsed.length > 0) {
            throw new Error("No valid contact objects found.");
        }
        parsedNewContacts.value = validContacts;
    } catch (e: any) {
        newContactsJsonError.value = `Invalid JSON: ${e.message}`;
        parsedNewContacts.value = [];
    }
}, { immediate: true });

// --- Methods ---

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

// Update the existing fetchSequences method
async function fetchSequences() {
    try {
        const response = await fetch(`${backendApiUrl}/api/sequences`);
        if (!response.ok) throw new Error('Failed to fetch sequences');
        const result = await response.json();
        if (result.success) {
            availableSequences.value = result.data.map((seq: any) => ({
                ...seq,
                created_at: new Date(seq.created_at).toISOString()
            }));
        } else {
            throw new Error(result.message || 'Failed to fetch sequences');
        }
    } catch (error: any) {
        toast.error(`Error fetching sequences: ${error.message}`);
        availableSequences.value = [];
    }
}

async function createCampaign() {
    if (!newCampaignName.value || !selectedSequenceId.value || !newCampaignFromEmail.value || !smtpConfig.smtpHost || !smtpConfig.smtpUser || !smtpConfig.smtpPass) {
        toast.error("Please fill in all campaign and SMTP details.");
        return;
    }
    if (jsonParseError.value) {
        toast.error(`Please fix the Recipient Data JSON. ${jsonParseError.value}`);
        return;
    }
    if (parsedRecipients.value.length === 0) {
        toast.error("Please enter valid recipient data in JSON format.");
        return;
    }

    isLoading.value = true;
    try {
        const payload = {
            name: newCampaignName.value,
            sequence_id: selectedSequenceId.value,
            from_email: newCampaignFromEmail.value,
            smtp_config: { // Send the reactive object's values
                smtpHost: smtpConfig.smtpHost,
                smtpPort: Number(smtpConfig.smtpPort),
                smtpUser: smtpConfig.smtpUser,
                smtpPass: smtpConfig.smtpPass, // !!! Security Warning !!!
                smtpSecure: smtpConfig.smtpSecure,
            },
            recipients: parsedRecipients.value,
        };

        const response = await fetch(`${backendApiUrl}/api/campaigns`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || `HTTP error! Status: ${response.status}`);
        }

        toast.success(result.message || 'Campaign created successfully!');
        if (result.errors?.length) {
            toast.warning(`Some contacts had issues: ${result.errors.join(', ')}`);
        }
        // Reset form and switch view
        resetCreateCampaignForm();
        currentView.value = 'campaignList';
        await fetchCampaigns(); // Refresh list

    } catch (error: any) {
        console.error("Failed to create campaign:", error);
        toast.error(`Failed to create campaign: ${error.message}`);
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
        if (currentView.value === 'campaignDetails' && selectedCampaignDetails.value?.id === campaignId) {
            await viewCampaignDetails(campaignId);
        }
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
        if (currentView.value === 'campaignDetails' && selectedCampaignDetails.value?.id === campaignId) {
            await viewCampaignDetails(campaignId);
        }
    } catch (error: any) {
        toast.error(`Error pausing campaign: ${error.message}`);
    } finally {
        isLoading.value = false;
    }
}
async function retryFailedContacts() {
    if (!selectedCampaignDetails.value?.id) return;

    isRetrying.value = true;
    try {
        const response = await fetch(`${backendApiUrl}/api/campaigns/${selectedCampaignDetails.value.id}/retry-failed`, {
            method: 'POST'
        });
        const result = await response.json();

        if (!response.ok) throw new Error(result.message || 'Failed to retry contacts');

        toast.success(result.message);
        // Refresh the campaign details and contacts list
        await viewCampaignDetails(selectedCampaignDetails.value.id);
    } catch (error: any) {
        toast.error(`Error retrying failed contacts: ${error.message}`);
    } finally {
        isRetrying.value = false;
    }
}
async function viewCampaignDetails(campaignId: string) {
    currentView.value = 'campaignDetails';
    isLoadingDetails.value = true;
    selectedCampaignDetails.value = null;
    campaignContacts.value = [];
    try {
        // Fetch campaign general info
        const campaignRes = await fetch(`${backendApiUrl}/api/campaigns/${campaignId}`);
        if (!campaignRes.ok) throw new Error('Failed to fetch campaign details');
        const campaignResult = await campaignRes.json();
        if (!campaignResult.success) throw new Error(campaignResult.message);
        selectedCampaignDetails.value = campaignResult.data;

        // Fetch campaign contacts list
        const contactsRes = await fetch(`${backendApiUrl}/api/campaigns/${campaignId}/contacts`);
        if (!contactsRes.ok) throw new Error('Failed to fetch campaign contacts');
        const contactsResult = await contactsRes.json();
        if (!contactsResult.success) throw new Error(contactsResult.message);
        campaignContacts.value = contactsResult.data;

    } catch (error: any) {
        toast.error(`Error loading campaign details: ${error.message}`);
        currentView.value = 'campaignList'; // Go back to list on error
    } finally {
        isLoadingDetails.value = false;
    }
}
// Add this method with your other methods
async function addContactsToCampaign() {
    if (!selectedCampaignDetails.value?.id) return;
    if (!parsedNewContacts.value.length) {
        toast.error("Please add valid contacts first.");
        return;
    }

    isAddingContacts.value = true;
    try {
        const response = await fetch(`${backendApiUrl}/api/campaigns/${selectedCampaignDetails.value.id}/contacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contacts: parsedNewContacts.value })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Failed to add contacts');

        toast.success(result.message);
        if (result.errors?.length) {
            toast.warning(`Some contacts had issues: ${result.errors.join(', ')}`);
        }

        // Reset form and close modal
        newContactsJsonText.value = '';
        showAddContactsModal.value = false;

        // Refresh campaign details
        await viewCampaignDetails(selectedCampaignDetails.value.id);
    } catch (error: any) {
        toast.error(`Error adding contacts: ${error.message}`);
    } finally {
        isAddingContacts.value = false;
    }
}

// Add to the methods section
async function viewSequenceDetails(sequenceId: string) {
    isLoading.value = true;
    try {
        const response = await fetch(`${backendApiUrl}/api/sequences/${sequenceId}`);
        if (!response.ok) throw new Error('Failed to fetch sequence details');
        const result = await response.json();
        if (!result.success) throw new Error(result.message);

        selectedSequenceDetails.value = result.data;
        currentView.value = 'sequenceDetails';
    } catch (error: any) {
        toast.error(`Error loading sequence details: ${error.message}`);
    } finally {
        isLoading.value = false;
    }
}

async function toggleSequenceEdit() {
    if (!selectedSequenceDetails.value) return;

    if (isEditingSequence.value) {
        // Save changes
        try {
            const response = await fetch(`${backendApiUrl}/api/sequences/${selectedSequenceDetails.value.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: selectedSequenceDetails.value.name,
                    steps: selectedSequenceDetails.value.steps
                })
            });

            if (!response.ok) throw new Error('Failed to update sequence');
            const result = await response.json();

            toast.success('Sequence updated successfully');
            // Refresh sequences list in background
            fetchSequences();
        } catch (error: any) {
            toast.error(`Failed to update sequence: ${error.message}`);
            // Optionally revert changes or reload original data
            await viewSequenceDetails(selectedSequenceDetails.value.id);
            return;
        }
    }

    isEditingSequence.value = !isEditingSequence.value;
}

function resetCreateCampaignForm() {
    newCampaignName.value = '';
    selectedSequenceId.value = null;
    recipientsJsonText.value = '';
    // Reset SMTP? Or keep previous settings? Keep for now.
}

function formatStatus(status: string): string {
    if (!status) return 'N/A';
    return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
}

// Fetch initial data on mount
onMounted(() => {
    fetchCampaigns();
    fetchSequences();
});

// Watch port to suggest smtpSecure value (keep this)
watch(() => smtpConfig.smtpPort, (newPort) => {
    if (newPort === 587) smtpConfig.smtpSecure = false;
    else if (newPort === 465) smtpConfig.smtpSecure = true;
});

</script>

<template>
    <div class="container mx-auto p-4 space-y-6">

        <!-- Navigation / View Switcher -->
        <div class="flex gap-2 mb-6 border-b pb-2">
            <Button :variant="currentView === 'campaignList' ? 'default' : 'outline'"
                @click="currentView = 'campaignList'; fetchCampaigns()">Campaigns</Button>
            <Button :variant="currentView === 'sequenceList' ? 'default' : 'outline'"
                @click="currentView = 'sequenceList'; fetchSequences()">Sequences</Button>
            <Button :variant="currentView === 'createCampaign' ? 'default' : 'outline'"
                @click="currentView = 'createCampaign'; fetchSequences()">Create Campaign</Button>
            <Button :variant="currentView === 'createSequence' ? 'default' : 'outline'"
                @click="currentView = 'createSequence'">Create Sequence</Button>
        </div>

        <!-- Campaign List View -->
        <div v-if="currentView === 'campaignList'">
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
                                        @click="viewCampaignDetails(campaign.id)">Details</Button>
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

        <!-- Create Campaign View -->
        <div v-if="currentView === 'createCampaign'">
            <Card>
                <CardHeader>
                    <CardTitle>Create New Campaign</CardTitle>
                    <CardDescription>Configure and set up a new email campaign.</CardDescription>
                </CardHeader>
                <CardContent class="space-y-6">
                    <!-- Campaign Details -->
                    <fieldset class="border p-4 rounded space-y-3">
                        <legend class="text-sm font-medium px-1">Campaign Details</legend>
                        <div>
                            <Label for="campaignName">Campaign Name</Label>
                            <Input id="campaignName" v-model="newCampaignName" placeholder="e.g., New Leads Follow-up"
                                required />
                        </div>
                        <div>
                            <Label for="sequenceSelect">Select Sequence</Label>
                            <Select v-model="selectedSequenceId">
                                <SelectTrigger id="sequenceSelect">
                                    <SelectValue placeholder="Choose a sequence..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem v-if="availableSequences.length === 0" value="none" disabled>No
                                        sequences found</SelectItem>
                                    <SelectItem v-for="seq in availableSequences" :key="seq.id" :value="seq.id">
                                        {{ seq.name }} ({{ seq.step_count }} steps)
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <p class="text-xs text-muted-foreground mt-1">Create sequences in the 'Create Sequence' tab.
                            </p>
                        </div>
                        <div>
                            <Label for="fromEmail">From Email</Label>
                            <Input id="fromEmail" v-model="newCampaignFromEmail" type="email"
                                placeholder="sender@yourdomain.com" required />
                            <p class="text-xs text-muted-foreground mt-1">Must be allowed by your SMTP server.</p>
                        </div>
                    </fieldset>

                    <!-- SMTP Configuration (reuse existing fields) -->
                    <fieldset class="border p-4 rounded space-y-3">
                        <legend class="text-sm font-medium px-1">SMTP Configuration</legend>
                        <!-- Copy/paste the SMTP fields from your original template here -->
                        <!-- Example: -->
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <Label for="smtpHost">SMTP Host</Label>
                                <Input id="smtpHost" v-model="smtpConfig.smtpHost" required />
                            </div>
                            <div>
                                <Label for="smtpPort">SMTP Port</Label>
                                <Input id="smtpPort" v-model.number="smtpConfig.smtpPort" type="number" required />
                                <div class="flex items-center space-x-2 mt-2">
                                    <input type="checkbox" id="smtpSecure" v-model="smtpConfig.smtpSecure"
                                        class="h-4 w-4 rounded border-gray-300" />
                                    <label for="smtpSecure" class="text-sm">Use Secure (TLS/SSL)?</label>
                                </div>
                            </div>
                        </div>
                        <div>
                            <Label for="smtpUser">SMTP Username</Label>
                            <Input id="smtpUser" v-model="smtpConfig.smtpUser" required />
                        </div>
                        <div>
                            <Label for="smtpPass">SMTP Password/App Password</Label>
                            <Input id="smtpPass" v-model="smtpConfig.smtpPass" type="password" required />
                            <p class="text-xs text-muted-foreground mt-1">Use App Password for Gmail/Outlook.</p>
                        </div>
                    </fieldset>

                    <!-- Recipients (reuse existing field) -->
                    <fieldset class="border p-4 rounded space-y-3">
                        <legend class="text-sm font-medium px-1">Add Recipients</legend>
                        <div>
                            <Label for="recipientsJson">Recipient Data (JSON Array)</Label>
                            <Textarea id="recipientsJson" v-model="recipientsJsonText"
                                placeholder='[{"email":"test@example.com", "firstName":"John"}, ...]' rows="6" required
                                :class="{ 'border-red-500': jsonParseError }" />
                            <p v-if="jsonParseError" class="text-xs text-red-600 mt-1">{{ jsonParseError }}</p>
                            <p v-else class="text-xs text-muted-foreground mt-1">
                                Paste JSON array. Each object needs "email". Other keys are placeholders. Found {{
                                    parsedRecipients.length }} valid.
                            </p>
                        </div>
                    </fieldset>

                </CardContent>
                <CardFooter>
                    <Button @click="createCampaign" :disabled="isLoading">
                        <svg v-if="isLoading" class="animate-spin -ml-1 mr-3 h-5 w-5" fill="none"
                            viewBox="0 0 24 24">...</svg>
                        {{ isLoading ? 'Creating...' : 'Create Campaign' }}
                    </Button>
                </CardFooter>
            </Card>
        </div>

        <!-- Create Sequence View -->
        <div v-if="currentView === 'createSequence'">
            <SequenceBuilder />
        </div>

        <!-- Campaign Details View -->
        <div v-if="currentView === 'campaignDetails'">
            <Card>
                <CardHeader>
                    <Button variant="outline" size="sm" @click="currentView = 'campaignList'" class="mb-4">← Back to
                        Campaigns</Button>
                    <div v-if="isLoadingDetails">Loading details...</div>
                    <div v-if="selectedCampaignDetails">
                        <CardTitle>{{ selectedCampaignDetails.name }}</CardTitle>
                        <CardDescription>
                            Sequence: {{ selectedCampaignDetails.sequence_name }} | Status: {{
                                formatStatus(selectedCampaignDetails.status) }}
                        </CardDescription>
                        <div class="mt-2 flex gap-2">
                            <Button size="sm"
                                v-if="selectedCampaignDetails.status === 'draft' || selectedCampaignDetails.status === 'paused'"
                                @click="startCampaign(selectedCampaignDetails.id)" :disabled="isLoading">Start</Button>
                            <Button size="sm" variant="secondary" v-if="selectedCampaignDetails.status === 'active'"
                                @click="pauseCampaign(selectedCampaignDetails.id)" :disabled="isLoading">Pause</Button>
                            <Button size="sm" variant="secondary" v-if="selectedCampaignDetails?.status === 'active'"
                                @click="retryFailedContacts" :disabled="isRetrying">
                                {{ isRetrying ? 'Retrying...' : 'Retry Failed' }}
                            </Button>
                            <Button size="sm" variant="secondary" v-if="selectedCampaignDetails?.status === 'active'"
                                @click="showAddContactsModal = true">
                                Add Contacts
                            </Button>
                            <!-- Add other actions: Add Contacts, Edit Settings -->
                        </div>
                    </div>
                </CardHeader>
                <CardContent v-if="selectedCampaignDetails && !isLoadingDetails">
                    <h3 class="font-semibold mb-3">Contact Progress</h3>
                    <div v-if="campaignContacts.length === 0" class="text-muted-foreground">No contacts found for this
                        campaign.</div>
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
        </div>
        <!-- Add after other view components in the template -->
        <!-- Sequence List View -->
        <div v-if="currentView === 'sequenceList'">
            <Card>
                <CardHeader>
                    <CardTitle>Email Sequences</CardTitle>
                    <CardDescription>Manage your email sequence templates.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div v-if="isLoading" class="text-center p-4">Loading sequences...</div>
                    <div v-else-if="availableSequences.length === 0" class="text-center p-4 text-muted-foreground">
                        No sequences created yet.
                    </div>
                    <div v-else class="space-y-4">
                        <Card v-for="sequence in availableSequences" :key="sequence.id">
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
                                    <Button size="sm" variant="outline" @click="viewSequenceDetails(sequence.id)">
                                        View/Edit
                                    </Button>
                                </div>
                            </CardHeader>
                        </Card>
                    </div>
                </CardContent>
            </Card>
        </div>

        <!-- Sequence Details/Edit View -->
        <div v-if="currentView === 'sequenceDetails' && selectedSequenceDetails">
            <Card>
                <CardHeader>
                    <Button variant="outline" size="sm" @click="currentView = 'sequenceList'" class="mb-4">
                        ← Back to Sequences
                    </Button>
                    <CardTitle class="flex justify-between items-center">
                        <span v-if="!isEditingSequence">{{ selectedSequenceDetails.name }}</span>
                        <Input v-else v-model="selectedSequenceDetails.name" class="max-w-md" />
                        <Button size="sm" @click="toggleSequenceEdit">
                            {{ isEditingSequence ? 'Save Changes' : 'Edit Sequence' }}
                        </Button>
                    </CardTitle>
                    <CardDescription>
                        {{ selectedSequenceDetails.steps?.length || 0 }} steps
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div class="space-y-6">
                        <div v-for="(step, index) in selectedSequenceDetails.steps" :key="index"
                            class="border rounded-lg p-4 space-y-4">
                            <div class="flex justify-between items-center">
                                <h3 class="font-semibold">Step {{ step.step_number }}</h3>
                                <div class="flex items-center gap-2">
                                    <span class="text-sm text-muted-foreground">
                                        Delay: {{ step.delay_days }} days
                                    </span>
                                    <Input v-if="isEditingSequence" v-model.number="step.delay_days" type="number"
                                        class="w-20" min="0" />
                                </div>
                            </div>

                            <div class="space-y-2">
                                <Label>Subject</Label>
                                <Input v-if="isEditingSequence" v-model="step.subject_template"
                                    placeholder="Email subject with {placeholders}" />
                                <div v-else class="text-sm border rounded p-2">
                                    {{ step.subject_template }}
                                </div>
                            </div>

                            <div class="space-y-2">
                                <Label>Body Template</Label>
                                <Textarea v-if="isEditingSequence" v-model="step.body_template"
                                    placeholder="Email body with {placeholders}" rows="6" />
                                <div v-else class="text-sm border rounded p-2 whitespace-pre-wrap">
                                    {{ step.body_template }}
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
        <Dialog :open="showAddContactsModal" @update:open="showAddContactsModal = false">
            <DialogScrollContent class="sm:max-w-[600px]">
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
            </DialogScrollContent>
        </Dialog>
    </div>
</template>