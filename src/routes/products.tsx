import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  ShoppingCart,
  PackageX,
  Boxes,
  Lock,
  Eye,
  Wallet,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { PageHeader, Panel, EmptyState } from "@/components/app/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addSalePayment,
  addProductCategory,
  getCurrentSession,
  renameProductCategory,
  trashProduct,
  saveProduct,
  sellProduct,
  useGym,
} from "@/lib/gym/store";
import {
  activeMembers,
  isWalkIn,
  liveProducts,
  lowStock,
  money,
  profitOfSales,
  salePaid,
  saleDue,
  shortDate,
} from "@/lib/gym/selectors";
import { InvoiceDialog, type InvoiceData } from "@/components/app/InvoiceDialog";
import type { GymState, PaymentMethod, Product, ProductCategory, Sale } from "@/lib/gym/types";
import { DEFAULT_PRODUCT_CATEGORIES } from "@/lib/gym/types";
import {
  isPositiveMoneyAmount,
  isSafeMoneyAmount,
  multiplyMoney,
  normalizeMoney,
  subtractMoney,
} from "@/lib/gym/money";

/** Builds the invoice view from the already-saved sale record — never regenerates one. */
function saleInvoice(state: GymState, sale: Sale): InvoiceData {
  const member = sale.memberId ? state.members.find((m) => m.id === sale.memberId) : undefined;
  const walkIn = !member || isWalkIn(member);
  const initialPayment = [...state.payments]
    .filter((payment) => payment.saleId === sale.id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
  return {
    invoiceNo: sale.invoiceNo,
    date: sale.date,
    title: "Sales Invoice",
    walkIn,
    billedTo: member?.name ?? sale.buyer,
    contact: member?.phone ?? sale.buyerPhone,
    contactLines: walkIn
      ? [member?.email ?? sale.buyerEmail ?? "", member?.address ?? sale.buyerAddress ?? ""]
      : undefined,
    lines: [{ description: sale.productName, qty: sale.qty, rate: sale.unitPrice }],
    discount: sale.discount ?? 0,
    paid: salePaid(state, sale),
    method: initialPayment?.method,
  };
}

export const Route = createFileRoute("/products")({
  validateSearch: (search: Record<string, unknown>) => ({
    sale: typeof search.sale === "string" ? search.sale : undefined,
    sell: typeof search.sell === "string" ? search.sell : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Products & Sales — IRONVAULT Gym Management" },
      {
        name: "description",
        content:
          "Manage supplements and gym merchandise, track stock levels, record sales and monitor low-stock alerts offline.",
      },
      { property: "og:title", content: "Products & Sales — IRONVAULT Gym Management" },
      {
        property: "og:description",
        content: "Inventory, stock alerts, sales recording and profit tracking for your gym store.",
      },
    ],
  }),
  component: () => (
    <AppShell>
      <ProductsPage />
    </AppShell>
  ),
});

function ProductsPage() {
  const state = useGym();
  const navigate = useNavigate();
  const { sale: saleParam, sell: sellParam } = Route.useSearch();
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"All" | ProductCategory>("All");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [sellFor, setSellFor] = useState<Product | null>(null);
  const [trashFor, setTrashFor] = useState<Product | null>(null);
  const [lockedFor, setLockedFor] = useState<Product | null>(null);
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [collectFor, setCollectFor] = useState<Sale | null>(null);
  const [productDetailsFor, setProductDetailsFor] = useState<Sale | null>(null);
  const [salesFilter, setSalesFilter] = useState<"all" | "paid" | "partial" | "unpaid">("all");
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const productCategories = useMemo(
    () =>
      state
        ? Array.from(
            new Set([
              ...(state.productCategories ?? DEFAULT_PRODUCT_CATEGORIES),
              ...state.products.map((product) => product.category),
            ]),
          )
        : [...DEFAULT_PRODUCT_CATEGORIES],
    [state],
  );

  // Opening a pending walk-in payment notification lands here with ?sale=<id>.
  useEffect(() => {
    if (!state || !saleParam) return;
    const found = state.sales.find((x) => x.id === saleParam);
    if (found && saleDue(state, found) > 0) setCollectFor(found);
  }, [state, saleParam]);

  useEffect(() => {
    if (!state || !sellParam) return;
    const product = liveProducts(state).find((item) => item.id === sellParam);
    if (product) setSellFor(product);
  }, [state, sellParam]);

  const filtered = useMemo(() => {
    if (!state) return [];
    const t = q.trim().toLowerCase().slice(0, 60);
    return liveProducts(state).filter(
      (p) =>
        (categoryFilter === "All" || p.category === categoryFilter) &&
        (!t || `${p.name} ${p.category}`.toLowerCase().includes(t)),
    );
  }, [state, q, categoryFilter]);

  if (!state) return null;
  const session = getCurrentSession();
  const canViewProductCost =
    session?.role !== "receptionist" || Boolean(session.permissions?.viewProductCost);
  const cur = state.settings.currency;
  const low = lowStock(state);
  const live = liveProducts(state);
  const availableCategories = productCategories.filter((category) =>
    live.some((product) => product.category === category),
  );
  const stockValue = live.reduce((a, p) => a + p.stock * p.cost, 0);
  const recentSales = [...state.sales]
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .filter((sale) => {
      if (salesFilter === "all") return true;
      const paid = salePaid(state, sale);
      const due = saleDue(state, sale);
      if (salesFilter === "paid") return due <= 0;
      if (salesFilter === "partial") return paid > 0 && due > 0;
      return paid <= 0 && due > 0;
    })
    .slice(0, 8);

  return (
    <>
      <PageHeader
        title="Products & Sales"
        subtitle="Supplements, merchandise and in-gym store operations"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setCategoryManagerOpen(true)}>
              Manage categories
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Add Product
            </Button>
          </div>
        }
      />

      <div className="flex flex-col">
        <div
          data-testid="product-summary-metrics"
          className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"
        >
          {[
            ["Products", String(live.length), Boxes],
            ...(canViewProductCost
              ? ([
                  ["Stock value", money(stockValue, cur), Boxes],
                  ["Sales profit", money(profitOfSales(state), cur), ShoppingCart],
                ] as const)
              : []),
            ["Low stock", String(low.length), PackageX],
          ].map(([label, value, Icon]) => {
            const I = Icon as typeof Boxes;
            return (
              <div
                key={label as string}
                className="surface-panel flex min-w-0 flex-col items-start gap-2 rounded-2xl p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-5"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-gold/35 bg-gold/10 text-gold sm:h-11 sm:w-11">
                  <I className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground sm:text-[11px] sm:tracking-[0.18em]">
                    {label as string}
                  </p>
                  <p className="truncate font-display text-xl sm:text-2xl">{value as string}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div data-testid="product-search-panel" className="mb-6">
          <Panel>
            <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search products"
                  value={q}
                  maxLength={60}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
                {(["All", ...availableCategories] as const).map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setCategoryFilter(category)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      categoryFilter === category
                        ? "border-gold/50 bg-gold/15 text-gold"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            {low.length > 0 && (
              <div
                data-testid="product-low-stock-alert"
                className="mb-5 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3"
              >
                <p className="text-sm font-medium text-warning">Low stock alert</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {low.map((p) => `${p.name} (${p.stock} left)`).join(" · ")}
                </p>
              </div>
            )}

            {filtered.length === 0 ? (
              <EmptyState
                title="No products found"
                hint="Try a different category or search term."
              />
            ) : (
              <>
                <div className="hidden overflow-x-auto xl:block">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                        <th className="py-3">Product</th>
                        <th className="py-3">Category</th>
                        {canViewProductCost && <th className="py-3">Cost</th>}
                        <th className="py-3">Price</th>
                        <th className="py-3">Stock</th>
                        <th className="py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((p) => (
                        <tr key={p.id} className="border-b border-border/50 hover:bg-secondary/40">
                          <td className="py-3 font-medium">
                            <span className="inline-flex items-center gap-1.5">
                              {p.name}
                              {p.locked && (
                                <Lock className="h-3.5 w-3.5 text-gold" aria-label="Locked" />
                              )}
                            </span>
                          </td>
                          <td className="py-3 text-muted-foreground">{p.category}</td>
                          {canViewProductCost && (
                            <td className="py-3 text-muted-foreground">{money(p.cost, cur)}</td>
                          )}
                          <td className="py-3 text-gold">{money(p.price, cur)}</td>
                          <td className="py-3">
                            <span
                              className={`font-medium ${p.stock <= p.lowStockAt ? "text-warning" : ""}`}
                            >
                              {p.stock}
                            </span>
                          </td>

                          <td className="py-3">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={p.stock < 1}
                                onClick={() => setSellFor(p)}
                              >
                                <ShoppingCart className="mr-1.5 h-3.5 w-3.5" /> Sell
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="Edit product"
                                onClick={() => {
                                  setEditing(p);
                                  setFormOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                aria-label="Delete product"
                                onClick={() => (p.locked ? setLockedFor(p) : setTrashFor(p))}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="grid gap-3 sm:grid-cols-2 xl:hidden" aria-label="Products">
                  {filtered.map((p) => (
                    <li
                      key={p.id}
                      data-testid="product-responsive-card"
                      className="min-w-0 rounded-xl border border-border bg-secondary/15 p-4"
                    >
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words font-medium">
                            {p.name}
                            {p.locked && (
                              <Lock
                                className="ml-1.5 inline h-3.5 w-3.5 text-gold"
                                aria-label="Locked"
                              />
                            )}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">{p.category}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                            p.stock <= p.lowStockAt
                              ? "border-warning/40 bg-warning/10 text-warning"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          {p.stock <= p.lowStockAt ? "Low stock" : "In stock"}
                        </span>
                      </div>
                      <dl
                        className={`mt-4 grid gap-3 ${canViewProductCost ? "grid-cols-3" : "grid-cols-2"}`}
                      >
                        {canViewProductCost && (
                          <div>
                            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              Cost
                            </dt>
                            <dd className="mt-1 text-sm">{money(p.cost, cur)}</dd>
                          </div>
                        )}
                        <div>
                          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Price
                          </dt>
                          <dd className="mt-1 text-sm text-gold">{money(p.price, cur)}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Stock
                          </dt>
                          <dd
                            className={`mt-1 text-sm font-medium ${p.stock <= p.lowStockAt ? "text-warning" : ""}`}
                          >
                            {p.stock}
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-4 flex items-center gap-2 border-t border-border/70 pt-3">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="flex-1"
                          disabled={p.stock < 1}
                          onClick={() => setSellFor(p)}
                        >
                          <ShoppingCart className="mr-1.5 h-3.5 w-3.5" /> Sell
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          aria-label={`Edit product ${p.name}`}
                          onClick={() => {
                            setEditing(p);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
                          aria-label={`Delete product ${p.name}`}
                          onClick={() => (p.locked ? setLockedFor(p) : setTrashFor(p))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
        </div>
      </div>

      <Panel
        title="Recent Sales"
        actions={
          <div className="flex items-center gap-2">
            {(
              [
                ["all", "All"],
                ["paid", "Paid"],
                ["partial", "Partially Paid"],
                ["unpaid", "Unpaid"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setSalesFilter(value)}
                className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  salesFilter === value
                    ? "border-gold/50 bg-gold/15 text-gold"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        {recentSales.length === 0 ? (
          <EmptyState
            title={salesFilter === "all" ? "No sales yet" : "No matching sales"}
            hint={
              salesFilter === "all"
                ? "Sales you record will appear here."
                : "No recent sales match this payment status."
            }
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {recentSales.map((s) => {
              const productName =
                state.products.find((product) => product.id === s.productId)?.name ?? s.productName;
              const buyerMember = state.members.find(
                (member) => member.id === s.memberId && !member.deletedAt && !isWalkIn(member),
              );
              const due = saleDue(state, s);

              return (
                <li
                  key={s.id}
                  data-testid={`recent-sale-${s.id}`}
                  className="-mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {s.qty} ×{" "}
                      <button
                        type="button"
                        className="rounded-sm text-left hover:text-gold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
                        aria-label={`View product details for ${productName}`}
                        onClick={() => setProductDetailsFor(s)}
                      >
                        {productName}
                      </button>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {buyerMember ? (
                        <>
                          <button
                            type="button"
                            className="rounded-sm no-underline hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
                            aria-label={`Open member profile for ${buyerMember.name}`}
                            onClick={() =>
                              navigate({
                                to: "/members/$memberId",
                                params: { memberId: buyerMember.id },
                                search: { tab: undefined },
                              })
                            }
                          >
                            {buyerMember.name}
                          </button>
                          {` · ${shortDate(s.date)} · ${s.invoiceNo}`}
                        </>
                      ) : (
                        <>
                          {s.buyer || "Walk-in"} · {shortDate(s.date)} · {s.invoiceNo}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <p className="font-medium text-gold">{money(s.total, cur)}</p>
                      {due > 0 && <p className="text-xs text-warning">Due {money(due, cur)}</p>}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="View invoice"
                      title="View invoice"
                      onClick={() => setInvoice(saleInvoice(state, s))}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {due > 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-warning hover:text-warning"
                        aria-label="Collect due"
                        title="Collect due"
                        onClick={() => setCollectFor(s)}
                      >
                        <Wallet className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <InvoiceDialog
        invoice={invoice}
        settings={state.settings}
        onOpenChange={() => setInvoice(null)}
      />

      <ProductDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editing}
        categories={productCategories}
        canViewProductCost={canViewProductCost}
      />
      <ProductCategoryManager
        open={categoryManagerOpen}
        onOpenChange={setCategoryManagerOpen}
        categories={productCategories}
        onCategoryRenamed={(previous, next) => {
          setCategoryFilter((current) => (current === previous ? next : current));
        }}
      />
      <SellDialog
        product={sellFor}
        onClose={() => {
          setSellFor(null);
          if (sellParam) {
            navigate({
              to: "/products",
              search: { sale: saleParam, sell: undefined },
              replace: true,
            });
          }
        }}
      />
      <ProductDetailsDialog
        sale={productDetailsFor}
        onClose={() => setProductDetailsFor(null)}
        canViewProductCost={canViewProductCost}
      />
      <CollectSaleBalanceDialog sale={collectFor} onClose={() => setCollectFor(null)} />

      <Dialog open={Boolean(trashFor)} onOpenChange={(v) => !v && setTrashFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl tracking-wide">
              Move this product to Trash?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This product will be moved to Trash. You can restore it within the next 30 days before
              it is permanently deleted.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setTrashFor(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (!trashFor || !trashProduct(trashFor.id)) {
                    return toast.error("Product could not be moved to Trash");
                  }
                  toast.success("Product moved to Trash");
                  setTrashFor(null);
                }}
              >
                Move to Trash
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(lockedFor)} onOpenChange={(v) => !v && setLockedFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl tracking-wide text-warning">
              This product is locked
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This product is protected and cannot be moved to Trash while it is locked. Please
              unlock the product first if you want to delete it.
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setLockedFor(null)}>OK</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProductDetailsDialog({
  sale,
  onClose,
  canViewProductCost,
}: {
  sale: Sale | null;
  onClose: () => void;
  canViewProductCost: boolean;
}) {
  const state = useGym();
  if (!state || !sale) return null;

  const product = state.products.find((item) => item.id === sale.productId);
  const cur = state.settings.currency;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wide">Product details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-secondary/30 p-4">
            <p className="font-medium">{product?.name ?? sale.productName}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {product?.deletedAt ? "Archived product" : "Current product profile"}
            </p>
          </div>

          <div className="grid gap-3 rounded-xl border border-border p-4 text-sm sm:grid-cols-2">
            <ProductDetail label="Category" value={product?.category ?? "Not available"} />
            <ProductDetail label="SKU" value={product?.sku || "Not set"} />
            <ProductDetail
              label="Selling price"
              value={money(product?.price ?? sale.unitPrice, cur)}
            />
            <ProductDetail
              label="Current stock"
              value={
                product ? (product.deletedAt ? "Archived" : String(product.stock)) : "Not available"
              }
            />
            {canViewProductCost && product && (
              <ProductDetail label="Cost price" value={money(product.cost, cur)} />
            )}
          </div>

          <div className="rounded-xl border border-border/70 px-4 py-3 text-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">This sale</p>
            <p className="mt-1">
              {sale.qty} unit{sale.qty === 1 ? "" : "s"} · {money(sale.total, cur)} ·{" "}
              {shortDate(sale.date)}
            </p>
            {!product && (
              <p className="mt-1 text-xs text-muted-foreground">
                The original product record is unavailable; details above use the saved sale record.
              </p>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProductDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-words text-right font-medium">{value}</span>
    </div>
  );
}

function CollectSaleBalanceDialog({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const state = useGym();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  if (!state || !sale) return null;

  const balance = saleDue(state, sale);
  const value = amount === "" ? balance : Number(amount);
  const valid = Number.isFinite(value) && value > 0 && value <= balance;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wide">
            Collect product due
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-secondary/30 p-4 text-sm">
            <p className="font-medium">{sale.buyer}</p>
            <p className="mt-1 text-muted-foreground">
              {sale.invoiceNo} · {sale.productName}
            </p>
            <p className="mt-3 text-warning">
              Due: {money(balance, state.settings.currency)}
            </p>
          </div>
          <div className="space-y-2">
            <Label>Amount</Label>
            <Input
              type="number"
              min={1}
              max={balance}
              value={amount}
              placeholder={String(balance)}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Payment method</Label>
            <Select value={method} onValueChange={(next) => setMethod(next as PaymentMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["cash", "upi", "card", "bank", "cheque", "other"] as const).map((item) => (
                  <SelectItem key={item} value={item} className="capitalize">
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!valid || submitting}
              onClick={() => {
                if (submittingRef.current || !valid) return;
                submittingRef.current = true;
                setSubmitting(true);
                let recorded = false;
                try {
                  recorded = addSalePayment(sale.id, value, method);
                } catch {
                  submittingRef.current = false;
                  setSubmitting(false);
                  return toast.error("Payment could not be recorded");
                }
                if (!recorded) {
                  submittingRef.current = false;
                  setSubmitting(false);
                  return toast.error("Payment could not be recorded");
                }
                toast.success(value === balance ? "Sale paid in full" : "Payment recorded");
                setAmount("");
                onClose();
              }}
            >
              {submitting ? "Recording…" : "Record payment"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProductCategoryManager({
  open,
  onOpenChange,
  categories,
  onCategoryRenamed,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  categories: ProductCategory[];
  onCategoryRenamed: (previous: string, next: string) => void;
}) {
  const [newCategory, setNewCategory] = useState("");
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editedName, setEditedName] = useState("");

  useEffect(() => {
    if (!open) {
      setNewCategory("");
      setEditingCategory(null);
      setEditedName("");
    }
  }, [open]);

  function saveNewCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newCategory.trim();
    if (name.length < 2 || name.length > 40) {
      toast.error("Category names must be between 2 and 40 characters.");
      return;
    }
    if (!addProductCategory(name)) {
      toast.error("That category already exists or could not be saved.");
      return;
    }
    toast.success(`${name} category added`);
    setNewCategory("");
  }

  function saveRenamedCategory(previous: string) {
    const next = editedName.trim();
    if (next.length < 2 || next.length > 40) {
      toast.error("Category names must be between 2 and 40 characters.");
      return;
    }
    if (next === previous) {
      setEditingCategory(null);
      return;
    }
    if (!renameProductCategory(previous, next)) {
      toast.error("That category already exists or could not be renamed.");
      return;
    }
    onCategoryRenamed(previous, next);
    setEditingCategory(null);
    toast.success(`Category renamed to ${next}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wide">
            Manage product categories
          </DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-sm text-muted-foreground">
          Add categories or rename one. Renaming updates all products in that category.
        </p>

        <form onSubmit={saveNewCategory} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={newCategory}
            maxLength={40}
            placeholder="New category name"
            aria-label="New category name"
            onChange={(event) => setNewCategory(event.target.value)}
          />
          <Button type="submit" className="shrink-0">
            <Plus className="mr-2 h-4 w-4" /> Add category
          </Button>
        </form>

        <div className="max-h-[min(50dvh,24rem)] space-y-2 overflow-y-auto pr-1">
          {categories.map((category) => (
            <div
              key={category}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-secondary/20 p-3"
            >
              {editingCategory === category ? (
                <>
                  <Input
                    value={editedName}
                    maxLength={40}
                    aria-label={`Rename category ${category}`}
                    className="min-w-[10rem] flex-1"
                    autoFocus
                    onChange={(event) => setEditedName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        saveRenamedCategory(category);
                      }
                      if (event.key === "Escape") setEditingCategory(null);
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => saveRenamedCategory(category)}>
                      Save category
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditingCategory(null)}>
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <span className="min-w-0 truncate text-sm font-medium">{category}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-label={`Edit category ${category}`}
                    onClick={() => {
                      setEditingCategory(category);
                      setEditedName(category);
                    }}
                  >
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProductDialog({
  open,
  onOpenChange,
  product,
  categories,
  canViewProductCost,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: Product | null;
  categories: ProductCategory[];
  canViewProductCost: boolean;
}) {
  const [form, setForm] = useState({
    name: "",
    category: (categories[0] ?? "Supplements") as ProductCategory,
    sku: "",
    cost: "",
    price: "",
    stock: "",
    lowStockAt: "5",
    locked: false,
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: product?.name ?? "",
        category: product?.category ?? categories[0] ?? "Supplements",
        sku: product?.sku ?? "",
        cost: product ? String(product.cost) : "",
        price: product ? String(product.price) : "",
        stock: product ? String(product.stock) : "",
        lowStockAt: product ? String(product.lowStockAt) : "5",
        locked: Boolean(product?.locked),
      });
    }
  }, [open, product, categories]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wide">
            {product ? "Edit Product" : "Add Product"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                maxLength={60}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v as ProductCategory }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>SKU</Label>
              <Input
                value={form.sku}
                maxLength={24}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
              />
            </div>

            {canViewProductCost && (
              <div className="space-y-2">
                <Label>Cost price</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.cost}
                  onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Selling price</Label>
              <Input
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Stock</Label>
              <Input
                type="number"
                min={0}
                value={form.stock}
                onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Low stock alert at</Label>
              <Input
                type="number"
                min={0}
                value={form.lowStockAt}
                onChange={(e) => setForm((f) => ({ ...f, lowStockAt: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 p-4">
            <div>
              <Label className="text-sm">Lock this product</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Locked products cannot be moved to Trash.
              </p>
            </div>
            <Switch
              checked={form.locked}
              onCheckedChange={(v) => setForm((f) => ({ ...f, locked: v }))}
              aria-label="Lock this product"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (form.name.trim().length < 2) return toast.error("Enter a product name");
                const cost = form.cost.trim() === "" ? 0 : Number(form.cost);
                const price = Number(form.price);
                const stock = form.stock.trim() === "" ? 0 : Number(form.stock);
                const lowStockAt = form.lowStockAt.trim() === "" ? 0 : Number(form.lowStockAt);
                if (!isSafeMoneyAmount(cost) || cost < 0)
                  return toast.error("Enter a valid non-negative cost price.");
                if (!isPositiveMoneyAmount(price))
                  return toast.error("Enter a valid selling price greater than zero.");
                if (
                  !Number.isSafeInteger(stock) ||
                  stock < 0 ||
                  !Number.isSafeInteger(lowStockAt) ||
                  lowStockAt < 0
                ) {
                  return toast.error(
                    "Stock and low-stock alert must be non-negative whole numbers.",
                  );
                }
                const saved = saveProduct({
                  id: product?.id,
                  name: form.name.trim(),
                  category: form.category,
                  sku: form.sku.trim() || form.name.trim().slice(0, 6).toUpperCase(),
                  cost,
                  price,
                  stock,
                  lowStockAt,
                  locked: form.locked,
                  deletedAt: product?.deletedAt ?? null,
                });
                if (!saved)
                  return toast.error("The product details are invalid and were not saved.");
                toast.success(product ? "Product updated" : "Product added");
                onOpenChange(false);
              }}
            >
              Save product
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SellDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const submittingRef = useRef(false);
  const state = useGym();
  const [qty, setQty] = useState("1");
  const [memberId, setMemberId] = useState("walkin");
  const [discountType, setDiscountType] = useState<"none" | "percent" | "fixed">("none");
  const [discountValue, setDiscountValue] = useState("");
  const [walkName, setWalkName] = useState("");
  const [walkPhone, setWalkPhone] = useState("");
  const [walkEmail, setWalkEmail] = useState("");
  const [walkAddress, setWalkAddress] = useState("");
  const [buyerQuery, setBuyerQuery] = useState("");
  const [paid, setPaid] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "upi" | "card">("cash");

  if (!state || !product) return null;
  const cur = state.settings.currency;
  const n = Number(qty);
  const unitPriceValid = isPositiveMoneyAmount(product.price);
  const quantityIsInStock =
    Number.isSafeInteger(n) &&
    Number.isSafeInteger(product.stock) &&
    product.stock >= 0 &&
    n >= 1 &&
    n <= product.stock;
  const qtyValid =
    unitPriceValid &&
    quantityIsInStock &&
    Number.isSafeInteger(Math.round(product.price * 100) * n);
  const gross = unitPriceValid ? multiplyMoney(product.price, qtyValid ? n : 0) : 0;
  const discountInput = Number(discountValue);
  const rawDiscount =
    discountType === "none"
      ? 0
      : discountType === "percent"
        ? (gross * (Number.isFinite(discountInput) ? discountInput : 0)) / 100
        : Number.isFinite(discountInput)
          ? discountInput
          : 0;
  const discountAmount = normalizeMoney(Math.min(Math.max(0, rawDiscount), gross));
  const discountValid =
    discountType === "none" ||
    (discountValue !== "" &&
      Number.isFinite(Number(discountValue)) &&
      Number(discountValue) >= 0 &&
      (discountType === "percent" ? Number(discountValue) <= 100 : Number(discountValue) <= gross));
  const total = subtractMoney(gross, discountAmount);
  const paidNum = Number(paid);
  const paidEntered = paid.trim() !== "";
  const paidValid =
    paidEntered && (paidNum === 0 || isPositiveMoneyAmount(paidNum)) && paidNum <= total;
  const remaining = Math.max(0, subtractMoney(total, paidValid ? paidNum : 0));
  const isWalkIn = memberId === "walkin";
  const walkInValid =
    !isWalkIn || (walkName.trim().length >= 2 && walkPhone.trim().replace(/\D/g, "").length >= 8);
  const walkPhoneDigits = walkPhone.replace(/\D/g, "");
  const normalizedWalkPhone =
    walkPhoneDigits.length > 10 ? walkPhoneDigits.slice(-10) : walkPhoneDigits;
  const existingWalkIn =
    isWalkIn && normalizedWalkPhone.length >= 8
      ? activeMembers(state).find(
          (member) =>
            member.type === "walk_in" &&
            member.phone.replace(/\D/g, "").slice(-10) === normalizedWalkPhone,
        )
      : undefined;

  const reset = () => {
    setQty("1");
    setPaid("");
    setDiscountType("none");
    setDiscountValue("");
    setMemberId("walkin");
    setWalkName("");
    setWalkPhone("");
    setWalkEmail("");
    setWalkAddress("");
    setPaymentMethod("cash");
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wide">
            Sell {product.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Quantity (in stock: {product.stock})</Label>
            <Input
              type="number"
              min={1}
              max={product.stock}
              step={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            {!qtyValid && (
              <p className="text-xs text-destructive">
                Enter a whole quantity between 1 and {product.stock}.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Discount type</Label>
            <Select
              value={discountType}
              onValueChange={(v) => setDiscountType(v as "none" | "percent" | "fixed")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No discount</SelectItem>
                <SelectItem value="percent">Percentage (%)</SelectItem>
                <SelectItem value="fixed">Fixed amount ({cur})</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {discountType !== "none" && (
            <div className="space-y-2">
              <Label>{discountType === "percent" ? "Discount (%)" : `Discount (${cur})`}</Label>
              <Input
                type="number"
                min={0}
                max={discountType === "percent" ? 100 : gross}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder="0"
              />
              {!discountValid && (
                <p className="text-xs text-destructive">Enter a valid discount.</p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label>Buyer</Label>
            <Select
              value={memberId}
              onValueChange={setMemberId}
              onOpenChange={(o) => !o && setBuyerQuery("")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <div className="p-1.5">
                  <Input
                    autoFocus
                    value={buyerQuery}
                    onChange={(e) => setBuyerQuery(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder="Search members..."
                    className="h-8"
                  />
                </div>
                <SelectItem value="walkin">Walk-in customer</SelectItem>
                {(() => {
                  const q = buyerQuery.trim().toLowerCase();
                  const list = activeMembers(state).filter(
                    (m) => m.type !== "walk_in" && (q ? m.name.toLowerCase().includes(q) : true),
                  );
                  if (list.length === 0)
                    return (
                      <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                        No members found.
                      </p>
                    );
                  return list.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ));
                })()}
              </SelectContent>
            </Select>
          </div>

          {isWalkIn && (
            <div className="grid gap-4 rounded-xl border border-gold/25 bg-secondary/30 p-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Customer name</Label>
                <Input
                  value={walkName}
                  onChange={(e) => setWalkName(e.target.value)}
                  maxLength={80}
                />
              </div>
              <div className="space-y-2">
                <Label>Mobile number</Label>
                <Input
                  value={walkPhone}
                  onChange={(e) => setWalkPhone(e.target.value)}
                  maxLength={20}
                />
              </div>
              <div className="space-y-2">
                <Label>Email (optional)</Label>
                <Input
                  value={walkEmail}
                  onChange={(e) => setWalkEmail(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label>Address (optional)</Label>
                <Input
                  value={walkAddress}
                  onChange={(e) => setWalkAddress(e.target.value)}
                  maxLength={200}
                />
              </div>
              {!walkInValid && (
                <p className="text-xs text-destructive sm:col-span-2">
                  Customer name and a valid mobile number are required.
                </p>
              )}
              {existingWalkIn && (
                <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs sm:col-span-2">
                  <p className="font-semibold text-success">Existing customer found</p>
                  <p className="mt-1 text-foreground">{existingWalkIn.name}</p>
                  <p className="text-muted-foreground">{existingWalkIn.phone}</p>
                  <p className="mt-1 text-muted-foreground">
                    This sale will be added to their existing profile.
                  </p>
                </div>
              )}
            </div>
          )}
          <div className="space-y-1 rounded-lg border border-border bg-background/40 p-3 text-sm">
            <SummaryRow label="Original price" value={money(gross, cur)} />
            <SummaryRow label="Discount" value={`- ${money(discountAmount, cur)}`} />
            <SummaryRow label="Final payable" value={money(total, cur)} />
            <SummaryRow label="Due" value={money(remaining, cur)} />
          </div>
          <div className="space-y-2">
            <Label>Amount collected now</Label>
            <Input
              type="number"
              min={0}
              max={total}
              step={1}
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
              placeholder="Enter amount"
            />
            {!paidEntered ? (
              <p className="text-xs text-muted-foreground">
                Enter the amount collected now. Type 0 if no payment was collected.
              </p>
            ) : !paidValid ? (
              <p className="text-xs text-destructive">
                Amount collected cannot exceed the final payable amount ({money(total, cur)}).
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Payment method</Label>
            <Select
              value={paymentMethod}
              onValueChange={(value) => setPaymentMethod(value as "cash" | "upi" | "card")}
              disabled={paidValid && paidNum === 0}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="card">Card</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!qtyValid || !discountValid || !walkInValid || !paidValid}
              onClick={() => {
                if (submittingRef.current) return;
                if (!qtyValid) return toast.error("Enter a valid quantity");
                if (!paidValid) return toast.error("Enter the amount collected now");
                submittingRef.current = true;
                const member = isWalkIn
                  ? null
                  : activeMembers(state).find((m) => m.id === memberId);
                try {
                  const saved = sellProduct(
                    product.id,
                    n,
                    member?.name ?? (walkName.trim() || "Walk-in customer"),
                    member?.id ?? null,
                    {
                      discount: discountAmount,
                      amountPaid: paidNum,
                      paymentMethod,
                      buyerPhone: member?.phone ?? (walkPhone.trim() || undefined),
                      buyerEmail: member?.email ?? (walkEmail.trim() || undefined),
                      buyerAddress: member?.address ?? (walkAddress.trim() || undefined),
                    },
                  );
                  if (!saved) {
                    return toast.error(
                      "The sale could not be recorded. Check stock and amount limits, then try again.",
                    );
                  }
                  toast.success("Sale recorded");
                  reset();
                  onClose();
                } finally {
                  submittingRef.current = false;
                }
              }}
            >
              Complete sale
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
