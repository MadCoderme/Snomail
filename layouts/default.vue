<script setup lang="ts">
import { Button } from '@/components/ui/button'
</script>

<template>
    <div>
        <header class="border-b">
            <nav class="container mx-auto p-4">
                <div class="flex gap-4">
                    <NuxtLink to="/">
                        <Button variant="ghost">Campaigns</Button>
                    </NuxtLink>
                    <NuxtLink to="/sequences">
                        <Button variant="ghost">Sequences</Button>
                    </NuxtLink>
                </div>
            </nav>
        </header>

        <main>
            <NuxtPage />
        </main>
    </div>
</template>