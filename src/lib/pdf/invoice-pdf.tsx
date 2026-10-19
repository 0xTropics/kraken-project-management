import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
  type DocumentProps,
} from "@react-pdf/renderer";
import { env } from "@/lib/env";
import { formatDate, formatMoney } from "@/lib/format";
import { computeTotals } from "@/lib/invoices/totals";
import { billingModelDescription } from "@/lib/billing-model";
import type { BillingModel, Currency, InvoiceLineKind, InvoiceStatus } from "@/lib/db/types";
import { LINE_KIND_TAG, lineQuantityLabel } from "@/lib/invoices/line-display";

/**
 * The invoice PDF.
 *
 * Rendered with @react-pdf/renderer rather than headless Chromium: this has to
 * run inside a Vercel serverless function, where a browser binary is neither
 * available nor affordable. The trade is that the layout is flexbox-only and
 * the type is limited to the fourteen PDF standard fonts -- which is fine,
 * because Helvetica set well is what most real invoices are.
 *
 * No font is registered from the network. A `Font.register` pointing at a CDN
 * would turn every invoice render into an outbound HTTP call that can fail
 * halfway through finalizing, and finalize is the one operation in Kraken that
 * must not half-succeed.
 *
 * Only WinAnsi-representable characters may appear here. The standard-font
 * encoding has an em dash and curly quotes but no U+2212 minus, so negative
 * amounts use an ASCII hyphen.
 */

// Wrap between words only. react-pdf hyphenates by default, which suits a
// paragraph and not an invoice line: "pre-" / "vious" on a document the client
// is being asked to pay reads as a typo. A word is returned whole, so a line
// that cannot fit it simply ends before it.
Font.registerHyphenationCallback((word) => [word]);

/* -------------------------------------------------------------------------- */
/* Data shape                                                                  */
/* -------------------------------------------------------------------------- */

export interface InvoicePdfLine {
  id: string;
  kind: InvoiceLineKind;
  description: string;
  quantity: number;
  unit_amount: number;
  amount: number;
  taxable: boolean;
}

export interface InvoicePdfData {
  number: string | null;
  status: InvoiceStatus;
  issue_date: string | null;
  period_start: string;
  period_end: string;
  currency: Currency;
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  deposit_applied: number;
  notes: string | null;
  payment_instructions: string | null;
  payment_method: string | null;
  paid_at: string | null;
  project: { name: string; billing_model: BillingModel };
  client: { name: string; contact_name: string | null; contact_email: string | null };
  company: { name: string; email: string; address: string };
}

/* -------------------------------------------------------------------------- */
/* Presentation helpers                                                        */
/* -------------------------------------------------------------------------- */

const INK = "#15171c";
const BODY = "#3f434c";
const MUTED = "#71757e";
const FAINT = "#9aa0a8";
const RULE = "#e3e5e9";
const RULE_STRONG = "#c7cad0";
const CREDIT = "#a4342a";
const PAID = "#1f7a4d";
const VOID = "#a4342a";

/** ASCII-safe money for the standard-font encoding. */
function money(amount: number, currency: Currency): string {
  const text = formatMoney(Math.abs(amount), currency);
  return amount < 0 ? `-${text}` : text;
}

/**
 * The tallest the totals block gets, in points: its top margin, subtotal,
 * taxable-subtotal, tax and deposit rows, the amount-due row, and the paid
 * line. Slightly generous; the cost of overshooting is one line row moving to
 * the last page.
 *
 * Measured, not guessed: `test/unit/invoice-pdf-layout.test.ts` renders that
 * exact combination (every optional row present at once) and reads the real
 * height back off react-pdf's layout tree -- 14pt top margin + a 130.6pt
 * block = 144.6pt needed. 140 was short by 4.6pt; this constant is exported
 * so that test measures against the real value rather than a second copy of
 * the number that could drift from it.
 */
export const TOTALS_BLOCK_HEIGHT = 150;

/* -------------------------------------------------------------------------- */
/* Styles                                                                      */
/* -------------------------------------------------------------------------- */

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: BODY,
    paddingTop: 54,
    paddingBottom: 64,
    paddingHorizontal: 56,
    lineHeight: 1.45,
  },

  /* Letterhead ---------------------------------------------------------- */
  masthead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  companyName: { fontFamily: "Helvetica-Bold", fontSize: 15, color: INK, letterSpacing: -0.2 },
  companyMeta: { fontSize: 8.5, color: MUTED, marginTop: 3 },
  headRight: { alignItems: "flex-end", maxWidth: 220 },
  eyebrow: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    letterSpacing: 1.8,
    color: FAINT,
    textTransform: "uppercase",
  },
  invoiceNumber: {
    fontFamily: "Helvetica-Bold",
    fontSize: 21,
    color: INK,
    letterSpacing: -0.4,
    marginTop: 2,
  },
  stamp: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 2,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  stampText: { fontFamily: "Helvetica-Bold", fontSize: 7.5, letterSpacing: 1.4 },

  rule: { borderBottomWidth: 1, borderBottomColor: RULE, marginTop: 22 },

  /* Party / meta block --------------------------------------------------- */
  meta: { flexDirection: "row", marginTop: 22 },
  metaCol: { paddingRight: 18 },
  label: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    letterSpacing: 1.1,
    color: FAINT,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  strong: { fontFamily: "Helvetica-Bold", fontSize: 10, color: INK },
  metaLine: { fontSize: 9, color: BODY },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  metaKey: { fontSize: 9, color: MUTED },
  metaValue: { fontSize: 9, color: INK },

  /* Line table ----------------------------------------------------------- */
  tableHead: {
    flexDirection: "row",
    marginTop: 30,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: RULE_STRONG,
  },
  th: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    letterSpacing: 1.1,
    color: FAINT,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
  },
  // Column widths belong to the table, not to any row's text. Yoga has no
  // min-content floor: with an `auto` basis the description's basis is its
  // unwrapped width, so a long line widened this column and shrank the numeric
  // ones until their figures spilled over it. A zero basis
  // makes this column exactly the leftover width, and `flexShrink: 0` keeps
  // the others at their stated size whatever the description says.
  colDesc: { flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: 14 },
  colQty: { width: 52, flexShrink: 0, textAlign: "right" },
  colRate: { width: 76, flexShrink: 0, textAlign: "right" },
  colAmount: { width: 88, flexShrink: 0, textAlign: "right" },
  desc: { fontSize: 9.5, color: INK },
  descCredit: { fontSize: 9.5, color: CREDIT },
  tag: { fontSize: 7.5, color: FAINT, marginTop: 1.5 },
  num: { fontSize: 9.5, color: BODY },
  amount: { fontSize: 9.5, color: INK },
  amountCredit: { fontSize: 9.5, color: CREDIT },
  totalValueCredit: { fontSize: 9.5, color: CREDIT, textAlign: "right" },

  /* Totals --------------------------------------------------------------- */
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 14 },
  totals: { width: 244 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalKey: { fontSize: 9.5, color: MUTED },
  totalValue: { fontSize: 9.5, color: INK, textAlign: "right" },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: 8,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: RULE_STRONG,
  },
  grandKey: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    letterSpacing: 1.1,
    color: INK,
    textTransform: "uppercase",
  },
  grandValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 15,
    color: INK,
    textAlign: "right",
    letterSpacing: -0.2,
  },
  settled: { marginTop: 6, fontSize: 8.5, color: PAID, textAlign: "right" },

  /* Notes and instructions ----------------------------------------------- */
  blocks: { marginTop: 34 },
  block: {
    borderTopWidth: 1,
    borderTopColor: RULE,
    paddingTop: 12,
    marginBottom: 16,
  },
  blockBody: { fontSize: 9, color: BODY, lineHeight: 1.55 },

  /* Footer --------------------------------------------------------------- */
  footer: {
    position: "absolute",
    left: 56,
    right: 56,
    bottom: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: RULE,
    paddingTop: 8,
  },
  footerText: { fontSize: 7.5, color: FAINT },
  /**
   * For the page-number Text, which uses a `render` prop. react-pdf 4.9
   * re-resolves a node's already-resolved style on every relayout pass, and a
   * unitless lineHeight is multiplied by fontSize each time. Static text is
   * unaffected because its wrapped lines are cached from the first pass; a
   * `render`-prop node has its lines reset and re-measured, so it inherited
   * 1.45 x 9.5 x 7.5^3 = 5811pt of leading and the footer landed above the
   * top edge of the page. Zero survives the multiplication and falls back to
   * the font's natural leading in textkit (`lineHeight || ascent - descent`).
   */
  footerDynamicText: { fontSize: 7.5, color: FAINT, lineHeight: 0 },
});

/* -------------------------------------------------------------------------- */
/* Document                                                                    */
/* -------------------------------------------------------------------------- */

function Stamp({ status }: { status: InvoiceStatus }) {
  if (status !== "paid" && status !== "void") return null;
  const color = status === "paid" ? PAID : VOID;
  return (
    <View style={[s.stamp, { borderColor: color }]}>
      <Text style={[s.stampText, { color }]}>{status === "paid" ? "PAID" : "VOID"}</Text>
    </View>
  );
}

export function InvoiceDocument({
  data,
  lines,
  onRender,
}: {
  data: InvoicePdfData;
  lines: InvoicePdfLine[];
  /** Receives the laid-out tree after render; the layout test measures it. */
  onRender?: DocumentProps["onRender"];
}) {
  const number = data.number ?? "DRAFT";
  const period = `${formatDate(data.period_start)} — ${formatDate(data.period_end)}`;
  const showTax = data.tax_rate > 0;
  const taxLabel = `Tax (${(data.tax_rate * 100).toFixed(data.tax_rate * 100 % 1 === 0 ? 0 : 2)}%)`;
  const taxableSubtotal = computeTotals(lines, data.tax_rate).taxable_subtotal;
  const showTaxableSubtotal = taxableSubtotal !== data.subtotal;

  return (
    <Document
      title={`Invoice ${number}`}
      author={data.company.name}
      subject={`${data.project.name} — ${period}`}
      creator={data.company.name}
      producer="Kraken"
      onRender={onRender}
    >
      <Page size="A4" style={s.page}>
        {/* Letterhead */}
        <View style={s.masthead}>
          <View>
            <Text style={s.companyName}>{data.company.name}</Text>
            {data.company.email ? <Text style={s.companyMeta}>{data.company.email}</Text> : null}
            {data.company.address
              ? data.company.address
                  .split(/\r?\n|,\s*/)
                  .map((part) => part.trim())
                  .filter(Boolean)
                  .map((part, i) => (
                    <Text key={i} style={s.companyMeta}>
                      {part}
                    </Text>
                  ))
              : null}
          </View>
          <View style={s.headRight}>
            <Text style={s.eyebrow}>Invoice</Text>
            <Text style={s.invoiceNumber}>{number}</Text>
            <Stamp status={data.status} />
          </View>
        </View>

        <View style={s.rule} />

        {/* Parties and dates */}
        <View style={s.meta}>
          <View style={[s.metaCol, { width: "36%" }]}>
            <Text style={s.label}>Billed to</Text>
            <Text style={s.strong}>{data.client.name}</Text>
            {data.client.contact_name ? (
              <Text style={s.metaLine}>{data.client.contact_name}</Text>
            ) : null}
            {data.client.contact_email ? (
              <Text style={s.metaLine}>{data.client.contact_email}</Text>
            ) : null}
          </View>
          <View style={[s.metaCol, { width: "30%" }]}>
            <Text style={s.label}>Project</Text>
            <Text style={s.strong}>{data.project.name}</Text>
            <Text style={s.metaLine}>
              {billingModelDescription(data.project.billing_model)}
            </Text>
          </View>
          <View style={{ width: "34%" }}>
            <Text style={s.label}>Details</Text>
            <View style={s.metaRow}>
              <Text style={s.metaKey}>Issued</Text>
              <Text style={s.metaValue}>{formatDate(data.issue_date)}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaKey}>Period</Text>
              <Text style={s.metaValue}>{formatDate(data.period_start)}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaKey}>to</Text>
              <Text style={s.metaValue}>{formatDate(data.period_end)}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaKey}>Currency</Text>
              <Text style={s.metaValue}>{data.currency}</Text>
            </View>
          </View>
        </View>

        {/* Lines */}
        <View style={s.tableHead} fixed>
          <Text style={[s.th, s.colDesc]}>Description</Text>
          <Text style={[s.th, s.colQty]}>Qty</Text>
          <Text style={[s.th, s.colRate]}>Rate</Text>
          <Text style={[s.th, s.colAmount]}>Amount</Text>
        </View>

        {lines.map((line, index) => {
          const credit = line.amount < 0;
          const tag = LINE_KIND_TAG[line.kind];
          // The table header is `fixed`, so it repeats on every page -- and
          // would sit over nothing if the totals block alone spilled onto the
          // last page. Insisting on room for the totals after the final row
          // carries that row over with them, so the last page always has at
          // least one line under its header.
          const last = index === lines.length - 1;
          return (
            <View
              key={line.id}
              style={s.row}
              wrap={false}
              minPresenceAhead={last ? TOTALS_BLOCK_HEIGHT : undefined}
            >
              <View style={s.colDesc}>
                <Text style={credit ? s.descCredit : s.desc}>{line.description}</Text>
                {tag ? <Text style={s.tag}>{tag}</Text> : null}
              </View>
              <Text style={[s.num, s.colQty]}>{lineQuantityLabel(line)}</Text>
              <Text style={[s.num, s.colRate]}>
                {line.unit_amount === 0 && line.kind === "adhoc"
                  ? "—"
                  : money(line.unit_amount, data.currency)}
              </Text>
              <Text style={[credit ? s.amountCredit : s.amount, s.colAmount]}>
                {money(line.amount, data.currency)}
              </Text>
            </View>
          );
        })}

        {/* Totals */}
        <View style={s.totalsWrap} wrap={false}>
          <View style={s.totals}>
            <View style={s.totalRow}>
              <Text style={s.totalKey}>Subtotal</Text>
              <Text style={s.totalValue}>{money(data.subtotal, data.currency)}</Text>
            </View>
            {/* A non-taxable line (a pass-through charge) joins the subtotal
                but not the taxable base -- shown only when the two differ, so
                an invoice where every line is taxable renders exactly as it
                did before this feature existed. */}
            {showTaxableSubtotal ? (
              <View style={s.totalRow}>
                <Text style={s.totalKey}>Taxable subtotal</Text>
                <Text style={s.totalValue}>{money(taxableSubtotal, data.currency)}</Text>
              </View>
            ) : null}
            {showTax ? (
              <View style={s.totalRow}>
                <Text style={s.totalKey}>{taxLabel}</Text>
                <Text style={s.totalValue}>{money(data.tax_amount, data.currency)}</Text>
              </View>
            ) : null}
            {/* A column against the invoice, not a line on it -- it sits below
                tax, never inside the subtotal tax was computed on, and only
                appears at all when it is non-zero. */}
            {data.deposit_applied > 0 ? (
              <View style={s.totalRow}>
                <Text style={s.totalKey}>Deposit applied</Text>
                <Text style={s.totalValueCredit}>{money(-data.deposit_applied, data.currency)}</Text>
              </View>
            ) : null}
            <View style={s.grandRow}>
              <Text style={s.grandKey}>Amount due {data.currency}</Text>
              <Text style={s.grandValue}>
                {money(data.total - data.deposit_applied, data.currency)}
              </Text>
            </View>
            {data.status === "paid" ? (
              <Text style={s.settled}>
                Paid {formatDate(data.paid_at)}
                {data.payment_method ? ` by ${data.payment_method}` : ""}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Payment instructions and notes */}
        <View style={s.blocks}>
          {data.payment_instructions ? (
            <View style={s.block} wrap={false}>
              <Text style={s.label}>Payment instructions</Text>
              <Text style={s.blockBody}>{data.payment_instructions}</Text>
            </View>
          ) : null}
          {data.notes ? (
            <View style={s.block} wrap={false}>
              <Text style={s.label}>Notes</Text>
              <Text style={s.blockBody}>{data.notes}</Text>
            </View>
          ) : null}
        </View>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            {data.company.name} · Invoice {number}
          </Text>
          <Text
            style={s.footerDynamicText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

/** Renders the document to PDF bytes. Node only -- `renderToBuffer` needs fs. */
export async function renderInvoicePdf(
  data: InvoicePdfData,
  lines: InvoicePdfLine[],
): Promise<Uint8Array> {
  const buffer = await renderToBuffer(<InvoiceDocument data={data} lines={lines} />);
  return new Uint8Array(buffer);
}

/** The letterhead, from the environment. */
export function companyDetails(): InvoicePdfData["company"] {
  return { name: env.companyName, email: env.companyEmail, address: env.companyAddress };
}
