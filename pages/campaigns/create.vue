<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'vue-sonner'
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog'

const router = useRouter()
const backendApiUrl = 'http://localhost:8080'

// Form State
const isLoading = ref(false)
const newCampaignName = ref('')
const selectedSequenceId = ref<string | null>(null)
const newCampaignFromEmail = ref('')
const recipientsJsonText = ref('')
const jsonParseError = ref<string | null>(null)
const parsedRecipients = ref<any[]>([])
const availableSequences = ref<Array<{ id: string; name: string; step_count: number }>>([])
const showTestEmailDialog = ref(false)
const testEmailAddress = ref('')
const isSendingTest = ref(false)

// SMTP Configuration
const smtpConfig = reactive({
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpSecure: false
})

// Add a new reactive reference for storing the current sequence details
const currentSequence = ref<{
    id: string;
    name: string;
    steps: Array<{
        step_number: number;
        subject_template: string;
        body_template: string;
        delay_days: number;
    }>;
} | null>(null)

// Watch for JSON validation
watch(recipientsJsonText, (newValue) => {
    if (!newValue.trim()) {
        jsonParseError.value = null
        parsedRecipients.value = []
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

        if (validContacts.length !== parsed.length) {
            console.warn("Filtered out invalid contact objects.")
        }
        if (validContacts.length === 0 && parsed.length > 0) {
            throw new Error("No valid contact objects found.")
        }
        parsedRecipients.value = validContacts
        jsonParseError.value = null
    } catch (e: any) {
        jsonParseError.value = `Invalid JSON: ${e.message}`
        parsedRecipients.value = []
    }
})

// Watch port to suggest smtpSecure value
watch(() => smtpConfig.smtpPort, (newPort) => {
    if (newPort === 587) smtpConfig.smtpSecure = false
    else if (newPort === 465) smtpConfig.smtpSecure = true
})

// Add a watch effect for sequence selection
watch(selectedSequenceId, async (newId) => {
    if (!newId) {
        currentSequence.value = null
        return
    }

    try {
        const response = await fetch(`${backendApiUrl}/api/sequences/${newId}`);
        if (!response.ok) throw new Error('Failed to fetch sequence details');
        const result = await response.json();
        if (result.success) {
            currentSequence.value = result.data;
        }
    } catch (error: any) {
        toast.error(`Error fetching sequence details: ${error.message}`);
        currentSequence.value = null;
    }
});

// Methods
async function fetchSequences() {
    try {
        const response = await fetch(`${backendApiUrl}/api/sequences`)
        if (!response.ok) throw new Error('Failed to fetch sequences')
        const result = await response.json()
        if (result.success) {
            availableSequences.value = result.data
        } else {
            throw new Error(result.message || 'Failed to fetch sequences')
        }
    } catch (error: any) {
        toast.error(`Error fetching sequences: ${error.message}`)
        availableSequences.value = []
    }
}

async function createCampaign() {
    if (!newCampaignName.value || !selectedSequenceId.value || !newCampaignFromEmail.value || 
        !smtpConfig.smtpHost || !smtpConfig.smtpUser || !smtpConfig.smtpPass) {
        toast.error("Please fill in all campaign and SMTP details.")
        return
    }
    if (jsonParseError.value) {
        toast.error(`Please fix the Recipient Data JSON. ${jsonParseError.value}`)
        return
    }
    if (parsedRecipients.value.length === 0) {
        toast.error("Please enter valid recipient data in JSON format.")
        return
    }

    isLoading.value = true
    try {
        const payload = {
            name: newCampaignName.value,
            sequence_id: selectedSequenceId.value,
            from_email: newCampaignFromEmail.value,
            smtp_config: {
                smtpHost: smtpConfig.smtpHost,
                smtpPort: Number(smtpConfig.smtpPort),
                smtpUser: smtpConfig.smtpUser,
                smtpPass: smtpConfig.smtpPass,
                smtpSecure: smtpConfig.smtpSecure,
            },
            recipients: parsedRecipients.value,
        }

        const response = await fetch(`${backendApiUrl}/api/campaigns`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
        const result = await response.json()

        if (!response.ok) {
            throw new Error(result.message || `HTTP error! Status: ${response.status}`)
        }

        toast.success(result.message || 'Campaign created successfully!')
        if (result.errors?.length) {
            toast.warning(`Some contacts had issues: ${result.errors.join(', ')}`)
        }
        
        router.push('/')
    } catch (error: any) {
        console.error("Failed to create campaign:", error)
        toast.error(`Failed to create campaign: ${error.message}`)
    } finally {
        isLoading.value = false
    }
}

async function sendTestEmail() {
    if (!testEmailAddress.value || !newCampaignFromEmail.value || 
        !smtpConfig.smtpHost || !smtpConfig.smtpUser || !smtpConfig.smtpPass) {
        toast.error("Please fill in all email and SMTP details first")
        return;
    }

    if (!currentSequence.value?.steps?.length) {
        toast.error("No sequence template available");
        return;
    }

    const firstStep = currentSequence.value.steps[0];
    const testData = {
        firstName: "Test",
        lastName: "User",
        company: "Test Company",
        email: testEmailAddress.value
    };

    isSendingTest.value = true;
    try {
        const response = await fetch(`${backendApiUrl}/api/test-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fromEmail: newCampaignFromEmail.value,
                toEmail: testEmailAddress.value,
                subject: replacePlaceholders(firstStep.subject_template, testData),
                body: replacePlaceholders(firstStep.body_template, testData),
                smtpConfig: {
                    smtpHost: smtpConfig.smtpHost,
                    smtpPort: Number(smtpConfig.smtpPort),
                    smtpUser: smtpConfig.smtpUser,
                    smtpPass: smtpConfig.smtpPass,
                    smtpSecure: smtpConfig.smtpSecure
                }
            })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        toast.success('Test email sent successfully!');
        showTestEmailDialog.value = false;
    } catch (error: any) {
        toast.error(`Failed to send test email: ${error.message}`);
    } finally {
        isSendingTest.value = false;
    }
}

// Add helper function for placeholder replacement
function replacePlaceholders(template: string, data: Record<string, any>): string {
    return template.replace(/\{([^}]+)\}/g, (match, key) => {
        return data[key] || match;
    });
}

// Fetch sequences on mount
onMounted(() => {
    fetchSequences()
})
</script>

<template>
    <div class="container mx-auto p-4">
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
                        <Input id="campaignName" v-model="newCampaignName" 
                            placeholder="e.g., New Leads Follow-up" required />
                    </div>
                    <div>
                        <Label for="sequenceSelect">Select Sequence</Label>
                        <Select v-model="selectedSequenceId">
                            <SelectTrigger id="sequenceSelect">
                                <SelectValue placeholder="Choose a sequence..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem v-if="availableSequences.length === 0" 
                                    value="none" disabled>No sequences found</SelectItem>
                                <SelectItem v-for="seq in availableSequences" 
                                    :key="seq.id" :value="seq.id">
                                    {{ seq.name }} ({{ seq.step_count }} steps)
                                </SelectItem>
                            </SelectContent>
                        </Select>
                        <p class="text-xs text-muted-foreground mt-1">
                            Create sequences in the Sequences section first.
                        </p>
                    </div>
                    <div>
                        <Label for="fromEmail">From Email</Label>
                        <Input id="fromEmail" v-model="newCampaignFromEmail" 
                            type="email" placeholder="sender@yourdomain.com" required />
                        <p class="text-xs text-muted-foreground mt-1">
                            Must be allowed by your SMTP server.
                        </p>
                    </div>
                </fieldset>

                <!-- SMTP Configuration -->
                <fieldset class="border p-4 rounded space-y-3">
                    <legend class="text-sm font-medium px-1">SMTP Configuration</legend>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <Label for="smtpHost">SMTP Host</Label>
                            <Input id="smtpHost" v-model="smtpConfig.smtpHost" required />
                        </div>
                        <div>
                            <Label for="smtpPort">SMTP Port</Label>
                            <Input id="smtpPort" v-model.number="smtpConfig.smtpPort" 
                                type="number" required />
                        </div>
                    </div>
                    <div>
                        <Label for="smtpUser">SMTP Username</Label>
                        <Input id="smtpUser" v-model="smtpConfig.smtpUser" required />
                    </div>
                    <div>
                        <Label for="smtpPass">SMTP Password/App Password</Label>
                        <Input id="smtpPass" v-model="smtpConfig.smtpPass" 
                            type="password" required />
                        <p class="text-xs text-muted-foreground mt-1">
                            Use App Password for Gmail/Outlook.
                        </p>
                    </div>
                    <div class="mt-4">
                        <Button 
                            type="button"
                            variant="outline"
                            @click="showTestEmailDialog = true"
                            :disabled="!smtpConfig.smtpHost || !smtpConfig.smtpUser || !smtpConfig.smtpPass"
                        >
                            Test Email Settings
                        </Button>
                    </div>
                </fieldset>

                <!-- Recipients -->
                <fieldset class="border p-4 rounded space-y-3">
                    <legend class="text-sm font-medium px-1">Add Recipients</legend>
                    <div>
                        <Label for="recipientsJson">Recipient Data (JSON Array)</Label>
                        <Textarea id="recipientsJson" v-model="recipientsJsonText"
                            placeholder='[{"email":"test@example.com", "firstName":"John"}, ...]'
                            rows="6" required :class="{ 'border-red-500': jsonParseError }" />
                        <p v-if="jsonParseError" class="text-xs text-red-600 mt-1">
                            {{ jsonParseError }}
                        </p>
                        <p v-else class="text-xs text-muted-foreground mt-1">
                            Found {{ parsedRecipients.length }} valid contacts to add.
                        </p>
                    </div>
                </fieldset>
            </CardContent>
            <CardFooter class="flex justify-between">
                <Button variant="outline" @click="router.push('/campaigns')">
                    Cancel
                </Button>
                <Button @click="createCampaign" :disabled="isLoading">
                    <svg v-if="isLoading" class="animate-spin -ml-1 mr-3 h-5 w-5" 
                        xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" 
                            stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" 
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
                        </path>
                    </svg>
                    {{ isLoading ? 'Creating...' : 'Create Campaign' }}
                </Button>
            </CardFooter>
        </Card>
    </div>

    <Dialog :open="showTestEmailDialog" @update:open="showTestEmailDialog = false">
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Send Test Email</DialogTitle>
                <DialogDescription>
                    Send a test email using the first step of sequence: {{ currentSequence?.name || 'No sequence selected' }}
                </DialogDescription>
            </DialogHeader>
            
            <div class="space-y-4 py-4">
                <div class="space-y-2">
                    <Label>Test Email Address</Label>
                    <Input
                        v-model="testEmailAddress"
                        type="email"
                        placeholder="Enter email to receive test"
                        required
                    />
                    <p class="text-xs text-muted-foreground">
                        A test email will be sent from {{ newCampaignFromEmail || '[from email]' }}
                    </p>
                    <p class="text-xs text-muted-foreground">
                        Using template from Step 1 with test data for placeholders.
                    </p>
                </div>
            </div>

            <DialogFooter>
                <Button
                    variant="outline"
                    @click="showTestEmailDialog = false"
                    :disabled="isSendingTest"
                >
                    Cancel
                </Button>
                <Button
                    @click="sendTestEmail"
                    :disabled="isSendingTest || !testEmailAddress || !currentSequence?.steps?.length"
                >
                    <svg v-if="isSendingTest" class="animate-spin -ml-1 mr-3 h-5 w-5" 
                        xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" 
                            stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" 
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
                        </path>
                    </svg>
                    {{ isSendingTest ? 'Sending...' : 'Send Test' }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>