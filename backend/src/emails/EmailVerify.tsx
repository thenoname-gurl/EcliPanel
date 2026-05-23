import { BaseEmail } from './BaseEmail';
import { Button, Hr, Section } from '@react-email/components';

interface EmailVerifyProps {
  name: string;
  verifyUrl: string;
  code: string;
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
  fontSize: '32px',
  fontWeight: 'bold',
  backgroundColor: '#0d0d0d',
  textDecoration: 'none',
  textAlign: 'center' as const,
};

const codeStyle = {
  fontFamily: '"Courier New", monospace',
  fontSize: '26px',
  color: '#fff',
  textAlign: 'center' as const,
  fontWeight: 'bold',
  backgroundColor: '#0d0d0d',
  padding: '14px 28px',
  margin: '20px 0',
};

const infoBoxStyle = {
  backgroundColor: '#161616',
  padding: '16px',
  margin: '20px 0',
};

export function EmailVerify({ name, verifyUrl, code, t }: EmailVerifyProps) {
  const _t = t || ((key: string) => key);

  return (
    <BaseEmail previewText={_t('email.emailVerify.preview')} t={t}>
      <Section style={{ marginBottom: '32px', paddingBottom: '24px' }}>
        <h1 style={headingStyle}>{_t('email.emailVerify.heading')}</h1>
      </Section>

      <Section style={{ marginBottom: '24px' }}>
        <p style={pStyle}>{_t('email.emailVerify.greeting', { name })}</p>
        <p style={pStyle}>{_t('email.emailVerify.instruction')}</p>
      </Section>

      <Section style={{ textAlign: 'center', margin: '24px 0' }}>
        <Button href={verifyUrl} style={btnStyle}>{_t('email.emailVerify.button')}</Button>
      </Section>

      <Hr style={{ height: '1px', background: 'linear-gradient(to right, transparent, #2a2a4a 50%, transparent)', border: 'none', margin: '24px 0' }} />

      <Section style={{ marginBottom: '24px' }}>
        <p style={{ ...pStyle, textAlign: 'center', marginBottom: '12px' }}>
          <strong>{_t('email.emailVerify.orUse')}</strong>
        </p>
      </Section>

      <Section style={codeStyle}>
        {code}
      </Section>

      <Section style={infoBoxStyle}>
        <p style={{ color: '#ffffffb3', fontSize: '14px', margin: 0 }}>
          <strong>{_t('email.emailVerify.important')}:</strong> {_t('email.emailVerify.expires')}
        </p>
      </Section>
    </BaseEmail>
  );
}
