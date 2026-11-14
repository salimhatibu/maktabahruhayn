// County and county-government sub-county (constituency) names from the IEBC hierarchy.
// Source data: https://github.com/nicanor-korir/kenya-regions (MIT); underlying hierarchy: IEBC.

export type KenyaCounty = {
  code: string
  name: string
  subCounties: readonly string[]
}

export const KENYA_COUNTIES = [
  {
    "code": "mombasa",
    "name": "Mombasa",
    "subCounties": [
      "Changamwe",
      "Jomvu",
      "Kisauni",
      "Nyali",
      "Likoni",
      "Mvita"
    ]
  },
  {
    "code": "kwale",
    "name": "Kwale",
    "subCounties": [
      "Msambweni",
      "Lungalunga",
      "Matuga",
      "Kinango"
    ]
  },
  {
    "code": "kilifi",
    "name": "Kilifi",
    "subCounties": [
      "Kilifi North",
      "Kilifi South",
      "Kaloleni",
      "Rabai",
      "Ganze",
      "Malindi",
      "Magarini"
    ]
  },
  {
    "code": "tana-river",
    "name": "Tana River",
    "subCounties": [
      "Garsen",
      "Galole",
      "Bura"
    ]
  },
  {
    "code": "lamu",
    "name": "Lamu",
    "subCounties": [
      "Lamu East",
      "Lamu West"
    ]
  },
  {
    "code": "taita-taveta",
    "name": "Taita-Taveta",
    "subCounties": [
      "Taveta",
      "Wundanyi",
      "Mwatate",
      "Voi"
    ]
  },
  {
    "code": "garissa",
    "name": "Garissa",
    "subCounties": [
      "Garissa Township",
      "Balambala",
      "Lagdera",
      "Dadaab",
      "Fafi",
      "Ijara"
    ]
  },
  {
    "code": "wajir",
    "name": "Wajir",
    "subCounties": [
      "Wajir North",
      "Wajir East",
      "Tarbaj",
      "Wajir West",
      "Eldas",
      "Wajir South"
    ]
  },
  {
    "code": "mandera",
    "name": "Mandera",
    "subCounties": [
      "Mandera West",
      "Banissa",
      "Mandera North",
      "Mandera South",
      "Mandera East",
      "Lafey"
    ]
  },
  {
    "code": "marsabit",
    "name": "Marsabit",
    "subCounties": [
      "Moyale",
      "North Horr",
      "Saku",
      "Laisamis"
    ]
  },
  {
    "code": "isiolo",
    "name": "Isiolo",
    "subCounties": [
      "Isiolo North",
      "Isiolo South"
    ]
  },
  {
    "code": "meru",
    "name": "Meru",
    "subCounties": [
      "Igembe South",
      "Igembe Central",
      "Igembe North",
      "Tigania West",
      "Tigania East",
      "North Imenti",
      "Buuri",
      "Central Imenti",
      "South Imenti"
    ]
  },
  {
    "code": "tharaka-nithi",
    "name": "Tharaka-Nithi",
    "subCounties": [
      "Maara",
      "Chuka/Igambang'ombe",
      "Tharaka"
    ]
  },
  {
    "code": "embu",
    "name": "Embu",
    "subCounties": [
      "Manyatta",
      "Runyenjes",
      "Mbeere South",
      "Mbeere North"
    ]
  },
  {
    "code": "kitui",
    "name": "Kitui",
    "subCounties": [
      "Mwingi North",
      "Mwingi West",
      "Mwingi Central",
      "Kitui West",
      "Kitui Rural",
      "Kitui Central",
      "Kitui East",
      "Kitui South"
    ]
  },
  {
    "code": "machakos",
    "name": "Machakos",
    "subCounties": [
      "Masinga",
      "Yatta",
      "Kangundo",
      "Matungulu",
      "Kathiani",
      "Mavoko",
      "Machakos Town",
      "Mwala"
    ]
  },
  {
    "code": "makueni",
    "name": "Makueni",
    "subCounties": [
      "Mbooni",
      "Kilome",
      "Kaiti",
      "Makueni",
      "Kibwezi West",
      "Kibwezi East"
    ]
  },
  {
    "code": "nyandarua",
    "name": "Nyandarua",
    "subCounties": [
      "Kinangop",
      "Kipipiri",
      "Ol Kalou",
      "Ol Jorok",
      "Ndaragwa"
    ]
  },
  {
    "code": "nyeri",
    "name": "Nyeri",
    "subCounties": [
      "Tetu",
      "Kieni",
      "Mathira",
      "Othaya",
      "Mukurweini",
      "Nyeri Town"
    ]
  },
  {
    "code": "kirinyaga",
    "name": "Kirinyaga",
    "subCounties": [
      "Mwea",
      "Gichugu",
      "Ndia",
      "Kirinyaga Central"
    ]
  },
  {
    "code": "muranga",
    "name": "Murang'a",
    "subCounties": [
      "Kangema",
      "Mathioya",
      "Kiharu",
      "Kigumo",
      "Maragwa",
      "Kandara",
      "Gatanga"
    ]
  },
  {
    "code": "kiambu",
    "name": "Kiambu",
    "subCounties": [
      "Gatundu South",
      "Gatundu North",
      "Juja",
      "Thika Town",
      "Ruiru",
      "Githunguri",
      "Kiambu",
      "Kiambaa",
      "Kabete",
      "Kikuyu",
      "Limuru",
      "Lari"
    ]
  },
  {
    "code": "turkana",
    "name": "Turkana",
    "subCounties": [
      "Turkana North",
      "Turkana West",
      "Turkana Central",
      "Loima",
      "Turkana South",
      "Turkana East"
    ]
  },
  {
    "code": "west-pokot",
    "name": "West Pokot",
    "subCounties": [
      "Kapenguria",
      "Sigor",
      "Kacheliba",
      "Pokot South"
    ]
  },
  {
    "code": "samburu",
    "name": "Samburu",
    "subCounties": [
      "Samburu West",
      "Samburu North",
      "Samburu East"
    ]
  },
  {
    "code": "trans-nzoia",
    "name": "Trans Nzoia",
    "subCounties": [
      "Kwanza",
      "Endebess",
      "Saboti",
      "Kiminini",
      "Cherangany"
    ]
  },
  {
    "code": "uasin-gishu",
    "name": "Uasin Gishu",
    "subCounties": [
      "Soy",
      "Turbo",
      "Moiben",
      "Ainabkoi",
      "Kapseret",
      "Kesses"
    ]
  },
  {
    "code": "elgeyo-marakwet",
    "name": "Elgeyo-Marakwet",
    "subCounties": [
      "Marakwet East",
      "Marakwet West",
      "Keiyo North",
      "Keiyo South"
    ]
  },
  {
    "code": "nandi",
    "name": "Nandi",
    "subCounties": [
      "Tinderet",
      "Aldai",
      "Nandi Hills",
      "Chesumei",
      "Emgwen",
      "Mosop"
    ]
  },
  {
    "code": "baringo",
    "name": "Baringo",
    "subCounties": [
      "Tiaty",
      "Baringo North",
      "Baringo Central",
      "Baringo South",
      "Mogotio",
      "Eldama Ravine"
    ]
  },
  {
    "code": "laikipia",
    "name": "Laikipia",
    "subCounties": [
      "Laikipia West",
      "Laikipia East",
      "Laikipia North"
    ]
  },
  {
    "code": "nakuru",
    "name": "Nakuru",
    "subCounties": [
      "Molo",
      "Njoro",
      "Naivasha",
      "Gilgil",
      "Kuresoi South",
      "Kuresoi North",
      "Subukia",
      "Rongai",
      "Bahati",
      "Nakuru Town West",
      "Nakuru Town East"
    ]
  },
  {
    "code": "narok",
    "name": "Narok",
    "subCounties": [
      "Kilgoris",
      "Emurua Dikirr",
      "Narok North",
      "Narok East",
      "Narok South",
      "Narok West"
    ]
  },
  {
    "code": "kajiado",
    "name": "Kajiado",
    "subCounties": [
      "Kajiado North",
      "Kajiado Central",
      "Kajiado East",
      "Kajiado West",
      "Kajiado South"
    ]
  },
  {
    "code": "kericho",
    "name": "Kericho",
    "subCounties": [
      "Kipkelion East",
      "Kipkelion West",
      "Ainamoi",
      "Bureti",
      "Belgut",
      "Sigowet/Soin"
    ]
  },
  {
    "code": "bomet",
    "name": "Bomet",
    "subCounties": [
      "Sotik",
      "Chepalungu",
      "Bomet East",
      "Bomet Central",
      "Konoin"
    ]
  },
  {
    "code": "kakamega",
    "name": "Kakamega",
    "subCounties": [
      "Lugari",
      "Likuyani",
      "Malava",
      "Lurambi",
      "Navakholo",
      "Mumias West",
      "Mumias East",
      "Matungu",
      "Butere",
      "Khwisero",
      "Shinyalu",
      "Ikolomani"
    ]
  },
  {
    "code": "vihiga",
    "name": "Vihiga",
    "subCounties": [
      "Vihiga",
      "Sabatia",
      "Hamisi",
      "Luanda",
      "Emuhaya"
    ]
  },
  {
    "code": "bungoma",
    "name": "Bungoma",
    "subCounties": [
      "Mt.Elgon",
      "Sirisia",
      "Kabuchai",
      "Bumula",
      "Kanduyi",
      "Webuye East",
      "Webuye West",
      "Kimilili",
      "Tongaren"
    ]
  },
  {
    "code": "busia",
    "name": "Busia",
    "subCounties": [
      "Teso North",
      "Teso South",
      "Nambale",
      "Matayos",
      "Butula",
      "Funyula",
      "Budalangi"
    ]
  },
  {
    "code": "siaya",
    "name": "Siaya",
    "subCounties": [
      "Ugenya",
      "Ugunja",
      "Alego Usonga",
      "Gem",
      "Bondo",
      "Rarieda"
    ]
  },
  {
    "code": "kisumu",
    "name": "Kisumu",
    "subCounties": [
      "Kisumu East",
      "Kisumu West",
      "Kisumu Central",
      "Seme",
      "Nyando",
      "Muhoroni",
      "Nyakach"
    ]
  },
  {
    "code": "homa-bay",
    "name": "Homa Bay",
    "subCounties": [
      "Kasipul",
      "Kabondo Kasipul",
      "Karachuonyo",
      "Rangwe",
      "Homa Bay Town",
      "Ndhiwa",
      "Suba North",
      "Suba South"
    ]
  },
  {
    "code": "migori",
    "name": "Migori",
    "subCounties": [
      "Rongo",
      "Awendo",
      "Suna East",
      "Suna West",
      "Uriri",
      "Nyatike",
      "Kuria West",
      "Kuria East"
    ]
  },
  {
    "code": "kisii",
    "name": "Kisii",
    "subCounties": [
      "Bonchari",
      "South Mugirango",
      "Bomachoge Borabu",
      "Bobasi",
      "Bomachoge Chache",
      "Nyaribari Masaba",
      "Nyaribari Chache",
      "Kitutu Chache North",
      "Kitutu Chache South"
    ]
  },
  {
    "code": "nyamira",
    "name": "Nyamira",
    "subCounties": [
      "Kitutu Masaba",
      "West Mugirango",
      "North Mugirango",
      "Borabu"
    ]
  },
  {
    "code": "nairobi",
    "name": "Nairobi",
    "subCounties": [
      "Westlands",
      "Dagoretti North",
      "Dagoretti South",
      "Langata",
      "Kibra",
      "Roysambu",
      "Kasarani",
      "Ruaraka",
      "Embakasi South",
      "Embakasi North",
      "Embakasi Central",
      "Embakasi East",
      "Embakasi West",
      "Makadara",
      "Kamukunji",
      "Starehe",
      "Mathare"
    ]
  }
] as const satisfies readonly KenyaCounty[]

export function findKenyaCounty(value: string | null | undefined): (typeof KENYA_COUNTIES)[number] | null {
  const normalized = value?.trim().toLowerCase().replace(/\s+county$/, "")
  if (!normalized) return null
  return KENYA_COUNTIES.find((county) => county.code === normalized || county.name.toLowerCase() === normalized) ?? null
}

export function findKenyaSubCounty(county: (typeof KENYA_COUNTIES)[number] | null, value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  if (!county || !normalized) return null
  return county.subCounties.find((name) => name.toLowerCase() === normalized) ?? null
}
