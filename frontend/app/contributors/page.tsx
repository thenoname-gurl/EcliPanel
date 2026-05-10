import type { Metadata } from 'next';
import { ContributorsClient } from './ContributorsClient';

export const metadata: Metadata = {
  description: 'People who helped EclipseSystems to make EcliPanel better!',
};

export default function ContributorsPage() {
  return <ContributorsClient />;
}