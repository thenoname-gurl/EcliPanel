import { BaseEmail } from './BaseEmail';
import { Button, Section } from '@react-email/components';

interface EmailRestoreProps {
  name: string;
  restoreUrl: string;
  newEmail: string;
  oldEmail: string;
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
  marginBottom: '16px',
  lineHeight: '1.7',
  margin: '0 0 16px 0',
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

const infoBoxStyle = {
  backgroundColor: '#161616',
  padding: '16px',
  margin: '20px 0',
};

export function EmailRestore({ name, restoreUrl, newEmail, oldEmail, t }: EmailRestoreProps) {
  const _t = t || ((key: string) => key);

  return (
    <BaseEmail previewText={_t('email.emailRestore.preview')} t={t}>
      <Section style={{ marginBottom: '32px', paddingBottom: '24px' }}>
        <h1 style={headingStyle}>{_t('email.emailRestore.heading')}</h1>
      </Section>

      <Section style={{ marginBottom: '24px' }}>
        <p style={pStyle}>{_t('email.emailRestore.greeting', { name })}</p>
        <p style={pStyle}>{_t('email.emailRestore.changed', { oldEmail, newEmail })}</p>
        <p style={pStyle}>{_t('email.emailRestore.restorePrompt')}</p>
      </Section>

      <Section style={{ textAlign: 'center', margin: '24px 0' }}>
        <Button href={restoreUrl} style={btnStyle}>
          {_t('email.emailRestore.button')}
        </Button>
      </Section>

      <Section style={infoBoxStyle}>
        <p style={{ color: '#ffffffb3', fontSize: '14px', margin: 0 }}>
          <strong>{_t('email.emailRestore.important')}:</strong> {_t('email.emailRestore.expires')}
        </p>
      </Section>
    </BaseEmail>
  );
}
