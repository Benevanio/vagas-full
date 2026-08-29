import { useEffect, useState } from "react";
import {
  type ApplicationNote,
  createDashboardApplicationNote,
  deleteDashboardApplicationNote,
  getDashboardApplicationNotes,
  updateDashboardApplicationNote,
} from "../../infrastructure/dashboardJobsApi";

export function ApplicationNotesSection({ savedJobId }: { savedJobId: string }) {
  const [notes, setNotes] = useState<ApplicationNote[]>([]);
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState<ApplicationNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void getDashboardApplicationNotes(savedJobId)
      .then((items) => active && setNotes(items))
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [savedJobId]);

  async function save() {
    const value = content.trim();
    if (!value) return;
    try {
      if (editing) {
        const updated = await updateDashboardApplicationNote(savedJobId, editing.id, value);
        setNotes((items) => items.map((item) => item.id === updated.id ? updated : item));
      } else {
        const created = await createDashboardApplicationNote(savedJobId, value);
        setNotes((items) => [...items, created]);
      }
      setContent("");
      setEditing(null);
    } catch { setError(true); }
  }

  async function remove(noteId: string) {
    try {
      await deleteDashboardApplicationNote(savedJobId, noteId);
      setNotes((items) => items.filter((item) => item.id !== noteId));
    } catch { setError(true); }
  }

  return <section className="space-y-3" aria-labelledby="notes-title">
    <h3 id="notes-title" className="text-xs font-bold uppercase text-muted-foreground">Notas privadas</h3>
    {loading ? <p className="text-sm text-muted-foreground">Carregando notas...</p> : null}
    {error ? <p className="text-sm text-destructive">Não foi possível atualizar as notas.</p> : null}
    {!loading && notes.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma nota adicionada.</p> : null}
    {notes.map((note) => <article key={note.id} className="rounded-md border border-border bg-background p-3">
      <p className="whitespace-pre-wrap text-sm">{note.content}</p>
      <div className="mt-2 flex gap-3 text-xs font-semibold">
        <button type="button" onClick={() => { setEditing(note); setContent(note.content); }}>Editar</button>
        <button type="button" onClick={() => void remove(note.id)}>Remover</button>
      </div>
    </article>)}
    <textarea aria-label="Nova nota" value={content} onChange={(event) => setContent(event.target.value)} className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm" />
    <div className="flex gap-2"><button type="button" onClick={() => void save()} className="rounded-md bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">{editing ? "Salvar nota" : "Adicionar nota"}</button>{editing ? <button type="button" onClick={() => { setEditing(null); setContent(""); }}>Cancelar</button> : null}</div>
  </section>;
}
