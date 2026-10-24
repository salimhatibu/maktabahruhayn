import { cookies } from "next/headers"
import { LOCALE_COOKIE } from "./config"
import { DEFAULT_LOCALE, isLocale } from "./i18n-shared"

export { LOCALES, DEFAULT_LOCALE, RTL_LOCALES, LOCALE_LABELS, isLocale, isRtl } from "./i18n-shared"
export type { Locale } from "./i18n-shared"
import type { Locale } from "./i18n-shared"

const dictionaries: Record<Locale, Record<string, string>> = {
  en: {
    "nav.home": "Home",
    "nav.books": "Books",
    "nav.search": "Search",
    "nav.cart": "Cart",
    "nav.account": "Account",
    "nav.signin": "Sign In",
    "nav.help": "Help",
    "nav.faq": "FAQ",
    "nav.order_status": "Order Status",
    "nav.wishlist": "Wishlist",
    "nav.contact": "Contact",

    "header.greeting": "Hi, {name}",
    "header.skip": "Skip to content",
    "header.menu": "Menu",
    "header.search_placeholder": "Search books, authors, topics…",

    "product.add_to_cart": "Add to Cart",
    "product.preorder": "Pre-order",
    "product.out_of_stock": "Out of Stock",
    "product.unavailable": "Unavailable in your region",
    "product.notify_me": "Notify me when available",
    "product.in_stock": "In Stock",
    "product.low_stock": "Only {count} left",
    "product.backorder": "Available on backorder",
    "product.save": "Save {percent}%",
    "product.sale_ends": "Sale ends in",
    "product.formats": "Formats",
    "product.see_all": "See All Formats & Editions",
    "product.overview": "Overview",
    "product.details": "Details",
    "product.reviews": "Reviews",
    "product.write_review": "Write a Review",
    "product.by": "By",
    "product.translated_by": "Translated by",
    "product.commentary_by": "Commentary by",
    "product.series": "Series: {name}",
    "product.related": "You May Also Like",
    "product.by_author": "More by {author}",
    "product.recently_viewed": "Recently Viewed",

    "cart.title": "Shopping Cart",
    "cart.empty": "Your cart is empty",
    "cart.continue_shopping": "Continue Shopping",
    "cart.subtotal": "Subtotal",
    "cart.checkout": "Proceed to Checkout",
    "cart.remove": "Remove",
    "cart.quantity": "Qty",

    "footer.copyright": "© {year} {name}. All rights reserved.",
    "footer.shipping_worldwide": "Shipping Worldwide",
    "footer.secure_payments": "Secure Payments",
    "footer.customer_service": "Customer Service",

    "search.results": "{count} results for \"{query}\"",
    "search.no_results": "No results found",
    "search.filters": "Filters",
    "search.sort": "Sort",
    "search.clear": "Clear all",

    "faq.title": "Frequently Asked Questions",
    "faq.search_placeholder": "Search questions…",
    "faq.no_results": "No questions match your search.",
    "faq.all": "All",

    "newsletter.title": "Stay Updated",
    "newsletter.subtitle": "New releases, collections and exclusive offers.",
    "newsletter.placeholder": "Your email address",
    "newsletter.subscribe": "Subscribe",
    "newsletter.success": "You're subscribed!",

    "common.loading": "Loading…",
    "common.error": "Something went wrong",
    "common.back": "Back",
    "common.close": "Close",
    "common.show_more": "Show More",
    "common.show_less": "Show Less",
  },

  ar: {
    "nav.home": "الرئيسية",
    "nav.books": "الكتب",
    "nav.search": "بحث",
    "nav.cart": "السلة",
    "nav.account": "حسابي",
    "nav.signin": "تسجيل الدخول",
    "nav.help": "المساعدة",
    "nav.faq": "الأسئلة الشائعة",
    "nav.order_status": "حالة الطلب",
    "nav.wishlist": "قائمة الرغبات",
    "nav.contact": "اتصل بنا",

    "header.greeting": "مرحباً، {name}",
    "header.skip": "تخطي إلى المحتوى",
    "header.menu": "القائمة",
    "header.search_placeholder": "ابحث عن كتب، مؤلفين، مواضيع…",

    "product.add_to_cart": "أضف إلى السلة",
    "product.preorder": "طلب مسبق",
    "product.out_of_stock": "نفد من المخزون",
    "product.unavailable": "غير متوفر في منطقتك",
    "product.notify_me": "أبلغني عند التوفر",
    "product.in_stock": "متوفر",
    "product.low_stock": "باقي {count} فقط",
    "product.backorder": "متوفر للطلب المسبق",
    "product.save": "وفر {percent}٪",
    "product.sale_ends": "ينتهي العرض خلال",
    "product.formats": "الأشكال",
    "product.see_all": "عرض جميع الأشكال والطبعات",
    "product.overview": "نظرة عامة",
    "product.details": "التفاصيل",
    "product.reviews": "المراجعات",
    "product.write_review": "اكتب مراجعة",
    "product.by": "تأليف",
    "product.translated_by": "ترجمة",
    "product.commentary_by": "تحقيق",
    "product.series": "السلسلة: {name}",
    "product.related": "قد يعجبك أيضاً",
    "product.by_author": "المزيد من {author}",
    "product.recently_viewed": "شوهد مؤخراً",

    "cart.title": "سلة التسوق",
    "cart.empty": "سلتك فارغة",
    "cart.continue_shopping": "متابعة التسوق",
    "cart.subtotal": "المجموع الفرعي",
    "cart.checkout": "إتمام الشراء",
    "cart.remove": "إزالة",
    "cart.quantity": "الكمية",

    "footer.copyright": "© {year} {name}. جميع الحقوق محفوظة.",
    "footer.shipping_worldwide": "شحن عالمي",
    "footer.secure_payments": "مدفوعات آمنة",
    "footer.customer_service": "خدمة العملاء",

    "search.results": "{count} نتيجة لـ \"{query}\"",
    "search.no_results": "لم يتم العثور على نتائج",
    "search.filters": "التصفية",
    "search.sort": "ترتيب",
    "search.clear": "مسح الكل",

    "faq.title": "الأسئلة الشائعة",
    "faq.search_placeholder": "ابحث في الأسئلة…",
    "faq.no_results": "لا توجد أسئلة مطابقة لبحثك.",
    "faq.all": "الكل",

    "newsletter.title": "ابق على اطلاع",
    "newsletter.subtitle": "إصدارات جديدة ومجموعات وعروض حصرية.",
    "newsletter.placeholder": "بريدك الإلكتروني",
    "newsletter.subscribe": "اشترك",
    "newsletter.success": "تم اشتراكك!",

    "common.loading": "جارٍ التحميل…",
    "common.error": "حدث خطأ",
    "common.back": "رجوع",
    "common.close": "إغلاق",
    "common.show_more": "عرض المزيد",
    "common.show_less": "عرض أقل",
  },

  fr: {
    "nav.home": "Accueil",
    "nav.books": "Livres",
    "nav.search": "Rechercher",
    "nav.cart": "Panier",
    "nav.account": "Mon compte",
    "nav.signin": "Se connecter",
    "nav.help": "Aide",
    "nav.faq": "FAQ",
    "nav.order_status": "Suivi de commande",
    "nav.wishlist": "Liste de souhaits",
    "nav.contact": "Contact",

    "header.greeting": "Bonjour, {name}",
    "header.skip": "Aller au contenu",
    "header.menu": "Menu",
    "header.search_placeholder": "Rechercher livres, auteurs, sujets…",

    "product.add_to_cart": "Ajouter au panier",
    "product.preorder": "Précommander",
    "product.out_of_stock": "Rupture de stock",
    "product.unavailable": "Indisponible dans votre région",
    "product.notify_me": "Me prévenir quand disponible",
    "product.in_stock": "En stock",
    "product.low_stock": "Plus que {count} en stock",
    "product.backorder": "Disponible sur commande",
    "product.save": "Économisez {percent} %",
    "product.sale_ends": "Offre se termine dans",
    "product.formats": "Formats",
    "product.see_all": "Voir tous les formats et éditions",
    "product.overview": "Aperçu",
    "product.details": "Détails",
    "product.reviews": "Avis",
    "product.write_review": "Écrire un avis",
    "product.by": "Par",
    "product.translated_by": "Traduit par",
    "product.commentary_by": "Commentaire par",
    "product.series": "Série : {name}",
    "product.related": "Vous aimerez aussi",
    "product.by_author": "Autres de {author}",
    "product.recently_viewed": "Consultés récemment",

    "cart.title": "Panier",
    "cart.empty": "Votre panier est vide",
    "cart.continue_shopping": "Continuer vos achats",
    "cart.subtotal": "Sous-total",
    "cart.checkout": "Passer à la caisse",
    "cart.remove": "Supprimer",
    "cart.quantity": "Qté",

    "footer.copyright": "© {year} {name}. Tous droits réservés.",
    "footer.shipping_worldwide": "Livraison internationale",
    "footer.secure_payments": "Paiements sécurisés",
    "footer.customer_service": "Service client",

    "search.results": "{count} résultats pour « {query} »",
    "search.no_results": "Aucun résultat trouvé",
    "search.filters": "Filtres",
    "search.sort": "Trier",
    "search.clear": "Effacer tout",

    "faq.title": "Foire aux questions",
    "faq.search_placeholder": "Rechercher une question…",
    "faq.no_results": "Aucune question ne correspond à votre recherche.",
    "faq.all": "Tout",

    "newsletter.title": "Restez informé",
    "newsletter.subtitle": "Nouveautés, collections et offres exclusives.",
    "newsletter.placeholder": "Votre adresse email",
    "newsletter.subscribe": "S'abonner",
    "newsletter.success": "Vous êtes abonné !",

    "common.loading": "Chargement…",
    "common.error": "Une erreur est survenue",
    "common.back": "Retour",
    "common.close": "Fermer",
    "common.show_more": "Voir plus",
    "common.show_less": "Voir moins",
  },
}

export async function currentLocale(): Promise<Locale> {
  try {
    const jar = await cookies()
    const raw = jar.get(LOCALE_COOKIE)?.value
    if (raw && isLocale(raw)) return raw
  } catch {
    // middleware or static render — fall back
  }
  return DEFAULT_LOCALE
}

export function t(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const dict = dictionaries[locale] || dictionaries.en
  let text = dict[key] ?? dictionaries.en[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v))
    }
  }
  return text
}

export function getDict(locale: Locale): Record<string, string> {
  return { ...dictionaries.en, ...dictionaries[locale] }
}
