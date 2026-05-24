import { BaseEmail } from './BaseEmail';
import { Section } from '@react-email/components';

interface DeletionDeletedProps {
  title: string;
  message: string;
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

export function DeletionDeleted({ title, message, details, t }: DeletionDeletedProps) {
  return (
    <BaseEmail previewText={title} t={t}>
      <Section style={{ marginBottom: '32px', paddingBottom: '24px' }}>
        <h1 style={headingStyle}>{title}</h1>
      </Section>

      <Section style={{ marginBottom: '24px' }}>
        <p style={pStyle}>{message}</p>
      </Section>

      <Section style={detailsStyle}>
        {details}
      </Section>
    </BaseEmail>
  );
}
