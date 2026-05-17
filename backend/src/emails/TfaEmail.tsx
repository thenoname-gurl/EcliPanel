import { BaseEmail } from './BaseEmail';
import { Hr, Section } from '@react-email/components';

interface TfaEmailProps {
  name: string;
  code: string;
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

const footerStyle = {
  color: '#9ca3af',
  textAlign: 'center' as const,
  marginTop: '32px',
  paddingTop: '24px',
  lineHeight: '1.5',
  fontSize: '16px',
};

const linkStyle = {
  display: 'inline-block',
  margin: '0 8px',
  color: '#9ca3af',
  textDecoration: 'none',
  fontSize: '14px',
};

export function TfaEmail({ name, code }: TfaEmailProps) {
  return (
    <BaseEmail previewText="Your verification code">
      <Section style={{ marginBottom: '32px', paddingBottom: '24px' }}>
        <h1 style={headingStyle}>Verify Your Login</h1>
      </Section>

      <Section style={{ marginBottom: '24px' }}>
        <p style={pStyle}>Hello {name},</p>
        <p style={pStyle}>Use the code below to complete your login.</p>
      </Section>

      <Section style={codeStyle}>
        {code}
      </Section>

      <Section style={infoBoxStyle}>
        <p style={{ color: '#ffffffb3', fontSize: '14px', margin: 0 }}>
          <strong>Important:</strong> This code expires shortly. If you did not attempt to log in, you can safely ignore this email.
        </p>
      </Section>

      <Hr style={{ height: '1px', border: '1px solid #2a2a4a', marginTop: '32px', paddingTop: '24px' }} />

      <Section style={footerStyle}>
        <p style={{ margin: 0 }}>
          &copy; 2026 <span style={{ color: '#e594c7', fontWeight: '600' }}>EclipseSystems</span> under Misiu LLC.<br />
          All rights reserved.
        </p>
        <Section style={{ marginTop: '16px' }}>
          <a href="https://ecli.app/legal" style={linkStyle}>Legal Documents</a>
          <a href="https://ecli.app/legal/imprint" style={linkStyle}>Impressum</a>
          <a href="mailto:contact@ecli.app" style={linkStyle}>Contact Us</a>
        </Section>
      </Section>
    </BaseEmail>
  );
}
