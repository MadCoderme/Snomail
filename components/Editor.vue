<script setup lang="ts">
import { watch } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { Bold, Italic, Strikethrough, UnderlineIcon, Code, List, ListOrdered, Quote, Undo, Redo, Minus, Heading1, Heading2, Heading3 } from 'lucide-vue-next'

// --- Props ---
const props = defineProps({
    activeButtons: {
        type: Array,
        validator: function (list : string[]) {
            for (let el of list) {
                if (
                    [
                        'bold', 'italic', 'strike', 'underline', 'code',
                        'h1', 'h2', 'h3', 'bulletList', 'orderedList',
                        'blockquote', 'codeBlock', 'horizontalRule',
                        'undo', 'redo',
                    ].indexOf(el) === -1
                ) {
                    return false
                }
            }
            return true
        },
        default: () => [
            'bold', 'italic', 'strike', 'underline', 'code',
            'h1', 'h2', 'h3', 'bulletList', 'orderedList',
            'blockquote', 'codeBlock', 'horizontalRule',
            'undo', 'redo',
        ],
    },
})

// --- Emits ---
const emit = defineEmits(['update']);

// --- State ---
const editor = useEditor({
    // Use props directly
    extensions: [StarterKit.configure({
        bulletList: {
            HTMLAttributes: {
                class: 'list-disc pl-4'
            }
        },
        orderedList: {
            HTMLAttributes: {
                class: 'list-decimal pl-4'
            }
        },
    }), Underline],
    // Use the onUpdate callback for cleaner event handling
    onUpdate: () => {
        // Ensure editor exists before accessing methods
        if (!editor.value) {
            return;
        }
        const currentHtml = editor.value.getHTML()
        emit('update', currentHtml)
    },
});

</script>
<template>
    <div class="editor">
        <!-- Check if editor is initialized before rendering menubar -->
        <div class="menubar" v-if="editor">
            <!-- Use props.activeButtons in the template -->
            <span v-for="actionName in props.activeButtons" :key="actionName">
                <!-- Buttons remain largely the same, accessing the 'editor' ref directly -->
                <button v-if="actionName === 'bold'" class="menubar__button"
                    :class="{ 'is-active': editor.isActive('bold') }"
                    @click="editor.chain().focus().toggleBold().run()">
                    <Bold />
                </button>
                <button v-if="actionName === 'italic'" class="menubar__button"
                    :class="{ 'is-active': editor.isActive('italic') }"
                    @click="editor.chain().focus().toggleItalic().run()">
                    <Italic />
                </button>

                <button v-if="actionName === 'strike'" class="menubar__button"
                    :class="{ 'is-active': editor.isActive('strike') }"
                    @click="editor.chain().focus().toggleStrike().run()">
                    <Strikethrough />
                </button>

                <button v-if="actionName === 'underline'" class="menubar__button"
                    :class="{ 'is-active': editor.isActive('underline') }"
                    @click="editor.chain().focus().toggleUnderline().run()">
                    <UnderlineIcon />
                </button>

                <button v-if="actionName === 'code'" class="menubar__button"
                    :class="{ 'is-active': editor.isActive('code') }"
                    @click="editor.chain().focus().toggleCode().run()">
                    <Code />
                </button>

                <button v-if="actionName === 'h1'" class="menubar__button"
                    :class="{ 'is-active': editor.isActive('heading', { level: 1 }) }"
                    @click="editor.chain().focus().toggleHeading({ level: 1 }).run()">
                    <Heading1 />
                </button>

                <button v-if="actionName === 'h2'" class="menubar__button"
                    :class="{ 'is-active': editor.isActive('heading', { level: 2 }) }"
                    @click="editor.chain().focus().toggleHeading({ level: 2 }).run()">
                    <Heading2 />
                </button>

                <button v-if="actionName === 'h3'" class="menubar__button"
                    :class="{ 'is-active': editor.isActive('heading', { level: 3 }) }"
                    @click="editor.chain().focus().toggleHeading({ level: 3 }).run()">
                    <Heading3 />
                </button>

                <button v-if="actionName === 'bulletList'" class="menubar__button"
                    :class="{ 'is-active': editor.isActive('bulletList') }"
                    @click="editor.chain().focus().toggleBulletList().run()">
                    <List />
                </button>

                <button v-if="actionName === 'orderedList'" class="menubar__button"
                    :class="{ 'is-active': editor.isActive('orderedList') }"
                    @click="editor.chain().focus().toggleOrderedList().run()">
                    <ListOrdered />
                </button>

                <button v-if="actionName === 'blockquote'" class="menubar__button"
                    :class="{ 'is-active': editor.isActive('blockquote') }"
                    @click="editor.chain().focus().toggleBlockquote().run()">
                    <Quote />
                </button>

                <button v-if="actionName === 'codeBlock'" class="menubar__button"
                    :class="{ 'is-active': editor.isActive('codeBlock') }"
                    @click="editor.chain().focus().toggleCodeBlock().run()">
                    <Code />
                </button>

                <button v-if="actionName === 'horizontalRule'" class="menubar__button"
                    @click="editor.chain().focus().setHorizontalRule().run()">
                    <Minus />
                </button>

                <button v-if="actionName === 'undo'" class="menubar__button"
                    @click="editor.chain().focus().undo().run()">
                    <Undo />
                </button>

                <button v-if="actionName === 'redo'" class="menubar__button"
                    @click="editor.chain().focus().redo().run()">
                    <Redo />
                </button>
            </span>
        </div>

        <!-- EditorContent remains the same -->
        <editor-content class="editor__content" :editor="editor" />
    </div>
</template>


<style lang="css" scoped>
.menubar {
    margin-bottom: 1rem;
}

.menubar__button {
    font-weight: bold;
    border: 1px solid #ccc;
    padding: 0.3rem 0.6rem;
    margin-right: 0.3rem;
    cursor: pointer;
    border-radius: 3px;
}

.menubar__button.is-active {
    background-color: #333;
    color: #fff;
}

.editor__content :deep(.ProseMirror) {
    /* Use :deep() for targeting TipTap classes */
    border: 1px solid #ccc;
    padding: 1rem;
    min-height: 150px;
}

.editor__content :deep(.ProseMirror:focus) {
    outline: none;
    border-color: #66afe9;
    box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.075), 0 0 8px rgba(102, 175, 233, 0.6);
}
</style>