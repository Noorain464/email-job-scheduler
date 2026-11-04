import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react';
import { getSenders } from '../api';
import type { EmailSender, ScheduleEmailInput } from '../types';

type ComposeModalProps = {
  busy: boolean;
  onClose: () => void;
  onSchedule: (emails: ScheduleEmailInput[]) => Promise<void>;
};

function localDateTime(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function defaultStartTime(): string {
  return localDateTime(new Date(Date.now() + 5 * 60_000));
}

const addressPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function ComposeModal({ busy, onClose, onSchedule }: ComposeModalProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const bodyEditor = useRef<HTMLDivElement>(null);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState('');
  const [fileName, setFileName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [senderId, setSenderId] = useState(import.meta.env.VITE_DEFAULT_SENDER_ID ?? 'sender-1');
  const [senders, setSenders] = useState<EmailSender[]>([]);
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [delaySeconds, setDelaySeconds] = useState(2);
  const [hourlyLimit, setHourlyLimit] = useState(200);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void getSenders().then((result) => {
      if (!active) return;
      setSenders(result);
      if (result.length && !result.some((sender) => sender.id === senderId)) setSenderId(result[0].id);
    }).catch(() => {
      // Keep the sender ID editable if sender discovery is unavailable.
    });
    return () => { active = false; };
  }, [senderId]);

  function addRecipients(values: string[]) {
    const valid = values.flatMap((value) => value.match(addressPattern) ?? []);
    if (valid.length) setRecipients((current) => [...new Set([...current, ...valid.map((address) => address.toLowerCase())])]);
    return valid.length;
  }

  function commitRecipientInput() {
    addRecipients([recipientInput]);
    setRecipientInput('');
  }

  function handleRecipientKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commitRecipientInput();
    }
    if (event.key === 'Backspace' && !recipientInput && recipients.length) {
      setRecipients((current) => current.slice(0, -1));
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Choose a file smaller than 5 MB.');
      return;
    }
    const contents = await file.text();
    const added = addRecipients([contents]);
    setFileName(file.name);
    setError(added ? '' : 'No email addresses were found in that file.');
    event.target.value = '';
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    commitRecipientInput();
    setError('');
    const allRecipients = [...new Set([...recipients, ...(recipientInput.match(addressPattern) ?? []).map((address) => address.toLowerCase())])];
    if (!allRecipients.length) return setError('Enter an email address or upload a CSV/text lead list.');
    const start = new Date(startTime);
    if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now()) return setError('Choose a start time in the future.');
    if (!Number.isInteger(delaySeconds) || delaySeconds < 1) return setError('Delay must be at least 1 second.');
    if (!Number.isInteger(hourlyLimit) || hourlyLimit < 1) return setError('Hourly limit must be at least 1.');
    if (!body.trim()) return setError('Write a message before scheduling.');

    const plannedEmails = allRecipients.map((to, index) => {
      const hourBlock = Math.floor(index / hourlyLimit);
      const withinBlock = index % hourlyLimit;
      const at = start.getTime() + hourBlock * 60 * 60 * 1000 + withinBlock * delaySeconds * 1000;
      return { senderId, to, subject: subject.trim(), text: body, html: bodyHtml, scheduledAt: new Date(at).toISOString() };
    });
    await onSchedule(plannedEmails);
  }

  function chooseTomorrow(hour?: number) {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(hour ?? 9, 0, 0, 0);
    setStartTime(localDateTime(date));
  }

  function formatBody(command: string, value?: string) {
    bodyEditor.current?.focus();
    document.execCommand(command, false, value);
    if (bodyEditor.current) {
      setBody(bodyEditor.current.innerText);
      setBodyHtml(bodyEditor.current.innerHTML);
    }
  }

  function formatButton(label: string, command: string, display: string, value?: string) {
    return <button type="button" className="format-control" aria-label={label} title={label} onMouseDown={(event) => event.preventDefault()} onClick={() => formatBody(command, value)}>{display}</button>;
  }

  return (
    <div className="compose-screen">
      <header className="compose-topbar">
        <button className="compose-back" type="button" onClick={onClose} disabled={busy} aria-label="Back to emails">←</button>
        <h1>Compose New Email</h1>
        <div className="compose-top-actions">
          <button className="compose-tool-icon" type="button" onClick={() => fileInput.current?.click()} aria-label="Upload recipient list" title="Upload recipient list">♧</button>
          <button className={`compose-tool-icon ${scheduleOpen ? 'selected' : ''}`} type="button" onClick={() => setScheduleOpen((open) => !open)} aria-label="Choose send time" title="Choose send time">◷</button>
          <button className="compose-send" type="submit" form="compose-form" disabled={busy}>{busy ? 'Scheduling…' : 'Send Later'}</button>
        </div>
        {scheduleOpen && <aside className="compose-schedule-card" aria-label="Schedule send time">
          <strong>Send Later</strong>
          <label className="schedule-date-field"><input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} aria-label="Pick date and time" /><span>▦</span></label>
          <div className="schedule-suggestions">
            <button type="button" onClick={() => chooseTomorrow()}>Tomorrow</button>
            <button type="button" onClick={() => chooseTomorrow(10)}>Tomorrow, 10:00 AM</button>
            <button type="button" onClick={() => chooseTomorrow(11)}>Tomorrow, 11:00 AM</button>
            <button type="button" onClick={() => chooseTomorrow(15)}>Tomorrow, 3:00 PM</button>
          </div>
          <footer><button type="button" className="schedule-cancel" onClick={() => setScheduleOpen(false)}>Cancel</button><button type="button" className="compose-send" onClick={() => setScheduleOpen(false)}>Done</button></footer>
        </aside>}
      </header>

      <form id="compose-form" className="compose-editor" onSubmit={(event) => void handleSubmit(event)}>
        <div className="compose-fields">
          <label className="compose-field-row"><span>From</span>{senders.length ? <select className="sender-value" value={senderId} onChange={(event) => setSenderId(event.target.value)} aria-label="Email sender">{senders.map((sender) => <option key={sender.id} value={sender.id}>{sender.from}</option>)}</select> : <input className="sender-value" value={senderId} onChange={(event) => setSenderId(event.target.value)} required aria-label="Sender ID" />}</label>
          <div className="compose-field-row recipient-field"><label htmlFor="recipient-input">To</label><div className="recipient-line">
            {recipients.slice(0, 3).map((recipient) => <span className="recipient-chip" key={recipient}>{recipient}<button type="button" onClick={() => setRecipients((current) => current.filter((item) => item !== recipient))} aria-label={`Remove ${recipient}`}>×</button></span>)}
            {recipients.length > 3 && <span className="recipient-chip recipient-more">+{recipients.length - 3}</span>}
            <input id="recipient-input" value={recipientInput} onChange={(event) => setRecipientInput(event.target.value)} onKeyDown={handleRecipientKeyDown} onBlur={commitRecipientInput} placeholder="recipient@example.com" aria-label="Recipient email address" />
            <button className="upload-list-button" type="button" onClick={() => fileInput.current?.click()}>⇧ <span>Upload List</span></button>
          </div></div>
          <label className="compose-field-row"><span>Subject</span><input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" required /></label>
          <div className="compose-settings-row">
            <label>Delay between 2 emails <input type="number" min="1" value={delaySeconds} onChange={(event) => setDelaySeconds(Number(event.target.value))} aria-label="Delay between emails in seconds" /></label>
            <label>Hourly Limit <input type="number" min="1" value={hourlyLimit} onChange={(event) => setHourlyLimit(Number(event.target.value))} aria-label="Hourly email limit" /></label>
            {recipients.length > 0 && <span className="recipient-total">{recipients.length} recipients</span>}
          </div>
        </div>

        <input ref={fileInput} className="visually-hidden" type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => void handleFile(event)} />
        {fileName && <p className="lead-file-note">{fileName} · {recipients.length} email addresses detected</p>}
        <section className="compose-body">
          <div ref={bodyEditor} className="compose-rich-editor" contentEditable role="textbox" aria-label="Email body" aria-multiline="true" data-placeholder="Type Your Reply..." onInput={() => { setBody(bodyEditor.current?.innerText ?? ''); setBodyHtml(bodyEditor.current?.innerHTML ?? ''); }} />
          <div className="editor-toolbar">
            {formatButton('Undo', 'undo', '↶')}{formatButton('Redo', 'redo', '↷')}<i />
            {formatButton('Bold', 'bold', 'B')}{formatButton('Italic', 'italic', 'I')}{formatButton('Underline', 'underline', 'U')}<i />
            {formatButton('Align left', 'justifyLeft', '☰')}{formatButton('Numbered list', 'insertOrderedList', '1. ≡')}{formatButton('Bulleted list', 'insertUnorderedList', '• ≡')}<i />
            {formatButton('Indent', 'indent', '⇥')}{formatButton('Outdent', 'outdent', '⇤')}{formatButton('Quote', 'formatBlock', '❝', 'blockquote')}{formatButton('Strikethrough', 'strikeThrough', 'S̶')}
          </div>
        </section>
        {error && <p className="compose-error" role="alert">{error}</p>}
      </form>
    </div>
  );
}
