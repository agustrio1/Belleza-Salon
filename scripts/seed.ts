import "dotenv/config";
import { db } from "../app/db/index.server";
import {
  businessHours,
  businessSettings,
  services,
  users,
} from "../app/db/schema";
import { hashPassword } from "../app/lib/password.server";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 10) {
    throw new Error(
      "Isi SEED_ADMIN_EMAIL dan SEED_ADMIN_PASSWORD (min. 10 karakter) di .env"
    );
  }

  await db
    .insert(users)
    .values({
      email,
      name: "Admin Belleza",
      passwordHash: await hashPassword(password),
    })
    .onConflictDoNothing();

  await db
    .insert(businessSettings)
    .values({
      id: 1,
      name: "Belleza Salon",
      tagline: "Perawatan kecantikan dengan reservasi online yang mudah.",
      address: "Alamat demo (data simulasi)",
      phone: "",
      slotIntervalMinutes: 30,
      minLeadMinutes: 60,
    })
    .onConflictDoNothing();

  // 0 = Minggu ... 6 = Sabtu
  await db
    .insert(businessHours)
    .values(
      [0, 1, 2, 3, 4, 5, 6].map((day) => ({
        dayOfWeek: day,
        openTime: "09:00",
        closeTime: "19:00",
        isClosed: day === 0,
      }))
    )
    .onConflictDoNothing();

  await db
    .insert(services)
    .values([
      { slug: "facial-basic", name: "Facial Basic", description: "Pembersihan wajah dasar untuk kulit yang terasa segar.", price: 150000, durationMinutes: 60, sortOrder: 1 },
      { slug: "deep-cleansing-facial", name: "Deep Cleansing Facial", description: "Pembersihan wajah lebih mendalam, cocok untuk kulit yang butuh perawatan rutin.", price: 200000, durationMinutes: 75, sortOrder: 2 },
      { slug: "hair-styling", name: "Hair Styling", description: "Penataan rambut untuk acara harian maupun spesial.", price: 100000, durationMinutes: 45, sortOrder: 3 },
      { slug: "hair-treatment", name: "Hair Treatment", description: "Perawatan untuk menjaga rambut tetap sehat dan lembut.", price: 180000, durationMinutes: 60, sortOrder: 4 },
      { slug: "manicure", name: "Manicure", description: "Perawatan dan perapian kuku tangan.", price: 80000, durationMinutes: 45, sortOrder: 5 },
      { slug: "pedicure", name: "Pedicure", description: "Perawatan dan perapian kuku kaki.", price: 100000, durationMinutes: 60, sortOrder: 6 },
      { slug: "eyebrow-treatment", name: "Eyebrow Treatment", description: "Perapian dan pembentukan alis.", price: 75000, durationMinutes: 30, sortOrder: 7 },
      { slug: "makeup", name: "Makeup", description: "Riasan wajah untuk berbagai acara.", price: 350000, durationMinutes: 120, sortOrder: 8 },
    ])
    .onConflictDoNothing();

  console.log("Seed selesai.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});