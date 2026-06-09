import { BaseEmail } from './BaseEmail';
import { Section } from '@react-email/components';

interface AccountSuspendedProps {
  title: string;
  message: string;
  reason?: string;
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

const alertStyle = {
  backgroundColor: '#2d1f1f',
  border: '1px solid #dc2626',
  color: '#fca5a5',
  padding: '20px',
  margin: '16px 0',
};

const reasonStyle = {
  color: '#ffffffb3',
  fontSize: '14px',
  padding: '12px 0 0 0',
  margin: '0',
  lineHeight: '1.7',
};

export function AccountSuspended({ title, message, reason, t }: AccountSuspendedProps) {
  return (
    <BaseEmail previewText={title} t={t}>
      <Section style={{ marginBottom: '32px', paddingBottom: '24px' }}>
        <h1 style={headingStyle}>{title}</h1>
      </Section>

      <Section style={alertStyle}>
        <p style={{ ...pStyle, margin: 0, color: '#fca5a5' }}>{message}</p>
      </Section>

      {reason && (
        <Section style={{ marginBottom: '24px' }}>
          <p style={pStyle}>Reason:</p>
          <p style={reasonStyle}>{reason}</p>
        </Section>
      )}

      <Section style={{ marginBottom: '24px' }}>
        <p style={pStyle}>
          If you believe this was a mistake, please contact our support team for assistance.
        </p>
      </Section>
    </BaseEmail>
  );
}