import type { EmailRecord } from '../types';

type EmailTableProps = { emails: EmailRecord[]; kind: 'scheduled' | 'sent'; loading: boolean };

const dateFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

export function EmailTable({ emails, kind, loading }: EmailTableProps) {
  if (loading) return <div className="inbox-state"><span className="spinner" /> Loading your {kind} emails…</div>;
  if (!emails.length) return <div className="inbox-state empty-state"><span className="empty-icon">{kind === 'scheduled' ? '◷' : '➤'}</span><strong>{kind === 'scheduled' ? 'Nothing scheduled yet' : 'No emails sent yet'}</strong><span>{kind === 'scheduled' ? 'Your upcoming emails will show up here.' : 'Sent and failed emails will appear here.'}</span></div>;

  return <div className="message-list" role="list" aria-label={`${kind} emails`}>
    {emails.map((email) => {
      const date = new Date(kind === 'scheduled' ? email.scheduledAt : email.updatedAt);
      const snippet = (email.textBody ?? '').replace(/\s+/g, ' ').trim();
      return <article className="message-row" key={email.id} role="listitem">
        <div className="message-recipient">To: {email.recipient}</div>
        <span className={`message-status status-${email.status}`}>{kind === 'scheduled' ? <><span aria-hidden="true">◷</span> {dateFormatter.format(date)}</> : email.status}</span>
        <div className="message-summary"><strong>{email.subject || '(no subject)'}</strong><span> — {snippet || 'No message preview'}</span></div>
      </article>;
    })}
  </div>;
}
