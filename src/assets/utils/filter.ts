export const currency = (num: number): string => {
  const n = Number(num) || 0;
  return n.toLocaleString();
};
