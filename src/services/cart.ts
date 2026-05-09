import { api, API_PATH } from "./api";

export const getCartApi = () => {
  return api.get(`/api/${API_PATH}/cart`);
};

export const addCartApi = ({
  product_id,
  qty,
}: {
  product_id: string;
  qty: number;
}) => {
  return api.post(`/api/${API_PATH}/cart`, {
    data: {
      product_id,
      qty,
    },
  });
};

export const deleteSingleCartApi = (id: string) => {
  return api.delete(`/api/${API_PATH}/cart/${id}`);
};

export const deleteAllCartApi = () => {
  return api.delete(`/api/${API_PATH}/carts`);
};

export const updateCartApi = (
  id: string,
  { product_id, qty }: { product_id: string; qty: number },
) => {
  return api.put(`/api/${API_PATH}/cart/${id}`, {
    data: {
      product_id,
      qty,
    },
  });
};

export const createOrderApi = (data: unknown) => {
  return api.post(`/api/${API_PATH}/order`, {
    data,
  });
};
