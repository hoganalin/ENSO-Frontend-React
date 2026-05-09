export interface Product {
  id: string;
  title: string;
  category: string;
  origin_price: number;
  price: number;
  unit: string;
  description: string;
  content: string;
  scenes: string[];
  top_smell: string;
  heart_smell: string;
  base_smell: string;
  is_enabled: boolean;
  imageUrl: string;
  imagesUrl: string[];
  feature: string;
  eng_title?: string;
  burning_time?: string;
  inventory?: number;
}
