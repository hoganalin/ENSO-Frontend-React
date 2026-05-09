import { useParams } from "react-router";

import SingleProduct from "@/components/SingleProduct";

export default function SingleProductPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  return <SingleProduct id={id ?? ""} />;
}
