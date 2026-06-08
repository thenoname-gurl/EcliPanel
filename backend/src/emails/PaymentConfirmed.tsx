import { BaseEmail } from './BaseEmail';
import { Hr, Section } from '@react-email/components';

interface PaymentConfirmedProps {
  orderId: number;
  amount: number;
  t?: (key: string, vars?: Record<string, string | number>) => string;
}

const headingStyle = {
  color: '#8b5cf6',
  fontSize: '28px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  margin: '0',
};

const pStyle = {
  color: '#ffffffb3',
  fontSize: '16px',
  margin: '0 0 16px 0',
  lineHeight: '1.7',
};

const amountStyle = {
  color: '#22c55e',
  fontSize: '32px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  margin: '24px 0',
};

export function PaymentConfirmed({ orderId, amount, t }: PaymentConfirmedProps) {
  const preview = t
    ? t('paymentConfirmedEmail.preview')
    : 'Your payment has been confirmed';
  return (
    <BaseEmail previewText={preview} t={t}>
      <Section style={{ marginBottom: '24px' }}>
        <h1 style={headingStyle}>
          {t ? t('paymentConfirmedEmail.heading') : 'Payment Confirmed'}
        </h1>
      </Section>

      <Section style={{ marginBottom: '24px' }}>
        <p style={pStyle}>
          {t
            ? t('paymentConfirmedEmail.body', { orderId, amount: `$${(amount ?? 0).toFixed(2)}` })
            : `Your payment for order #${orderId} has been confirmed.`}
        </p>
        <div style={amountStyle}>${(amount ?? 0).toFixed(2)}</div>
        <p style={pStyle}>
          {t
            ? t('paymentConfirmedEmail.activated')
            : 'Your plan has been activated. You can now access all features included in your subscription.'}
        </p>
      </Section>

      <Hr
        style={{
          height: '1px',
          background: 'linear-gradient(to right, transparent, #22c55e 50%, transparent)',
          border: 'none',
          margin: '24px 0',
        }}
      />
    </BaseEmail>
  );
}
