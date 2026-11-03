export { itemsBulkHandler as default } from "@/modules/items/items.api";

// Next.js reads the body-size limit from the route file itself.
export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };
