"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

export type IntakeQuestion = {
  id?: string;
  system_key?: string | null;
  label: string;
  placeholder: string;
  input_type: "text" | "textarea" | "yes_no";
  applies_to: "both" | "consultation" | "treatment";
  required: boolean;
  active: boolean;
  sort_order?: number;
};

type Scope = "consultation" | "treatment";
const protectedKeys = new Set(["chief_concern", "allergies", "current_medications", "medical_history"]);

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Your session expired. Please sign in again.");
  return { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` };
}

export default function IntakeQuestionsManager() {
  const [questions, setQuestions] = useState<IntakeQuestion[]>([]);
  const [scope, setScope] = useState<Scope>("consultation");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dragged, setDragged] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    authHeaders().then(headers => fetch("/api/intake-questions?manage=1", { headers }))
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; })
      .then(result => { if (active) setQuestions(result.questions || []); })
      .catch(value => { if (active) setError(value instanceof Error ? value.message : "Unable to load intake questions."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => questions.map((question, index) => ({ question, index }))
    .filter(({ question }) => question.applies_to === scope || question.applies_to === "both"), [questions, scope]);

  function update(index: number, patch: Partial<IntakeQuestion>) {
    setQuestions(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
    setMessage("");
  }

  function move(from: number, to: number) {
    if (from === to) return;
    setQuestions(items => { const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; });
  }

  function addQuestion() {
    setQuestions(items => [...items, { label: "New question", placeholder: "", input_type: "text", applies_to: scope, required: false, active: true }]);
    setMessage("");
  }

  function removeQuestion(index: number) {
    setQuestions(items => items.filter((_, itemIndex) => itemIndex !== index));
    setMessage("");
  }

  async function save() {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/intake-questions", { method: "PUT", headers: await authHeaders(), body: JSON.stringify({ questions }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save intake questions.");
      setQuestions(result.questions || []);
      setMessage("Intake questions saved. The booking form is now updated.");
    } catch (value) { setError(value instanceof Error ? value.message : "Unable to save intake questions."); }
    finally { setSaving(false); }
  }

  return <section className="intake-manager">
    <header>
      <div><p>BOOKING FORM</p><h2>Intake questions</h2><span>Edit the questions patients answer before their appointment.</span></div>
      <button type="button" onClick={addQuestion}><i className="fa-solid fa-plus" /> Add question</button>
    </header>

    <div className="intake-scope-tabs" role="tablist" aria-label="Intake question type">
      <button type="button" role="tab" aria-selected={scope === "consultation"} className={scope === "consultation" ? "active" : ""} onClick={() => setScope("consultation")}><i className="fa-regular fa-comments" /> Consultation</button>
      <button type="button" role="tab" aria-selected={scope === "treatment"} className={scope === "treatment" ? "active" : ""} onClick={() => setScope("treatment")}><i className="fa-solid fa-notes-medical" /> Medical treatment</button>
    </div>

    <p className="intake-scope-help">{scope === "consultation" ? "Questions for consultation bookings and shared patient details." : "Questions needed before a procedure or medical treatment."} Shared questions appear in both tabs.</p>
    {loading && <p>Loading intake questions…</p>}
    {error && <p className="intake-message error">{error}</p>}
    {message && <p className="intake-message success">{message}</p>}

    {!loading && <div className="intake-question-list">
      {visible.map(({ question, index }, position) => {
        const protectedQuestion = protectedKeys.has(question.system_key || "");
        return <article key={question.id || `new-${index}`} draggable onDragStart={() => setDragged(index)} onDragEnd={() => setDragged(null)} onDragOver={event => event.preventDefault()} onDrop={() => { if (dragged !== null) move(dragged, index); setDragged(null); }} className={dragged === index ? "dragging" : ""}>
          <div className="intake-drag"><i className="fa-solid fa-grip-vertical" /><span>{position + 1}</span><strong>Drag to reorder</strong></div>
          <div className="intake-fields">
            <label className="wide">Question<input value={question.label} onChange={event => update(index, { label: event.target.value })} /></label>
            <label className="wide">Placeholder / help text<input value={question.placeholder} onChange={event => update(index, { placeholder: event.target.value })} /></label>
            <label>Answer type<select value={question.input_type} onChange={event => update(index, { input_type: event.target.value as IntakeQuestion["input_type"] })}><option value="text">Short answer</option><option value="textarea">Long answer</option><option value="yes_no">Yes / No</option></select></label>
            <label>Show for<select value={question.applies_to} disabled={Boolean(question.system_key)} onChange={event => update(index, { applies_to: event.target.value as IntakeQuestion["applies_to"] })}><option value="consultation">Consultation only</option><option value="treatment">Medical treatment only</option><option value="both">Both (shared)</option></select></label>
            <label className="intake-check"><input type="checkbox" checked={question.required} disabled={protectedQuestion} onChange={event => update(index, { required: event.target.checked })} /> Required</label>
            <label className="intake-check"><input type="checkbox" checked={question.active} disabled={protectedQuestion} onChange={event => update(index, { active: event.target.checked })} /> Active</label>
          </div>
          <div className="intake-actions">
            <button type="button" disabled={position === 0} onClick={() => move(index, visible[position - 1].index)} aria-label="Move question up"><i className="fa-solid fa-arrow-up" /></button>
            <button type="button" disabled={position === visible.length - 1} onClick={() => move(index, visible[position + 1].index)} aria-label="Move question down"><i className="fa-solid fa-arrow-down" /></button>
            {!question.system_key && <button type="button" className="remove" onClick={() => removeQuestion(index)} aria-label="Remove question"><i className="fa-regular fa-trash-can" /></button>}
          </div>
          {question.system_key && <small className="intake-protected"><i className="fa-solid fa-lock" /> Core booking question. It can be renamed, but cannot be removed or disabled.</small>}
        </article>;
      })}
      {!visible.length && <p>No questions in this tab yet. Select “Add question” to create one.</p>}
    </div>}

    <footer><span>Changes apply to new bookings after you save.</span><button type="button" onClick={save} disabled={saving || loading}><i className="fa-regular fa-floppy-disk" /> {saving ? "Saving…" : "Save questions"}</button></footer>
  </section>;
}
