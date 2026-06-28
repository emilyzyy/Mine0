import { BaselineService } from "./baseline_service.ts";

const objective =
  process.argv.slice(2).join(" ").trim() ||
  "Gather wood, craft a crafting table, and obtain a wooden pickaxe";

const service = new BaselineService();
const result = await service.compare(objective, "mineflayer");

console.log(JSON.stringify(result, null, 2));
