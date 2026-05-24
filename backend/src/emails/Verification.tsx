import { BaseEmail } from './BaseEmail';
import { Section } from '@react-email/components';

interface VerificationProps {
  name: string;
  status: string;
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

const statusStyle = {
  fontFamily: '"Courier New", monospace',
  fontSize: '20px',
  color: '#fff',
  textAlign: 'center' as const,
  fontWeight: 'bold',
  backgroundColor: '#0d0d0d',
  padding: '14px 28px',
  margin: '20px 0',
};

export function Verification({ name, status, t }: VerificationProps) {
  const _t = t || ((key: string) => key);
  const statusLabel = status === 'verified' ? _t('email.verification.statusVerified') : status === 'failed' ? _t('email.verification.statusFailed') : status;

  return (
    <BaseEmail previewText={_t('email.verification.preview')} t={t}>
      <Section style={{ marginBottom: '32px', paddingBottom: '24px' }}>
        <h1 style={headingStyle}>{_t('email.verification.heading')}</h1>
      </Section>

      <Section style={{ marginBottom: '24px' }}>
        <p style={pStyle}>{_t('email.verification.greeting', { name })}</p>
        <p style={pStyle}>{_t('email.verification.updated')}</p>
      </Section>

      <Section style={statusStyle}>
        {statusLabel}
      </Section>
    </BaseEmail>
  );
}
