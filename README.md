# Zamonaviy Kasblar CRM

Yangi alohida CRM ilovasi. Interfeys sodda va ikki formatga mos:

- Kompyuterda chap menyu va keng ish maydoni.
- Telefonda pastki menyu, bir ustunli kartalar va qulay to‘ldiriladigan oynalar.
- Minimal, ChatGPT uslubidan ilhomlangan neytral dizayn.

## Funksiyalar

- Oddiy brauzer orqali kirish: rahbar mavjud PIN bilan, admin esa Telegram rahbari tasdiqlagach beriladigan bir martalik havola bilan kiradi.
- Rahbar uchun vakansiya arizalari: qidiruv, bosqich, telefon orqali qo‘ng‘iroq va ichki eslatma.
- Blogerlar bo‘limi: biznes, ochiq telefon manbasi, profil, reklama postiga havola va sana; bir xil post URL yangilanadi.
- TV-shou arizalari: brend-feys va mobilograf toifalari, telefon, portfel hamda tanlov bosqichlari.
- Maydon va ko‘rish/tahrirlash huquqlarini tanlab shaxsiy bo‘limlar yaratish.
- Shartnoma egasi uchun alohida imzolash sahifasi.
- Supabase RLS. Brauzerdagi publishable key hech qachon service-role key bo‘lmaydi.

## Ma’lumotlar va xavfsizlik

`index.html` ichida faqat Supabase publishable key ishlatiladi. Service-role key, Telegram bot tokeni va boshqa maxfiy kalitlar ilovaga kiritilmaydi. HR arizalarini ko‘rish va o‘zgartirish faqat rahbar roliga ochiq; boshqa bo‘limlar tasdiqlangan adminlarga ochiq. Admin havolasi 5 daqiqada tugaydi, bir marta ishlaydi va bazada faqat xesh saqlanadi.

Nomzodlarning ichki bosqichi va eslatmalarini saqlash uchun quyidagi migratsiya qo‘llanadi:

`supabase/migrations/20261012_meta_admin_leads_crm_fields.sql`

Migratsiya CRM egasiga faqat `pipeline_status` va `crm_note` ustunlarini yangilashga ruxsat beradi. Boshqa ustunlar va mavjud kirish cheklovlari o‘zgarmaydi. Migratsiya GitHub PR tayyorlanishi bilan avtomatik qo‘llanmaydi.

## Yangi asosiy bo‘limlar

CRM endi uchta asosiy bo‘limdan iborat: rahbar uchun vakansiya arizalari, blogerlarning mahalliy biznes reklamasi va TV-shou arizalari. Shuningdek, foydalanuvchi maydonlar va ruxsatlarni tanlab yangi bo‘lim yaratishi mumkin; RU / UZ almashtirgichi mavjud.

Yangi bo‘limlar uchun `supabase/migrations/20261012_crm_core_sections.sql` migratsiyasini `20261012_meta_admin_leads_crm_fields.sql` migratsiyasidan keyin qo‘llang. `20261012_crm_browser_access.sql` Telegram orqali tasdiqlangan foydalanuvchilarni shaxsiy CRM sessiyasiga bog‘laydi va HR uchun rahbar tekshiruvini saqlaydi. Bot tasdiqlangan adminlarga 5 daqiqa ichida ishlaydigan, bir marta foydalaniladigan brauzer havolasini yuboradi. Rahbar PIN bilan kiradi.

Instagram Meta API ulanmaydi. Chrome’da ikki haftada bir marta ruxsatli qidiruv o‘tkazib, oxirgi 7 kunlik natijalarni Excel faylida CRM’ga yuklash rejalashtirilgan. CRM `.xlsx`, `.xls` yoki `.csv` faylining birinchi varag‘ini o‘qib, biznes, telefon, telefon manbasi, hudud, bloger, post havolasi, sana va reklama dalilini oladi. Oxirgi 7 kundan tashqaridagi yoki sanasi yo‘q satrlar import qilinmaydi. Bir xil profil va biznes birlashtiriladi; bir xil post URL yangilanadi va tekshiruv holati saqlanadi. Excel faylining o‘zi saqlanmaydi. Captcha yoki login so‘ralsa, qidiruvni qo‘lda davom ettirish kerak; chetlab o‘tish yo‘q.

Fayl maydonlari hozircha qiymat yoki havolani saqlaydi; yopiq Storage yuklash oqimi keyingi bosqichda ulanadi.

## Ishga tushirish

Bu oddiy statik ilova. `crm-public-site/` fayllari GitHub Pages ildiziga chiqariladi. Telegram botidagi CRM tugmasi oddiy veb-havolani ochadi; Telegram Mini App ishlatilmaydi.

`crm-browser-login`, `crm-web-login` va `order-link` funksiyalarida GitHub Pages originiga ruxsat bor. CRM Supabase loyihasining mavjud Frankfurt (`eu-central-1`) hududida ishlaydi.
