import Link from 'next/link';
import { requireMerchantId } from '@/server/auth/session';
import { listChannelSummaries } from '@/server/services/channels';
import { ChannelCard } from '@/components/channels/ChannelCard';

// The last-run figures change the moment a sync finishes on this very page.
export const dynamic = 'force-dynamic';

export default async function ChannelsPage() {
  const merchantId = await requireMerchantId();
  const channels = await listChannelSummaries(merchantId);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Channels</h1>
        <p className="mt-1 text-sm text-neutral-500">
          The mock marketplaces run inside this deployment and are reached over HTTP like any
          third party — own API key, own field names, own batch limit. Every run lands in the{' '}
          <Link href="/sync-log" className="underline underline-offset-4 hover:text-neutral-900">
            sync log
          </Link>
          .
        </p>
      </header>

      <div className="flex flex-col gap-4">
        {channels.map((channel) => (
          <ChannelCard key={channel.id} channel={channel} />
        ))}
      </div>
    </div>
  );
}
