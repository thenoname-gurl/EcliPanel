import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Hr,
  Section,
} from '@react-email/components';
import { ReactNode } from 'react';

interface BaseEmailProps {
  previewText?: string;
  children: ReactNode;
  t?: (key: string, vars?: Record<string, string | number>) => string;
}

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

export function BaseEmail({ previewText, children, t }: BaseEmailProps) {
  return (
    <Html>
      <Head />
      {previewText && <Preview>{previewText}</Preview>}
      <Body
        style={{
          backgroundColor: '#0a0a12',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
          color: '#e0e0e0',
          margin: 0,
          padding: 0,
          width: '100%',
          lineHeight: '1.6',
        }}
      >
        <Container
          style={{
            maxWidth: '600px',
            margin: '0 auto',
            padding: '40px 32px',
            backgroundColor: '#1a1a1a',
          }}
        >
          {children}
          <Hr style={{ height: '1px', border: '1px solid #2a2a4a', marginTop: '32px', paddingTop: '24px' }} />
          <Section style={footerStyle}>
            <p style={{ margin: 0 }}>
              &copy; 2026 <span style={{ color: '#e594c7', fontWeight: '600' }}>EclipseSystems</span> under Misiu LLC.<br />
              {t ? t('email.footer.allRightsReserved') : 'All rights reserved.'}
            </p>
            <Section style={{ marginTop: '16px' }}>
              <a href="https://ecli.app/legal" style={linkStyle}>{t ? t('email.footer.legalDocuments') : 'Legal Documents'}</a>
              <a href="https://ecli.app/legal/imprint" style={linkStyle}>{t ? t('email.footer.impressum') : 'Impressum'}</a>
              <a href="mailto:contact@ecli.app" style={linkStyle}>{t ? t('email.footer.contactUs') : 'Contact Us'}</a>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
