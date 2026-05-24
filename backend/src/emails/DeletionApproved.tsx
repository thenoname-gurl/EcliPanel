import { BaseEmail } from './BaseEmail';
import { Button, Section } from '@react-email/components';

interface DeletionApprovedProps {
  title: string;
  message: string;
  action_url: string;
  action_text: string;
  details: string;
  t?: (key: string, vars?: Record<string, string | number>) => string;
}

const headingStyle = {
  color: '#fff',
  fontSize: '30px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  margin: '0',
  letterSpacing: '-0.5px',
};

const pStyle = {
  color: '#ffffffb3',
  fontSize: '16px',
  margin: '0 0 16px 0',
  lineHeight: '1.7',
};

const btnStyle = {
  display: 'inline-block',
  padding: '14px 28px',
  color: '#fff',
  fontFamily: '"Courier New", monospace',
  fontSize: '24px',
  fontWeight: 'bold',
  backgroundColor: '#0d0d0d',
  textDecoration: 'none',
  textAlign: 'center' as const,
};

const detailsStyle = {
  fontFamily: '"Courier New", monospace',
  fontSize: '13px',
  color: '#fff',
  backgroundColor: '#161616',
  padding: '20px',
  margin: '20px 0',
  whiteSpace: 'pre-wrap' as const,
  wordWrap: 'break-word' as const,
  overflowX: 'auto',
};

export function DeletionApproved({ title, message, action_url, action_text, details, t }: DeletionApprovedProps) {
  return (
    <BaseEmail previewText={title} t={t}>
      <Section style={{ marginBottom: '32px', paddingBottom: '24px' }}>
        <h1 style={headingStyle}>{title}</h1>
      </Section>

      <Section style={{ marginBottom: '24px' }}>
        <p style={pStyle}>{message}</p>
      </Section>

      <Section style={{ textAlign: 'center', margin: '24px 0' }}>
        <Button href={action_url} style={btnStyle}>{action_text}</Button>
      </Section>

      <Section style={detailsStyle}>
        {details}
      </Section>
    </BaseEmail>
  );
}
