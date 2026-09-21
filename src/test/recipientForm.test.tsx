import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import RecipientForm from "@/components/RecipientForm";
afterEach(cleanup);
describe("recipient form", () => {
  it("blocks empty recipient data", async () => {
    const submit = vi.fn();
    render(<RecipientForm onSubmit={submit} busy={false} error={null}/>);
    fireEvent.click(screen.getByRole("button",{name:"確認訂單並前往付款"}));
    expect(await screen.findAllByRole("alert")).toHaveLength(4);
    expect(submit).not.toHaveBeenCalled();
  });
  it("submits normalized shipping information", async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    render(<RecipientForm onSubmit={submit} busy={false} error={null}/>);
    for (const [label,value] of [["收件人姓名"," 測試 "],["電子郵件","buyer@example.com"],["手機號碼","0912-345-678"],["收件地址（含縣市、區及門牌）","台北市中正區測試路1號"]]) {
      fireEvent.change(screen.getByLabelText(label),{target:{value}});
    }
    fireEvent.click(screen.getByRole("button",{name:"確認訂單並前往付款"}));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({name:"測試",email:"buyer@example.com",tel:"0912345678",address:"台北市中正區測試路1號"}));
  });
  it("disables editing and duplicate submission while busy", () => {
    render(<RecipientForm onSubmit={vi.fn()} busy={true} error={null}/>);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByLabelText("收件人姓名")).toBeDisabled();
  });
});
