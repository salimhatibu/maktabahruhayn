import { Module } from "@medusajs/framework/utils"
import PaymentRequestModuleService from "./service"

export const PAYMENT_REQUEST_MODULE = "paymentRequest"

export default Module(PAYMENT_REQUEST_MODULE, { service: PaymentRequestModuleService })
