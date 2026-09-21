import { formatDateTime } from '@/lib/dates';
import { formatDelta } from '@/lib/money';
import { serverMessages } from '@/server/i18n/locale';
import type { MovementListItem } from '@/lib/types';

const TH = 'px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-neutral-400';
const TD = 'px-4 py-2 text-sm text-neutral-600';

/** The ledger itself. Rows are never edited, so this table is the audit trail. */
export async function MovementsTable({ movements }: { movements: MovementListItem[] }) {
  const t = await serverMessages();

  if (movements.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-500">
        {t.stock.movements.empty}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full border-collapse">
        <thead className="border-b border-neutral-200 bg-neutral-50/60">
          <tr>
            <th className={TH}>{t.stock.movements.when}</th>
            <th className={TH}>{t.stock.movements.variant}</th>
            <th className={TH}>{t.stock.movements.warehouse}</th>
            <th className={`${TH} text-right`}>{t.stock.movements.delta}</th>
            <th className={TH}>{t.stock.movements.reason}</th>
            <th className={TH}>{t.stock.movements.note}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {movements.map((movement) => (
            <tr key={movement.id}>
              <td className={`${TD} whitespace-nowrap text-neutral-500`}>
                {formatDateTime(movement.createdAt)}
              </td>
              <td className={`${TD} font-mono text-xs`}>{movement.variantSku}</td>
              <td className={TD}>{movement.warehouseCode}</td>
              <td
                className={`${TD} text-right font-medium tabular-nums ${
                  movement.delta < 0 ? 'text-red-700' : 'text-teal-700'
                }`}
              >
                {formatDelta(movement.delta)}
              </td>
              <td className={TD}>
                {t.stockReason[movement.reason]}
                {movement.refType && (
                  <span className="ml-1.5 text-xs text-neutral-400">
                    {t.stock.movements.via(movement.refType)}
                  </span>
                )}
              </td>
              <td className={`${TD} text-neutral-500`}>{movement.note ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
