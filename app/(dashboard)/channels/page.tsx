import Link from 'next/link';
import { requireSignedIn } from '@/server/auth/session';
import { serverMessages } from '@/server/i18n/locale';
import { listChannelSummaries } from '@/server/services/channels';
import { ChannelCard } from '@/components/channels/ChannelCard';

// The last-run figures change the moment a sync finishes on this very page.
export const dynamic = 'force-dynamic';

export default async function ChannelsPage() {
  const { merchantId } = await requireSignedIn();
  const t = await serverMessages();
  const channels = await listChannelSummaries(merchantId);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">{t.channels.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {t.channels.subtitleLead}{' '}
          <Link href="/sync-log" className="underline underline-offset-4 hover:text-neutral-900">
            {t.channels.subtitleLink}
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
