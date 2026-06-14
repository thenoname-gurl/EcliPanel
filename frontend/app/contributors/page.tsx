import type { Metadata } from 'next';
import { ContributorsClient } from './ContributorsClient';
import { createMetadata } from '@/lib/metadata';

export const metadata: Metadata = createMetadata({
  title: 'Contributors — EclipseSystems',
  description: 'People who helped EclipseSystems to make EcliPanel better!',
  path: '/contributors',
});

export default function ContributorsPage() {
  return <ContributorsClient />;
}