import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { useCallback, useEffect } from 'react';
import {
  Bold,
  Italic,
  Strikethrough,
  Highlighter,
  ImagePlus,
  Undo2,
  Redo2,
} from 'lucide-react';
import { isStorageImageUploadsEnabled } from '@/lib/featureFlags';
import { uploadCardImage, type CardImageStorageContext } from '@/lib/storageImages';
import { compressImage, cn } from '@/lib/utils';

interface TipTapEditorProps {
  content: string;
  onUpdate: (html: string) => void;
  placeholder?: string;
  className?: string;
  imageUploadContext?: CardImageStorageContext;
}

export function TipTapEditor({
  content,
  onUpdate,
  placeholder = 'Type here...',
  className,
  imageUploadContext,
}: TipTapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({}),
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      Highlight,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    onUpdate: ({ editor: e }) => {
      onUpdate(e.getHTML());
    },
    editorProps: {
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of items) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) {
              void handleImageInsert(file, view);
            }
            return true;
          }
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;

        const file = files[0];
        if (file.type.startsWith('image/')) {
          event.preventDefault();
          void handleImageInsert(file, view);
          return true;
        }
        return false;
      },
    },
  });

  const handleImageInsert = useCallback(
    async (file: File | Blob, view?: unknown) => {
      try {
        let imageSrc: string;

        if (imageUploadContext && isStorageImageUploadsEnabled()) {
          try {
            imageSrc = await uploadCardImage(file, imageUploadContext);
          } catch {
            imageSrc = await compressImage(file);
          }
        } else {
          imageSrc = await compressImage(file);
        }

        if (editor) {
          editor.chain().focus().setImage({ src: imageSrc }).run();
        }
      } catch {
        // silently fail image insert
      }
      void view; // unused but required by handler signature
    },
    [editor, imageUploadContext],
  );

  const handleImageUpload = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        void handleImageInsert(file);
      }
    };
    input.click();
  }, [handleImageInsert]);

  // Sync content if it changes externally
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    // Only run when content prop changes, not on every editor update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  if (!editor) return null;

  return (
    <div className={cn('relative', className)}>
      <BubbleMenu
        editor={editor}
        className="flex items-center gap-0.5 rounded-lg p-1"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Bold"
        >
          <Bold size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Italic"
        >
          <Italic size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          title="Strikethrough"
        >
          <Strikethrough size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          active={editor.isActive('highlight')}
          title="Highlight"
        >
          <Highlighter size={16} />
        </ToolbarButton>
        <div
          className="w-px h-5 mx-1"
          style={{ background: 'var(--color-border)' }}
        />
        <ToolbarButton onClick={handleImageUpload} title="Insert image">
          <ImagePlus size={16} />
        </ToolbarButton>
        <div
          className="w-px h-5 mx-1"
          style={{ background: 'var(--color-border)' }}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo"
        >
          <Undo2 size={16} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo"
        >
          <Redo2 size={16} />
        </ToolbarButton>
      </BubbleMenu>

      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none min-h-[60px] p-3 focus-within:outline-none editor-content"
        style={{
          color: 'var(--color-text)',
          fontFamily: 'var(--font-sans)',
        }}
      />
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  active,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'flex items-center justify-center w-7 h-7 rounded cursor-pointer transition-colors',
        disabled && 'opacity-30 pointer-events-none',
      )}
      style={{
        background: active ? 'var(--color-muted)' : 'transparent',
        color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
        border: 'none',
      }}
    >
      {children}
    </button>
  );
}
