import { Elysia, t, NotFoundError } from 'elysia';
import { cors } from '@elysiajs/cors';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import postgres from 'postgres'; // Use 'postgres' library for Bun/Node
import schedule from 'node-schedule'; // Import node-schedule

// --- Environment Variables ---
// Make sure to set these in your .env file or environment
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://abrar:password@localhost:5432/cold_db';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
// WARNING: Storing SMTP passwords directly in the DB is convenient but NOT recommended for production.
// Consider using a secrets manager or environment variables per campaign if possible.

// --- Database Setup ---
console.log("Connecting to database...");
const sql = postgres(DATABASE_URL);
console.log("Database connection established.");

// --- Helper Functions ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function replacePlaceholders(template: string, data: Record<string, any>): { result: string; missing: string[] } {
    const missing: string[] = [];
    if (!template) return { result: '', missing: [] }; // Handle null/undefined template

    const result = template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
        // Access nested data if needed (e.g., {contact.firstName}) - simplified here
        const value = data[key];
        if (value !== undefined && value !== null) {
            return String(value);
        } else {
            console.warn(`Placeholder {${key}} not found in data. Replacing with empty string.`);
            missing.push(key);
            return '';
        }
    });
    return { result, missing };
}

// --- Zod Schemas ---
const recipientObjectSchema = z.object({
    email: z.string().email('Invalid recipient email found in object')
}).passthrough(); // Allow and preserve all other fields

const stepSchema = z.object({
    id: z.string().uuid().optional(), // Optional for new steps
    step_number: z.number().int().min(1),
    subject_template: z.string().min(1, 'Subject template is required'),
    body_template: z.string().min(1, 'Body template is required'),
    delay_days: z.number().int().min(0, 'Delay must be non-negative'), // Allow 0 for immediate follow-up? Usually >= 1
});

const sequenceSchema = z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1, 'Sequence name is required'),
    steps: z.array(stepSchema).min(1, 'Sequence must have at least one step'),
});

const smtpConfigSchema = z.object({
    smtpHost: z.string().min(1),
    smtpPort: z.number().int().positive(),
    smtpUser: z.string().min(1),
    smtpPass: z.string().min(1), // !!! Security Warning !!!
    smtpSecure: z.boolean(),
});

const campaignSchema = z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1, 'Campaign name is required'),
    sequence_id: z.string().uuid('Invalid Sequence ID'),
    from_email: z.string().email('Invalid From Email'),
    smtp_config: smtpConfigSchema,
    recipients: z.array(recipientObjectSchema).min(1, 'At least one recipient is required'), // For adding contacts on create/update
});

// --- Global Scheduler Job Map (for cancellation) ---
// In-memory map to hold scheduled jobs. Key: campaignContactId, Value: node-schedule Job
const scheduledJobs = new Map<string, schedule.Job>();

// --- Core Scheduling and Sending Logic ---

async function scheduleNextStep(campaignContactId: string, sql: postgres.Sql, delay?: number) {
    console.log(`[Scheduler] Processing next step for campaign contact: ${campaignContactId}`);
    const results = await sql`
        SELECT
            cc.id, cc.campaign_id, cc.contact_email, cc.contact_data, cc.current_step_number, cc.status as contact_status,
            c.sequence_id, c.from_email, c.smtp_config, c.status as campaign_status,
            s.id as step_id, s.step_number, s.subject_template, s.body_template, s.delay_days
        FROM campaign_contacts cc
        JOIN campaigns c ON cc.campaign_id = c.id
        LEFT JOIN sequence_steps s ON c.sequence_id = s.sequence_id AND s.step_number = cc.current_step_number + 1
        WHERE cc.id = ${campaignContactId}
    `;

    if (results.length === 0) {
        console.error(`[Scheduler] Campaign contact ${campaignContactId} not found.`);
        scheduledJobs.delete(campaignContactId); // Clean up map
        return;
    }

    const data = results[0];

    // --- Pre-send Checks ---
    if (data.campaign_status !== 'active') {
        console.log(`[Scheduler] Campaign ${data.campaign_id} is not active. Skipping send for ${data.contact_email}.`);
        scheduledJobs.delete(campaignContactId);
        await sql`UPDATE campaign_contacts SET status = 'paused', scheduled_job_id = NULL, next_send_time = NULL WHERE id = ${campaignContactId}`;
        return;
    }
    if (data.contact_status !== 'active' && data.contact_status !== 'pending') {
        console.log(`[Scheduler] Contact ${data.contact_email} in campaign ${data.campaign_id} is not active (status: ${data.contact_status}). Skipping send.`);
        scheduledJobs.delete(campaignContactId);
        return; // Already handled (replied, bounced, etc.)
    }
    if (!data.step_id) {
        console.log(`[Scheduler] No next step found for ${data.contact_email} in campaign ${data.campaign_id}. Marking as completed.`);
        await sql`UPDATE campaign_contacts SET status = 'completed', scheduled_job_id = NULL, next_send_time = NULL WHERE id = ${campaignContactId}`;
        scheduledJobs.delete(campaignContactId);
        return;
    }

    // --- Calculate Send Time ---
    const now = new Date();
    let sendTime = new Date(now);
    // For the *first* step (current_step_number=0), delay is relative to *now* or campaign start. Let's use now for simplicity.
    // For subsequent steps, delay is relative to the *previous* step's theoretical send time (or actual if tracked precisely).
    // Let's approximate: add delay_days relative to now if scheduling for the first time or resuming.
    // If rescheduling an *existing* job (e.g., server restart), use the stored next_send_time.
    // This needs careful handling of resumes and restarts. For simplicity now: calculate based on delay from NOW.
    sendTime.setDate(now.getDate() + data.delay_days);
    sendTime.setMinutes(now.getMinutes() + 1)
    sendTime.setSeconds(now.getSeconds() + (delay ?? 0))
    // TODO: Add logic for specific sending times/days window if needed.

    // --- Schedule the Job ---
    const jobId = `campaign_contact_${campaignContactId}_step_${data.step_number}`;

    // Cancel existing job for this contact step if it exists (e.g., on resume)
    const existingJob = scheduledJobs.get(campaignContactId);
    if (existingJob) {
        existingJob.cancel();
        scheduledJobs.delete(campaignContactId);
        console.log(`[Scheduler] Canceled existing job for ${campaignContactId}`);
    }

    console.log(`[Scheduler] Scheduling email for ${data.contact_email} (Step ${data.step_number}) at ${sendTime.toISOString()}`);

    const job = schedule.scheduleJob(jobId, sendTime, async () => {
        console.log(`[Job Runner] Executing job: ${jobId} for ${data.contact_email}`);
        scheduledJobs.delete(campaignContactId); // Remove from map once it starts running

        // --- Send the Email ---
        const smtpConf = data.smtp_config as z.infer<typeof smtpConfigSchema>; // Type assertion
        const transporter = nodemailer.createTransport({
            host: smtpConf.smtpHost,
            port: smtpConf.smtpPort,
            secure: smtpConf.smtpSecure,
            auth: { user: smtpConf.smtpUser, pass: smtpConf.smtpPass }, // Security Warning!
            tls: { rejectUnauthorized: false } // Often needed for self-signed/local certs
        });

        try {
            // Verify connection before sending each time? Or assume it's okay? Let's verify.
             await transporter.verify();

            const { result: personalizedSubject, missing: missingSubject } = replacePlaceholders(data.subject_template, data.contact_data);
            const { result: personalizedBody, missing: missingBody } = replacePlaceholders(data.body_template, data.contact_data);
            const allMissing = [...new Set([...missingSubject, ...missingBody])];

            const mailOptions = {
                from: data.from_email,
                to: data.contact_email,
                subject: personalizedSubject,
                html: personalizedBody, // Assume body template is HTML
                // text: convertHtmlToText(personalizedBody), // Add a text version
                headers: { // Add custom headers for tracking if needed later
                    'X-Campaign-ID': data.campaign_id,
                    'X-Campaign-Contact-ID': campaignContactId,
                    'X-Sequence-Step': data.step_number.toString()
                }
            };

            console.log(`[Job Runner] Sending email to ${data.contact_email}, Subject: ${personalizedSubject.substring(0, 50)}...`);
            const info = await transporter.sendMail(mailOptions);
            console.log(`[Job Runner] Email sent successfully to ${data.contact_email}: ${info.messageId}`);

            // --- Update DB on Success ---
            await sql`
                UPDATE campaign_contacts
                SET status = 'active', -- Still active, waiting for next step or completion
                    current_step_number = ${data.step_number},
                    scheduled_job_id = NULL,
                    next_send_time = NULL,
                    last_error = NULL,
                    updated_at = NOW()
                WHERE id = ${campaignContactId} AND status = 'active' -- Ensure status didn't change
            `;

            // --- Schedule the *NEXT* step (if any) ---
            // Re-query to get potentially updated data? Or assume data is okay? Let's re-query for safety.
             const nextStepCheck = await sql`
                SELECT cc.status as contact_status, c.status as campaign_status
                FROM campaign_contacts cc JOIN campaigns c ON cc.campaign_id = c.id
                WHERE cc.id = ${campaignContactId}`;

            if (nextStepCheck.length > 0 && nextStepCheck[0].contact_status === 'active' && nextStepCheck[0].campaign_status === 'active') {
                 // Pass the SAME campaignContactId, the function figures out the next step (+1)
                await scheduleNextStep(campaignContactId, sql);
            } else {
                console.log(`[Job Runner] Contact ${data.contact_email} or campaign ${data.campaign_id} no longer active after send. Not scheduling next step.`);
            }

        } catch (error: any) {
            console.error(`[Job Runner] Failed to send email to ${data.contact_email}:`, error);
            // --- Update DB on Failure ---
            await sql`
                UPDATE campaign_contacts
                SET status = 'failed', -- Mark as failed for this step
                    last_error = ${error.message || 'Unknown sending error'},
                    scheduled_job_id = NULL, -- Clear job ID on failure
                    next_send_time = NULL,
                    updated_at = NOW()
                WHERE id = ${campaignContactId}
            `;
            // Maybe implement retry logic here later
        } finally {
             transporter.close(); // Close connection
        }
    });

    if (job) {
        scheduledJobs.set(campaignContactId, job);
        // --- Update DB with schedule info ---
        await sql`
            UPDATE campaign_contacts
            SET scheduled_job_id = ${jobId},
            next_send_time = ${sendTime},
            current_step_number = ${data.step_number - 1}, -- We scheduled step N, so they are *currently* before step N
            status = 'active', -- Mark as active now that it's scheduled
            updated_at = NOW()
            WHERE id = ${campaignContactId} AND status IN ('pending', 'active')
        `;
         console.log(`[Scheduler] Successfully scheduled job ${jobId} for contact ${campaignContactId}`);
    } else {
        console.error(`[Scheduler] Failed to schedule job for contact ${campaignContactId}. Send time might be in the past: ${sendTime.toISOString()}`);
         await sql`
            UPDATE campaign_contacts
            SET status = 'failed',
                last_error = 'Failed to schedule job (time might be in the past)',
                updated_at = NOW()
            WHERE id = ${campaignContactId} AND status = 'pending'
        `;
    }
}

// --- Function to Reschedule Pending Jobs on Startup ---
async function reschedulePendingJobs(sql: postgres.Sql) {
    console.log('[Startup] Rescheduling pending jobs...');
    const pendingContacts = await sql`
        SELECT cc.id
        FROM campaign_contacts cc
        JOIN campaigns camp ON cc.campaign_id = camp.id
        WHERE cc.status = 'active'
          AND cc.next_send_time IS NOT NULL
          AND cc.next_send_time > NOW()
          AND camp.status = 'active'
    `;

    console.log(`[Startup] Found ${pendingContacts.length} contacts with pending future sends.`);
    let count = 0;
    for (const contact of pendingContacts) {
        try {
             // scheduleNextStep will calculate the next step based on current_step_number + 1
             // We need to ensure the next_send_time from DB is respected if it's valid.
             // The current scheduleNextStep recalculates time. Needs adjustment for rescheduling.

             // --- Modification for Rescheduling ---
             // Let's try scheduling directly using the stored time if it exists and is in the future.
             const details = await sql`
                SELECT next_send_time, current_step_number FROM campaign_contacts WHERE id = ${contact.id}
             `;
             if (details.length > 0 && details[0].next_send_time) {
                 const storedSendTime = new Date(details[0].next_send_time);
                 const nextStep = details[0].current_step_number + 1;
                 if (storedSendTime > new Date()) {
                      const jobId = `campaign_contact_${contact.id}_step_${nextStep}`; // Reconstruct job ID
                      const job = schedule.scheduleJob(jobId, storedSendTime, () => {
                          // IMPORTANT: This inner function needs access to the SAME logic
                          // as the one inside scheduleNextStep's scheduled job.
                          // This points towards needing a dedicated function `executeScheduledSend(campaignContactId)`
                          // that BOTH the initial scheduling and rescheduling can call.
                          // For now, we are duplicating the risk. Refactor later.
                          console.log(`[Rescheduled Job] Running for ${contact.id}`);
                          // Ideally, call a function: executeScheduledSend(contact.id, sql);
                           scheduledJobs.delete(contact.id); // Remove from map
                           // Add the actual sending logic here or call a shared function
                           // Placeholder:
                           scheduleNextStep(contact.id, sql); // This will re-evaluate and send or complete/fail
                      });

                      if (job) {
                          scheduledJobs.set(contact.id, job);
                          await sql`UPDATE campaign_contacts SET scheduled_job_id = ${jobId} WHERE id = ${contact.id}`;
                          count++;
                           console.log(`[Startup] Rescheduled job ${jobId} for ${contact.id} at ${storedSendTime.toISOString()}`);
                      } else {
                          console.error(`[Startup] Failed to reschedule job for ${contact.id} (time might be invalid: ${storedSendTime.toISOString()})`);
                           await sql`UPDATE campaign_contacts SET status='failed', last_error='Reschedule failed', scheduled_job_id=NULL WHERE id = ${contact.id}`;
                      }

                 } else {
                     console.warn(`[Startup] Stored send time for ${contact.id} is in the past (${storedSendTime.toISOString()}). Skipping reschedule.`);
                      // Optionally trigger immediate send or mark as failed
                       await sql`UPDATE campaign_contacts SET status='failed', last_error='Missed schedule time during downtime', scheduled_job_id=NULL WHERE id = ${contact.id}`;
                 }
             }

        } catch (error) {
            console.error(`[Startup] Error rescheduling job for contact ${contact.id}:`, error);
        }
    }
    console.log(`[Startup] Rescheduled ${count} jobs.`);
}


// --- Elysia App Setup ---
const app = new Elysia()
    .use(cors({
        origin: FRONTEND_URL,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
    }))
    .decorate('db', sql) // Decorate context with db connection
    .decorate('scheduleNextStep', scheduleNextStep) // Decorate context with scheduler function
    .decorate('scheduledJobs', scheduledJobs) // Access to jobs map
    .onError(({ code, error, set }) => {
        console.error(`Error [${code}]:`, error);
        if (error instanceof z.ZodError) {
            set.status = 400;
            return { success: false, message: 'Validation Error', errors: error.flatten().fieldErrors };
        }
        if (error instanceof NotFoundError) {
             set.status = 404;
             return { success: false, message: error.message };
        }
        // Handle postgres errors specifically? e.g., unique constraint violation
        if (error instanceof postgres.PostgresError) {
            console.error("Database Error:", error.message, error.code);
            set.status = 409; // Conflict might be appropriate for unique violations
            return { success: false, message: `Database Error: ${error.message}` };
        }
        set.status = 500;
        return { success: false, message: error.message || 'An internal server error occurred.' };
    })
    .get("/api/status", () => ({ status: "OK", database: "connected" })) // Simple status check

    // --- Sequence Endpoints ---
    .post('/api/sequences', async ({ db, body, set }) => {
        const validation = sequenceSchema.safeParse(body);
        if (!validation.success) {
            set.status = 400;
            return { success: false, message: 'Validation Error', errors: validation.error.flatten().fieldErrors };
        }
        const { name, steps } = validation.data;

        // Use transaction
        const result = await db.begin(async sql => {
            const sequenceResult = await sql`INSERT INTO sequences (name) VALUES (${name}) RETURNING id`;
            const sequenceId = sequenceResult[0].id;

            for (const step of steps) {
                await sql`
                    INSERT INTO sequence_steps (sequence_id, step_number, subject_template, body_template, delay_days)
                    VALUES (${sequenceId}, ${step.step_number}, ${step.subject_template}, ${step.body_template}, ${step.delay_days})
                `;
            }
            return { id: sequenceId };
        });

        set.status = 201; // Created
        return { success: true, message: 'Sequence created successfully', data: result };
    }, {
        body: t.Object({ // Use Elysia's types for automatic parsing/validation hint
            name: t.String(),
            steps: t.Array(t.Object({
                step_number: t.Number(),
                subject_template: t.String(),
                body_template: t.String(),
                delay_days: t.Number(),
            }))
        })
    })
    .get('/api/sequences', async ({ db }) => {
        const sequences = await db`
            SELECT s.id, s.name, COUNT(st.id) as step_count, s.created_at, s.updated_at
            FROM sequences s
            LEFT JOIN sequence_steps st ON s.id = st.sequence_id
            GROUP BY s.id
            ORDER BY s.created_at DESC
        `;
        return { success: true, data: sequences };
    })
     .get('/api/sequences/:id', async ({ db, params, set }) => {
        const { id } = params;
        const sequence = await db`SELECT * FROM sequences WHERE id = ${id}`;
        if (sequence.length === 0) throw new NotFoundError('Sequence not found');

        const steps = await db`
            SELECT id, step_number, subject_template, body_template, delay_days
            FROM sequence_steps
            WHERE sequence_id = ${id}
            ORDER BY step_number ASC
        `;
        return { success: true, data: { ...sequence[0], steps } };
     }, { params: t.Object({ id: t.String({ format: 'uuid' }) })})
     // TODO: Add PUT /api/sequences/:id (requires careful handling of step updates/deletions/additions)
     // TODO: Add DELETE /api/sequences/:id

    // --- Campaign Endpoints ---
    .post('/api/campaigns', async ({ db, body, set }) => {
        const validation = campaignSchema.safeParse(body);
        if (!validation.success) {
            set.status = 400;
            return { success: false, message: 'Validation Error', errors: validation.error.flatten().fieldErrors };
        }
        const { name, sequence_id, from_email, smtp_config, recipients } = validation.data;

        // Verify sequence exists
        const seqExists = await db`SELECT id FROM sequences WHERE id = ${sequence_id}`;
        if (seqExists.length === 0) {
            set.status = 400;
            return { success: false, message: `Sequence with ID ${sequence_id} not found.` };
        }

        // Transaction to create campaign and contacts
        const result = await db.begin(async sql => {
            const campaignResult = await sql`
                INSERT INTO campaigns (name, sequence_id, from_email, smtp_config, status)
                VALUES (${name}, ${sequence_id}, ${from_email}, ${sql.json(smtp_config)}, 'draft')
                RETURNING id
            `;
            const campaignId = campaignResult[0].id;

            let addedCount = 0;
            const errors: string[] = [];
            for (const recipient of recipients) {
                 try {
                    // Store all keys from recipient object into contact_data JSONB
                    const contactData = { ...recipient };
                    // delete contactData.email; // Optionally remove email from JSON if desired

                    await sql`
                        INSERT INTO campaign_contacts (campaign_id, contact_email, contact_data, status, current_step_number)
                        VALUES (${campaignId}, ${recipient.email}, ${sql.json(contactData)}, 'pending', 0)
                    `;
                    addedCount++;
                } catch (e: any) {
                     if (e instanceof postgres.PostgresError && e.code === '23505') { // unique_violation
                         errors.push(`Contact ${recipient.email} already exists in this campaign.`);
                     } else {
                         errors.push(`Failed to add contact ${recipient.email}: ${e.message}`);
                     }
                     console.error(`Failed to add contact ${recipient.email} to campaign ${campaignId}:`, e);
                }
            }

            return { campaignId, addedCount, errors };
        });

        set.status = 201;
        return {
            success: true,
            message: `Campaign created with ${result.addedCount} contacts.`,
            data: { id: result.campaignId },
            errors: result.errors,
        };
    }, {
         body: t.Object({ // Elysia type hint
            name: t.String(),
            sequence_id: t.String({ format: 'uuid' }),
            from_email: t.String({ format: 'email' }),
            smtp_config: t.Object({
                smtpHost: t.String(),
                smtpPort: t.Number(),
                smtpUser: t.String(),
                smtpPass: t.String(),
                smtpSecure: t.Boolean(),
            }),
            recipients: t.Array(
                t.Intersect([
                  t.Object({
                    email: t.String({ format: 'email' })
                  }),
                  t.Record(t.String(), t.Any()) // allows any other properties
                ]),
                { minItems: 1 }
            )
        })
    })
    .get('/api/campaigns', async ({ db }) => {
        // Basic list view
         const campaigns = await db`
            SELECT
                c.id, c.name, c.status, c.created_at, s.name as sequence_name,
                COUNT(cc.id) as total_contacts,
                COUNT(cc.id) FILTER (WHERE cc.status = 'completed') as completed_contacts,
                COUNT(cc.id) FILTER (WHERE cc.status = 'failed') as failed_contacts
                -- Add more counts (replied, bounced) later
            FROM campaigns c
            JOIN sequences s ON c.sequence_id = s.id
            LEFT JOIN campaign_contacts cc ON c.id = cc.campaign_id
            GROUP BY c.id, s.name
            ORDER BY c.created_at DESC
        `;
        return { success: true, data: campaigns };
    })
    .get('/api/campaigns/:id', async ({ db, params, set }) => {
         const { id } = params;
         const campaign = await db`SELECT c.*, s.name as sequence_name FROM campaigns c JOIN sequences s ON c.sequence_id = s.id WHERE c.id = ${id}`;
         if (campaign.length === 0) throw new NotFoundError('Campaign not found');

         // Add contact counts/stats here if needed
         const stats = await db`
             SELECT status, COUNT(*) as count
             FROM campaign_contacts
             WHERE campaign_id = ${id}
             GROUP BY status
         `;

         return { success: true, data: { ...campaign[0], stats } };
    }, { params: t.Object({ id: t.String({ format: 'uuid' }) })})
     .get('/api/campaigns/:id/contacts', async ({ db, params, set }) => {
         const { id } = params;
         const contacts = await db`
             SELECT id, contact_email, status, current_step_number, next_send_time, last_error, updated_at
             FROM campaign_contacts
             WHERE campaign_id = ${id}
             ORDER BY created_at ASC
         `;
         return { success: true, data: contacts };
     }, { params: t.Object({ id: t.String({ format: 'uuid' }) })})


    .post('/api/campaigns/:id/start', async ({ db, scheduleNextStep, params, set }) => {
        const { id } = params;
        console.log(`[API] Received request to start campaign: ${id}`);

        // Use transaction to update campaign and schedule initial emails
        const result = await db.begin(async sql => {
            // 1. Update Campaign Status
            const campaignUpdate = await sql`
                UPDATE campaigns SET status = 'active', updated_at = NOW()
                WHERE id = ${id} AND status IN ('draft', 'paused') -- Only start if draft or paused
                RETURNING id, status
            `;
            if (campaignUpdate.length === 0) {
                // Check current status
                const current = await sql`SELECT status FROM campaigns WHERE id = ${id}`;
                if (current.length === 0) throw new NotFoundError('Campaign not found');
                throw new Error(`Campaign cannot be started (current status: ${current[0].status})`);
            }
             console.log(`[API] Campaign ${id} status set to active.`);

            // 2. Find contacts ready to be scheduled (pending status, step 0)
            const contactsToSchedule = await sql`
                SELECT id FROM campaign_contacts
                WHERE campaign_id = ${id} AND status = 'pending' AND current_step_number = 0
            `;
             console.log(`[API] Found ${contactsToSchedule.length} pending contacts to schedule for campaign ${id}.`);

            // 3. Schedule the *first* step for each pending contact
            let scheduledCount = 0;
            let totalDelay = 0
            for (const contact of contactsToSchedule) {
                try {
                    // Add a random delay between 1-30 seconds for each contact
                    totalDelay += Math.floor(Math.random() * 30) + 10;
                    await scheduleNextStep(contact.id, sql, totalDelay); // Pass random delay in seconds
                    scheduledCount++;
                } catch (error) {
                    console.error(`[API] Error scheduling initial step for contact ${contact.id} in campaign ${id}:`, error);
                    // Decide how to handle partial failures - rollback? Log and continue? Mark contact as failed?
                    // Let's log and continue for now.
                    await sql`UPDATE campaign_contacts SET status='failed', last_error='Initial scheduling failed' WHERE id = ${contact.id}`;
                }
            }
            return { started: true, scheduledCount };
        });

        console.log(`[API] Campaign ${id} started. Initial steps scheduled for ${result.scheduledCount} contacts.`);
        return { success: true, message: `Campaign started. Scheduled initial emails for ${result.scheduledCount} contacts.` };
    }, { params: t.Object({ id: t.String({ format: 'uuid' }) }) })

    .post('/api/campaigns/:id/pause', async ({ db, scheduledJobs, params, set }) => {
        const { id } = params;
         console.log(`[API] Received request to pause campaign: ${id}`);
         // Use transaction
         const result = await db.begin(async sql => {
             // 1. Update Campaign Status
             const campaignUpdate = await sql`
                 UPDATE campaigns SET status = 'paused', updated_at = NOW()
                 WHERE id = ${id} AND status = 'active' -- Only pause if active
                 RETURNING id
             `;
             if (campaignUpdate.length === 0) {
                  const current = await sql`SELECT status FROM campaigns WHERE id = ${id}`;
                  if (current.length === 0) throw new NotFoundError('Campaign not found');
                  throw new Error(`Campaign cannot be paused (current status: ${current[0].status})`);
             }
              console.log(`[API] Campaign ${id} status set to paused.`);

             // 2. Find 'active' contacts associated with this campaign that have scheduled jobs
             const contactsToPause = await sql`
                 SELECT id, scheduled_job_id FROM campaign_contacts
                 WHERE campaign_id = ${id} AND status = 'active' AND scheduled_job_id IS NOT NULL
             `;
              console.log(`[API] Found ${contactsToPause.length} active contacts with scheduled jobs to cancel for campaign ${id}.`);

             // 3. Cancel scheduled jobs and update contact status
             let cancelledCount = 0;
             for (const contact of contactsToPause) {
                 const job = scheduledJobs.get(contact.id); // Use contact.id as the key
                 if (job) {
                     job.cancel();
                     scheduledJobs.delete(contact.id); // Remove from map
                     cancelledCount++;
                      console.log(`[API] Canceled job ${contact.scheduled_job_id} for contact ${contact.id}`);
                 } else if (contact.scheduled_job_id) {
                      console.warn(`[API] Job ${contact.scheduled_job_id} for contact ${contact.id} not found in memory map, but present in DB. Maybe missed during restart?`);
                 }
                 // Update DB regardless of whether job was found in memory map
                 await sql`
                     UPDATE campaign_contacts
                     SET status = 'paused', -- Set contact status to paused too
                         scheduled_job_id = NULL -- Clear job id
                     WHERE id = ${contact.id} AND status = 'active'
                 `;
             }
             return { paused: true, cancelledCount };
         });

         console.log(`[API] Campaign ${id} paused. Cancelled ${result.cancelledCount} scheduled jobs.`);
         return { success: true, message: `Campaign paused. Cancelled ${result.cancelledCount} pending emails.` };
    }, { params: t.Object({ id: t.String({ format: 'uuid' }) }) })
    // TODO: Add POST /api/campaigns/:id/resume (similar logic to start, but finding 'paused' contacts)


    .onStart(async ({}) => {
        console.log("🚀 Server started!");
        // Reschedule jobs on startup AFTER the server is listening
        await reschedulePendingJobs(sql);
   })
   .onStop(() => {
       console.log("🛑 Server stopping...");
       // Gracefully shutdown scheduler?
       schedule.gracefulShutdown().then(() => console.log("Scheduler shut down."));
        // Close DB connection
        sql.end({ timeout: 5 }).then(() => console.log("Database connection closed."));
   })
    // --- Listener Setup ---
    .listen(process.env.PORT || 8080)


console.log(
    `🦊 Backend server running at http://${app.server?.hostname}:${app.server?.port}`
);

// --- Old /api/send-emails endpoint (Keep for reference or remove) ---
// This endpoint is now superseded by the campaign/scheduling system.
// It might be useful for a "Send Test Email" feature later.
/*
.post("/api/send-emails", ...)
*/