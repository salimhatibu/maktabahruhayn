import { Module } from "@medusajs/framework/utils"
import FxModuleService from "./service"

export const FX_MODULE = "fx"

export default Module(FX_MODULE, {
  service: FxModuleService,
})
