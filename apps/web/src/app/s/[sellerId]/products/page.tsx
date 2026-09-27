import type { Metadata } from "next";

import { TonePill } from "@/components/StatePill";
import { apiGet } from "@/lib/api";
import { productsSchema, sellerLicensesSchema } from "@/lib/schemas";
import { loadSellerContext } from "@/lib/seller";

export const metadata: Metadata = { title: "Products" };

const statusPill = (status: string) =>
  status === "active" ? (
    <TonePill tone="ok">On sale</TonePill>
  ) : status === "archived" ? (
    <TonePill tone="ended">Archived</TonePill>
  ) : (
    <TonePill tone="neutral">Draft</TonePill>
  );

export default async function ProductsPage({ params }: { params: Promise<{ sellerId: string }> }) {
  const { sellerId } = await params;
  const context = await loadSellerContext(sellerId);
  if (context === null) return null;
  const [products, licenses] = await Promise.all([
    apiGet(`/sellers/${sellerId}/products`, productsSchema),
    apiGet(`/sellers/${sellerId}/licenses`, sellerLicensesSchema)
  ]);
  const buyersFor = (name: string) =>
    licenses.filter((license) => license.productName === name).length;

  return (
    <div className="stack-lg">
      <header className="page-head">
        <h1 className="headline">Products</h1>
        <p className="muted page-lede">What you sell, and how many people bought each one.</p>
      </header>
      {products.length === 0 ? (
        <div className="panel empty">
          <h3>No products yet.</h3>
          <p className="muted">
            A product says which GitHub team or repo a buyer gets after paying.
          </p>
        </div>
      ) : (
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Status</th>
                <th scope="col">Buyers</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td data-cell="primary">
                    <b>{product.name}</b>
                  </td>
                  <td data-cell="state">{statusPill(product.status)}</td>
                  <td data-cell="meta" className="tabular">
                    {buyersFor(product.name)} bought
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
