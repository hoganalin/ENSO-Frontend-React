import { Suspense } from "react";

import Products from "@/components/Product";

export default function ProductsPage(): JSX.Element {
  return (
    <Suspense fallback={<div className="container py-5">載入中…</div>}>
      <Products />
    </Suspense>
  );
}
