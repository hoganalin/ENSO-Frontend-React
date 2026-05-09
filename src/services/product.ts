import { adminApi, api, API_PATH } from "./api";

export const getProductApi = (page: number, category: string) => {
  return api.get(`/api/${API_PATH}/products`, {
    params: {
      page,
      category: category === "all" ? "" : category,
    },
  });
};

export const getAllProductsApi = () => {
  return api.get(`/api/${API_PATH}/products/all`);
};

export const getSingleProductApi = (id: string) => {
  return api.get(`/api/${API_PATH}/product/${id}`);
};

//以下為後台的 API
export const getAdminProductsApi = () => {
  return adminApi.get(`/api/${API_PATH}/admin/products`);
};
