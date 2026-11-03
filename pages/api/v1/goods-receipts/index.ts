import { withApi } from "@/server/middleware/authenticate";
import { listGoodsReceipts, receiveGoods } from "@/server/services/procurement.service";
import { goodsReceiptSchema, listQuery } from "@/server/validators/procurement.validators";
import { created, ok } from "@/lib/api-response";
import { parse } from "@/lib/validation";

export default withApi({
  GET: {
    permission: ["procurement.manage", "procurement.receive"],
    handler: async (req, res) => {
      const q = parse(listQuery, req.query);
      const { items, total } = await listGoodsReceipts(q);
      ok(res, items, "Goods receipts", { page: q.page, limit: q.limit, total });
    },
  },
  POST: {
    permission: "procurement.receive",
    handler: async (req, res, { user, correlationId }) => {
      const r = await receiveGoods(user, parse(goodsReceiptSchema, req.body), correlationId);
      const assets = r.assetTags.length ? ` · ${r.assetTags.length} asset(s) registered` : "";
      created(res, r, `${r.grnNumber} recorded${assets}`);
    },
  },
});
