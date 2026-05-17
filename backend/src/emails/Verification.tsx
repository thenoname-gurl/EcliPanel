import { BaseEmail } from './BaseEmail';
import { Button, Hr, Section } from '@react-email/components';

interface VerificationProps {
  name: string;
  status: string;
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

export function Verification({ name, status }: VerificationProps) {
  const statusLabel = status === 'verified' ? 'Verified' : status === 'failed' ? 'Failed' : status;

  return (
    <BaseEmail previewText="ID verification status updated">
      <Section style={{ marginBottom: '32px', paddingBottom: '24px' }}>
        <h1 style={headingStyle}>ID Verification Status</h1>
      </Section>

      <Section style={{ marginBottom: '24px' }}>
        <p style={pStyle}>Hello {name},</p>
        <p style={pStyle}>Your ID verification status has been updated.</p>
      </Section>

      <Section style={statusStyle}>
        {statusLabel}
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
