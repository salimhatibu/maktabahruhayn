import { MedusaService } from "@medusajs/framework/utils"
import { PaymentRequest } from "./models/payment-request"

class PaymentRequestModuleService extends MedusaService({ PaymentRequest }) {}

export default PaymentRequestModuleService
