# Zamonaviy Kasblar CRM

Yangi alohida CRM ilovasi. Interfeys sodda va ikki formatga mos:

- Kompyuterda chap menyu va keng ish maydoni.
- Telefonda pastki menyu, bir ustunli kartalar va qulay to‘ldiriladigan oynalar.
- Minimal, ChatGPT uslubidan ilhomlangan neytral dizayn.

## Funksiyalar

- Telegram Mini App orqali kirish. Kirish huquqini mavjud `crm-telegram-login` Edge Function tekshiradi.
- Rahbar uchun vakansiya arizalari: qidiruv, bosqich, telefon orqali qo‘ng‘iroq va ichki eslatma.
- Blogerlar bo‘limi: biznes, ochiq telefon manbasi, profil, reklama postiga havola va sana; bir xil post URL yangilanadi.
- TV-shou arizalari: brend-feys va mobilograf toifalari, telefon, portfel hamda tanlov bosqichlari.
- Maydon va ko‘rish/tahrirlash huquqlarini tanlab shaxsiy bo‘limlar yaratish.
- Shartnoma egasi uchun alohida imzolash sahifasi.
- Supabase RLS. Brauzerdagi publishable key hech qachon service-role key bo‘lmaydi.

## Ma’lumotlar va xavfsizlik

`index.html` ichida faqat Supabase publishable key ishlatiladi. Service-role key, Telegram bot tokeni va boshqa maxfiy kalitlar ilovaga kiritilmaydi. Nomzod ma’lumotlarini ko‘rish va o‘zgartirish RLS orqali egaga cheklangan.

Nomzodlarning ichki bosqichi va eslatmalarini saqlash uchun quyidagi migratsiyani Supabase SQL Editor’da ko‘rib chiqib, alohida qo‘llash kerak:

`supabase/migrations/20261012_meta_admin_leads_crm_fields.sql`

Migratsiya CRM egasiga faqat `pipeline_status` va `crm_note` ustunlarini yangilashga ruxsat beradi. Boshqa ustunlar va mavjud kirish cheklovlari o‘zgarmaydi. Migratsiya GitHub PR tayyorlanishi bilan avtomatik qo‘llanmaydi.

## Yangi asosiy bo‘limlar

CRM endi uchta asosiy bo‘limdan iborat: rahbar uchun vakansiya arizalari, blogerlarning mahalliy biznes reklamasi va TV-shou arizalari. Shuningdek, foydalanuvchi maydonlar va ruxsatlarni tanlab yangi bo‘lim yaratishi mumkin; RU / UZ almashtirgichi mavjud.

Yangi bo‘limlar uchun `supabase/migrations/20261012_crm_core_sections.sql` migratsiyasini `20261012_meta_admin_leads_crm_fields.sql` migratsiyasidan keyin Supabase SQL Editor’da alohida qo‘llash kerak. U blogerlar va reklama, shou arizalari, foydalanuvchi bo‘limlari hamda rollar jadvallari va RLS qoidalarini yaratadi. HR arizalariga faqat rahbar kira oladi. Mavjud `private.is_crm_owner()` foydalanuvchisi rahbar deb olinadi; qo‘shimcha rahbarni `crm_members` jadvaliga egasi qo‘shishi kerak.

Instagram Meta API ulanmaydi. Chrome’da ikki haftada bir marta ruxsatli qidiruv o‘tkazib, oxirgi 7 kunlik natijalarni Excel faylida CRM’ga yuklash rejalashtirilgan. CRM `.xlsx`, `.xls` yoki `.csv` faylining birinchi varag‘ini o‘qib, biznes, telefon, telefon manbasi, hudud, bloger, post havolasi, sana va reklama dalilini oladi. Oxirgi 7 kundan tashqaridagi yoki sanasi yo‘q satrlar import qilinmaydi. Bir xil profil va biznes birlashtiriladi; bir xil post URL yangilanadi va tekshiruv holati saqlanadi. Excel faylining o‘zi saqlanmaydi. Captcha yoki login so‘ralsa, qidiruvni qo‘lda davom ettirish kerak; chetlab o‘tish yo‘q.

Fayl maydonlari hozircha qiymat yoki havolani saqlaydi; yopiq Storage yuklash oqimi keyingi bosqichda ulanadi.

## Ishga tushirish

Bu oddiy statik ilova. `crm/` papkasini GitHub Pages orqali chiqarish mumkin; Telegram Mini App URL manziliga saytning `/crm/` yo‘lini ko‘rsatish kerak. Amaldagi Telegram bot tugmasi hozircha o‘zgartirilmagan.

Pages manzili ishlatilishidan oldin uni `crm-telegram-login` va `order-link` Edge Function’larining ruxsat etilgan CORS originlari bilan mosligini tekshiring. Yangi origin kerak bo‘lsa, backend CORS ro‘yxatiga qo‘shib, alohida tekshiruvdan so‘ng chiqarish lozim.

Supabase va arizachilar ma’lumotlari loyihaning tasdiqlangan O‘zbekiston hududida joylashganini tekshirmasdan production’da ishga tushirmang.
