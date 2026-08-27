export default function ModelAndLogic({ data, settings }: { data: any, settings: any }) {
  if (!data || !data.meta) return null;
  const META = data.meta;
  const S = settings;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-4xl mx-auto space-y-8 text-slate-700 text-sm leading-relaxed">
      
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-2">How the module reads a price</h2>
        <p className="text-lg text-slate-600">
          Three steps, in order: <b>set the ceiling</b> on the MPPI tab, <b>judge a quote against it</b> on the Desk, then <b>read the trajectory</b> behind the snapshot on Trends. The module compares and flags. It does not place orders and it does not block them.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span className="bg-primary text-white w-6 h-6 rounded flex items-center justify-center text-sm">M</span> 
          MPPI - the ceiling
        </h3>
        <p>The MPPI target is the <b>Maximum Procurement Price Index</b> - the highest price the business can pay for a raw material while still making a 15% margin on the finished pack.</p>
        <p>It is computed by walking the costing sheet backwards. For every in-scope SKU made from that material, the margin is removed from the selling price, and the known costs of all other inputs (packing material, labour, overhead) are subtracted. The remainder is divided by the kilos of raw material in the pack. That is the ceiling for that pack. The lowest ceiling across all packs in a raw material's group is the <b>binding</b> target - the tightest constraint, which guarantees the margin on every pack if met.</p>
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 text-blue-900 rounded-r">
          The target is a <b>single number per raw material</b>. It comes from selling prices, so it does not move when you switch market or price point - only the references it is compared against do.
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span className="bg-primary text-white w-6 h-6 rounded flex items-center justify-center text-sm">1</span> 
          Desk - market, price point, stock policy
        </h3>
        <p>The desk reports the market; it does not take quotes. Every figure on it is <b>OMR per kilogram</b>, including <b>Latest market price</b>, which carries the most recent published data point for that commodity on that basis together with the date it was published.</p>
        <p><b>Stock cover</b> is the days of stock the raw material has left, and it is templated until the Inventory feed is connected. The register gives the replenishment rhythm - a normal lot size and an average daily usage.</p>
        <p className="font-semibold text-slate-900 mt-6">The verdict is four words. Price decides three of them; stock decides the fourth.</p>
        
        <table className="w-full border-collapse border border-slate-200 my-4">
          <tbody className="divide-y divide-slate-200">
            <tr>
              <th className="p-3 text-left w-32 align-top text-emerald-700 bg-emerald-50 font-bold border-r border-slate-200">▼ ◆ Buy</th>
              <td className="p-3">The market price is at or under the MPPI ceiling - inside ±{(META.tol * 100).toFixed(0)}% counts as at it. Nothing about stock changes this: a price that protects the margin is worth taking.</td>
            </tr>
            <tr>
              <th className="p-3 text-left w-32 align-top text-amber-700 bg-amber-50 font-bold border-r border-slate-200">▲ Bridge buy</th>
              <td className="p-3">Above the ceiling, and cover is under the reorder point of <b>{S.reorder} days</b>. Buy the minimum that reaches the next quote, not a full lot. This is the only instruction to pay above the ceiling, and stock is the only reason for it.</td>
            </tr>
            <tr>
              <th className="p-3 text-left w-32 align-top text-rose-700 bg-rose-50 font-bold border-r border-slate-200">▲ Hold</th>
              <td className="p-3">Above the ceiling, with more than {S.reorder} days of cover in hand. There is time to wait for a better number.</td>
            </tr>
            <tr>
              <th className="p-3 text-left w-32 align-top text-slate-600 bg-slate-50 font-bold border-r border-slate-200">– Review</th>
              <td className="p-3">No market price on this basis, so there is nothing to judge. It reads <b>Review</b> instead when cover is under the reorder point - get a quote today.</td>
            </tr>
          </tbody>
        </table>
        
        <div className="bg-slate-50 p-4 rounded-lg mt-4 text-sm border border-slate-200">
          <ul className="space-y-3">
            <li><b>MPPI target:</b> One value per raw material. Does not vary with the dropdowns.</li>
            <li><b>Last purchase:</b> The most recent price actually paid in the market on the row, from the purchase register. Lines in other markets are never compared.</li>
            <li><b>Benchmark:</b> The same period last year for that market and price point, where one exists - and the six-month average where it does not.</li>
          </ul>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span className="bg-primary text-white w-6 h-6 rounded flex items-center justify-center text-sm">2</span> 
          Trends - the path behind the number
        </h3>
        <p>Weekly means per commodity, market and price point, with the MPPI target drawn across. Gaps longer than three weeks are drawn as breaks rather than interpolated.</p>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span className="bg-primary text-white w-6 h-6 rounded flex items-center justify-center text-sm">3</span> 
          What the numbers rest on
        </h3>
        <p>{META.nSku} SKUs from the item cost reference, matched 100% to the costing sheet. {(META.nObs || 0).toLocaleString()} market observations across {META.nSeries} series from eight monthly workbooks, normalised to OMR per kg.</p>
        <p>{META.nTx} purchase-register lines: {META.nRev} are credit notes, and those plus the purchases they reverse are removed before a last price is taken.</p>
        <p>Green reads favourable and red unfavourable, but colour is never the only channel: every state also carries a word and a direction mark, and every variance carries its sign.</p>
      </div>

    </div>
  );
}
