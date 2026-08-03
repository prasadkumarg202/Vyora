"use client";

import { formatPaise, type Paise } from "@vyora/core";
import { Button, Input } from "@vyora/ui";
import { useCallback, useEffect, useState } from "react";

import { searchProducts, type ProductPick } from "~/lib/db/repository";
import {
  QUICK_KEY_LIMIT,
  isTypingTarget,
  loadQuickKeys,
  resetQuickKeys,
  saveQuickKeys,
} from "~/lib/quick-keys";

/**
 * The shop's own shortcut row, above the billing lines.
 *
 * Press 1–9, or tap. The digits are bare — no Ctrl, no Alt — because a cashier
 * learns one key, not a chord, and because Ctrl/Alt+number is the browser's
 * own tab switching and we would lose that fight. They are suppressed while
 * anything text-editable has focus, so typing a quantity never adds an item.
 *
 * What is on the row comes from this shop's catalogue, not from a list we
 * guessed for their trade — see lib/quick-keys.ts for why that matters.
 */
export function QuickKeys({
  orgId,
  onPick,
}: {
  orgId: string;
  onPick: (product: ProductPick) => void;
}) {
  const [products, setProducts] = useState<ProductPick[]>([]);
  const [pinned, setPinned] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const keys = await loadQuickKeys(orgId);
    setProducts([...keys.products]);
    setPinned(keys.pinned);
    setLoaded(true);
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    // Suspended while the editor is open: in there, "3" means the number three.
    if (editing) return;

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTypingTarget(event.target)) return;

      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= products.length)
        return;

      event.preventDefault();
      onPick(products[index]!);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [products, onPick, editing]);

  if (!loaded) return null;

  if (products.length === 0 && !editing) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-dashed border-border p-3">
        <span className="text-body text-content-muted">
          No shortcuts yet. Add the items you sell all day to bill them with one
          key.
        </span>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          Set up quick keys
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="quick-keys">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-caption uppercase tracking-wide text-content-muted">
          Quick keys
          <span className="ml-2 normal-case">
            press 1–{Math.min(products.length, QUICK_KEY_LIMIT)} to add
          </span>
        </span>
        <div className="flex items-center gap-2">
          {!pinned && products.length > 0 ? (
            <span className="text-caption normal-case text-content-muted">
              suggested from your catalogue
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing((v) => !v)}
            data-testid="edit-quick-keys"
          >
            {editing ? "Done" : "Edit"}
          </Button>
        </div>
      </div>

      {editing ? (
        <QuickKeyEditor
          orgId={orgId}
          products={products}
          onChange={setProducts}
          onSaved={refresh}
          onClose={() => setEditing(false)}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {products.map((product, i) => (
            <button
              key={product.id}
              type="button"
              onClick={() => onPick(product)}
              data-testid="quick-key"
              className="flex min-h-touch min-w-[7.5rem] flex-col items-start gap-0.5 rounded-control border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-primary hover:bg-primary-tonal"
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="flex size-5 items-center justify-center rounded-control bg-primary-tonal font-mono text-caption text-primary"
                >
                  {i + 1}
                </span>
                <span className="text-body font-medium text-content">
                  {product.name}
                </span>
              </span>
              <span className="text-caption normal-case text-content-muted">
                {product.price_paise !== null
                  ? formatPaise(product.price_paise as Paise)
                  : "no price set"}
                {product.tax_bps !== null
                  ? ` · ${product.tax_bps / 100}% GST`
                  : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Choosing and ordering the keys.
 *
 * Up/down rather than drag: a counter PC with a trackpad, or a phone, makes
 * drag-and-drop reordering a small nightmare, and there are at most nine rows.
 */
function QuickKeyEditor({
  orgId,
  products,
  onChange,
  onSaved,
  onClose,
}: {
  orgId: string;
  products: ProductPick[];
  onChange: (next: ProductPick[]) => void;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<ProductPick[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setMatches([]);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      void searchProducts(orgId, term, 6)
        .then((rows) => live && setMatches(rows))
        .catch(() => live && setMatches([]));
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [orgId, query]);

  const full = products.length >= QUICK_KEY_LIMIT;

  const move = (from: number, to: number) => {
    if (to < 0 || to >= products.length) return;
    const next = [...products];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    onChange(next);
  };

  async function persist(next: ProductPick[]) {
    setSaving(true);
    try {
      await saveQuickKeys(next.map((p) => p.id));
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-canvas p-3">
      <ol className="flex flex-col gap-1">
        {products.map((product, i) => (
          <li
            key={product.id}
            className="flex items-center gap-2 rounded-control bg-surface px-2 py-1"
          >
            <span
              aria-hidden
              className="flex size-5 items-center justify-center rounded-control bg-primary-tonal font-mono text-caption text-primary"
            >
              {i + 1}
            </span>
            <span className="flex-1 text-body">{product.name}</span>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Move ${product.name} up`}
              disabled={i === 0}
              onClick={() => move(i, i - 1)}
            >
              ↑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Move ${product.name} down`}
              disabled={i === products.length - 1}
              onClick={() => move(i, i + 1)}
            >
              ↓
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Remove ${product.name}`}
              onClick={() =>
                onChange(products.filter((p) => p.id !== product.id))
              }
            >
              ✕
            </Button>
          </li>
        ))}
        {products.length === 0 ? (
          <li className="px-2 py-1 text-body text-content-muted">
            No keys yet — search below to add one.
          </li>
        ) : null}
      </ol>

      <div className="flex flex-col gap-1">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            full
              ? `All ${QUICK_KEY_LIMIT} keys are in use — remove one to add another`
              : "Search your products to add a key…"
          }
          disabled={full}
          aria-label="Search products to add a quick key"
        />
        {matches.length > 0 && !full ? (
          <ul className="flex flex-col gap-1">
            {matches
              .filter((m) => !products.some((p) => p.id === m.id))
              .map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange([...products, product]);
                      setQuery("");
                    }}
                    className="w-full rounded-control px-2 py-1 text-left text-body text-content hover:bg-primary-tonal"
                  >
                    + {product.name}
                  </button>
                </li>
              ))}
          </ul>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={saving}
          onClick={() => void persist(products)}
          data-testid="save-quick-keys"
        >
          {saving ? "Saving…" : "Save keys"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={saving}
          onClick={() => {
            void (async () => {
              await resetQuickKeys();
              await onSaved();
              onClose();
            })();
          }}
        >
          Use suggestions instead
        </Button>
        <span className="text-caption normal-case text-content-muted">
          Keys stay in this order until you change them — so key 3 is always the
          same item.
        </span>
      </div>
    </div>
  );
}
