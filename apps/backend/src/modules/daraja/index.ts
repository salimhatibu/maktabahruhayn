import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import DarajaPaymentProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [DarajaPaymentProviderService],
})
