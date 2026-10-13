import { MedusaService } from "@medusajs/framework/utils"
import { Book } from "./models/book"

class BookModuleService extends MedusaService({
  Book,
}) {}

export default BookModuleService
