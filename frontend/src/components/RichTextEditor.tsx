import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Undo2,
  Redo2,
} from 'lucide-react'
import { useRef, useState } from 'react'

export default function RichTextEditor({
  content,
  onChange,
  onUploadImage,
}: {
  content: string
  onChange: (html: string) => void
  onUploadImage: (file: File) => Promise<string>
}) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'prose-email min-h-[260px] max-w-none p-3 text-sm text-foreground focus:outline-none',
      },
    },
  })

  if (!editor) return null

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await onUploadImage(file)
      editor!.chain().focus().setImage({ src: url }).run()
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function addLink() {
    const url = window.prompt('Link URL')
    if (url) editor!.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  function addTable() {
    editor!.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }

  return (
    <div className="overflow-hidden rounded-lg border border-navy-600">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-navy-700 bg-navy-800 px-2 py-1.5">
        <ToolBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolBtn>
        <Divider />
        <ToolBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </ToolBtn>
        <Divider />
        <ToolBtn active={editor.isActive('link')} onClick={addLink}>
          <LinkIcon className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn onClick={() => fileRef.current?.click()} disabled={uploading}>
          <ImageIcon className="h-4 w-4" />
        </ToolBtn>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={onPickImage} />
        <ToolBtn onClick={addTable}>
          <TableIcon className="h-4 w-4" />
        </ToolBtn>
        <Divider />
        <ToolBtn onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 className="h-4 w-4" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 className="h-4 w-4" />
        </ToolBtn>
        {uploading && <span className="ml-2 text-xs text-muted-foreground">Uploading…</span>}
      </div>
      <div className="max-h-[420px] overflow-y-auto bg-navy-900">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-navy-700" />
}

function ToolBtn({
  children,
  onClick,
  active,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`grid h-7 w-7 place-items-center rounded transition-colors disabled:opacity-40 ${
        active ? 'bg-cyber-blue/15 text-cyber-blue' : 'text-muted-foreground hover:bg-navy-700 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}
