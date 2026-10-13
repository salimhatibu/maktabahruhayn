import { Module } from "@medusajs/framework/utils"
import TypesenseModuleService from "./service"

export const TYPESENSE_MODULE = "typesense"

export default Module(TYPESENSE_MODULE, {
  service: TypesenseModuleService,
})
