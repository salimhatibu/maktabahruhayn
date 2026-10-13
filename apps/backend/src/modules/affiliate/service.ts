import { MedusaService } from "@medusajs/framework/utils"
import { Affiliate } from "./models/affiliate"

class AffiliateModuleService extends MedusaService({ Affiliate }) {}

export default AffiliateModuleService
