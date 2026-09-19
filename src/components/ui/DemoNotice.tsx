/**
 * Says what this is, on every screen that can be changed.
 *
 * The demo is writable — a stock adjustment or an order transition is a real
 * row in a real database, shared with everyone else looking at the link. A
 * visitor should know that before they click "Cancel order", and a reviewer
 * should not have to wonder whether the numbers are a fixture or a mock.
 */
export function DemoNotice() {
  return (
    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <span className="font-medium">Portfolio demo.</span> The merchant, products and orders are
      fictional and come from a seed script. Changes you make here are saved and visible to everyone
      else with the link, until the database is reseeded.
    </p>
  );
}
