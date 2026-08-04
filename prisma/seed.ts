import { PrismaClient, Role, ProductStatus, Gender, StockStatus, HomepageSectionType, ShippingZoneType, ShippingCalculationType, CouponType } from "@prisma/client";
import { hashPassword } from "../src/utils/password";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log("🌱 Seeding ATELIER database…");

  // ---- Users -----------------------------------------------------------------
  const adminPassword = await hashPassword("Admin@12345");
  const customerPassword = await hashPassword("Customer@12345");

  const admin = await prisma.user.upsert({
    where: { email: "admin@atelier.example" },
    update: {},
    create: {
      email: "admin@atelier.example",
      passwordHash: adminPassword,
      firstName: "Ayo",
      lastName: "Olawale",
      role: Role.SUPER_ADMIN,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      marketingOptIn: true,
    },
  });

  const customer = await prisma.user.upsert({
    where: { email: "customer@atelier.example" },
    update: {},
    create: {
      email: "customer@atelier.example",
      passwordHash: customerPassword,
      firstName: "Zara",
      lastName: "Bello",
      role: Role.CUSTOMER,
      isEmailVerified: true,
      emailVerifiedAt: new Date(),
      marketingOptIn: true,
    },
  });

  // ---- Categories -------------------------------------------------------------
  const men = await prisma.category.upsert({
    where: { slug: "men" },
    update: {},
    create: { name: "Men", slug: "men", description: "Men's streetwear", isActive: true, isFeatured: true, sortOrder: 1 },
  });
  const women = await prisma.category.upsert({
    where: { slug: "women" },
    update: {},
    create: { name: "Women", slug: "women", description: "Women's streetwear", isActive: true, isFeatured: true, sortOrder: 2 },
  });
  const accessories = await prisma.category.upsert({
    where: { slug: "accessories" },
    update: {},
    create: { name: "Accessories", slug: "accessories", description: "Bags, hats and more", isActive: true, sortOrder: 3 },
  });
  const footwear = await prisma.category.upsert({
    where: { slug: "footwear" },
    update: {},
    create: { name: "Footwear", slug: "footwear", description: "Kicks and slides", isActive: true, sortOrder: 4 },
  });
  const tees = await prisma.category.upsert({
    where: { slug: "tees" },
    update: {},
    create: { name: "Tees", slug: "tees", parentId: men.id, description: "Graphic and oversized tees", isActive: true, sortOrder: 1 },
  });
  const hoodies = await prisma.category.upsert({
    where: { slug: "hoodies" },
    update: {},
    create: { name: "Hoodies", slug: "hoodies", parentId: men.id, description: "Hoodies & sweats", isActive: true, sortOrder: 2 },
  });

  // ---- Warehouse ---------------------------------------------------------------
  const warehouse = await prisma.warehouse.upsert({
    where: { code: "LAG-01" },
    update: {},
    create: {
      name: "Lagos Fulfillment Centre",
      code: "LAG-01",
      address: "14 Admiralty Way, Lekki",
      city: "Lagos",
      country: "NG",
      isActive: true,
    },
  });

  // ---- Collections --------------------------------------------------------------
  const dropOne = await prisma.collection.upsert({
    where: { slug: "noir-drop-001" },
    update: {},
    create: {
      name: "NOIR Drop 001",
      slug: "noir-drop-001",
      description: "The inaugural capsule from the ATELIER NOIR line.",
      isActive: true,
      isFeatured: true,
      sortOrder: 1,
    },
  });

  // ---- Products -----------------------------------------------------------------
  const products = [
    {
      name: "Oversized Graphic Tee",
      slug: "oversized-graphic-tee-black",
      category: tees,
      brand: "ATELIER NOIR",
      basePrice: 85,
      compareAtPrice: 120,
      tags: ["graphic", "oversized", "cotton"],
      colors: ["Black", "White"],
      sizes: ["S", "M", "L", "XL"],
      gender: Gender.MEN,
      status: ProductStatus.PUBLISHED,
      description: "Heavyweight 240gsm cotton tee with a tonal chest graphic and dropped shoulders.",
    },
    {
      name: "Heavyweight Hoodie",
      slug: "heavyweight-hoodie-oat",
      category: hoodies,
      brand: "ATELIER NOIR",
      basePrice: 160,
      compareAtPrice: 210,
      tags: ["hoodie", "heavyweight", "fleece"],
      colors: ["Oat", "Charcoal"],
      sizes: ["S", "M", "L", "XL", "XXL"],
      gender: Gender.MEN,
      status: ProductStatus.PUBLISHED,
      description: "500gsm loopback fleece hoodie with triple-needle stitching.",
    },
    {
      name: "Cargo Utility Pants",
      slug: "cargo-utility-pants-olive",
      category: men,
      brand: "ATELIER NOIR",
      basePrice: 140,
      compareAtPrice: null,
      tags: ["cargo", "utility", "twill"],
      colors: ["Olive", "Black"],
      sizes: ["28", "30", "32", "34", "36"],
      gender: Gender.MEN,
      status: ProductStatus.PUBLISHED,
      description: "Tapered utility cargos in water-repellent twill with articulated knees.",
    },
    {
      name: "5-Panel Trucker Cap",
      slug: "five-panel-trucker-cap",
      category: accessories,
      brand: "ATELIER NOIR",
      basePrice: 45,
      compareAtPrice: null,
      tags: ["cap", "trucker", "accessory"],
      colors: ["Black"],
      sizes: ["One Size"],
      gender: Gender.MEN,
      status: ProductStatus.PUBLISHED,
      description: "Structured 5-panel cap with an embroidered back-tab logo.",
    },
  ] as const;

  const createdProducts: Array<{ id: string; sku: string }> = [];
  let idx = 0;

  for (const p of products) {
    const existing = await prisma.product.findUnique({ where: { slug: p.slug } });
    if (existing) {
      createdProducts.push({ id: existing.id, sku: existing.sku });
      continue;
    }

    const sku = `ATE-N${String(++idx).padStart(4, "0")}`;
    const product = await prisma.product.create({
      data: {
        name: p.name,
        slug: p.slug,
        shortDescription: p.description,
        longDescription: p.description,
        brand: p.brand,
        gender: p.gender,
        tags: [...p.tags],
        sku,
        basePrice: p.basePrice,
        compareAtPrice: p.compareAtPrice ?? undefined,
        currency: "NGN",
        status: p.status,
        publishedAt: new Date(),
        isFeatured: idx <= 3,
        isNewArrival: true,
        rating: 4.5,
        reviewCount: 0,
        images: {
          create: [
            {
              url: `https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=1200&q=80`,
              thumbUrl: `https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&q=60`,
              altText: p.name,
              kind: "IMAGE" as const,
              isThumbnail: true,
              sortOrder: 0,
            },
          ],
        },
        categories: { create: [{ categoryId: p.category.id }] },
        variants: {
          create: p.colors.flatMap((color, ci) =>
            p.sizes.map((size) => ({
              sku: `${sku}-${ci + 1}-${size.replace(/\s+/g, "")}`,
              color,
              size,
              price: p.basePrice,
              compareAtPrice: p.compareAtPrice ?? undefined,
              weightKg: 0.5,
              isActive: true,
              isDefault: ci === 0 && size === p.sizes[0],
              inventory: {
                create: {
                  quantity: 25,
                  lowStockThreshold: 5,
                  allowBackorder: false,
                  status: StockStatus.IN_STOCK,
                  warehouseId: warehouse.id,
                },
              },
            })),
          ),
        },
      },
      include: { variants: true },
    });

    createdProducts.push({ id: product.id, sku });
  }

  // Link first two products to the collection.
  if (createdProducts.length >= 2) {
    await prisma.collectionProduct.upsert({
      where: { collectionId_productId: { collectionId: dropOne.id, productId: createdProducts[0]!.id } },
      update: {},
      create: { collectionId: dropOne.id, productId: createdProducts[0]!.id, sortOrder: 0 },
    });
    await prisma.collectionProduct.upsert({
      where: { collectionId_productId: { collectionId: dropOne.id, productId: createdProducts[1]!.id } },
      update: {},
      create: { collectionId: dropOne.id, productId: createdProducts[1]!.id, sortOrder: 1 },
    });
  }

  // ---- Shipping -----------------------------------------------------------------
  const nigeriaZone = await prisma.shippingZone.upsert({
    where: { id: "seed-ng-zone" },
    update: {},
    create: {
      id: "seed-ng-zone",
      name: "Nigeria Domestic",
      type: ShippingZoneType.COUNTRY,
      countries: ["NG"],
      isActive: true,
      methods: {
        create: [
          {
            name: "Standard Delivery (Lagos)",
            code: "NG-STD-LAG",
            type: ShippingCalculationType.FLAT,
            baseRate: 2500,
            freeAbove: 150000,
            estimatedDaysMin: 1,
            estimatedDaysMax: 3,
            isActive: true,
            sortOrder: 1,
          },
          {
            name: "Nationwide Standard",
            code: "NG-STD",
            type: ShippingCalculationType.FLAT,
            baseRate: 4000,
            freeAbove: 150000,
            estimatedDaysMin: 3,
            estimatedDaysMax: 7,
            isActive: true,
            sortOrder: 2,
          },
          {
            name: "Express",
            code: "NG-EXP",
            type: ShippingCalculationType.FLAT,
            baseRate: 8000,
            estimatedDaysMin: 1,
            estimatedDaysMax: 2,
            isActive: true,
            sortOrder: 3,
          },
        ],
      },
    },
  });

  // ---- Coupons -------------------------------------------------------------------
  await prisma.coupon.upsert({
    where: { code: "WELCOME10" },
    update: {},
    create: {
      code: "WELCOME10",
      type: CouponType.PERCENTAGE,
      value: 10,
      minPurchaseAmount: 5000,
      isActive: true,
      appliesTo: "ALL",
      perUserLimit: 1,
      expiresAt: new Date(Date.now() + 90 * 86_400_000),
    },
  });
  await prisma.coupon.upsert({
    where: { code: "FREESHIP" },
    update: {},
    create: {
      code: "FREESHIP",
      type: CouponType.FREE_SHIPPING,
      value: 0,
      minPurchaseAmount: 100000,
      freeShippingOnly: true,
      isActive: true,
      appliesTo: "ALL",
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
    },
  });

  // ---- CMS ------------------------------------------------------------------------
  await prisma.storeSetting.upsert({
    where: { key: "store.currency" },
    update: { value: "NGN" },
    create: { key: "store.currency", value: "NGN", group: "general", description: "Default store currency" },
  });
  await prisma.storeSetting.upsert({
    where: { key: "store.taxRatePercent" },
    update: { value: 7.5 },
    create: { key: "store.taxRatePercent", value: 7.5, group: "tax", description: "VAT rate applied at checkout" },
  });
  await prisma.storeSetting.upsert({
    where: { key: "store.freeShippingThreshold" },
    update: { value: 150000 },
    create: { key: "store.freeShippingThreshold", value: 150000, group: "shipping", description: "Free shipping above this subtotal (major units)" },
  });

  await prisma.homepageContent.upsert({
    where: { sectionKey: "hero-primary" },
    update: {},
    create: {
      sectionKey: "hero-primary",
      sectionType: HomepageSectionType.HERO_BANNER,
      title: "NOIR Drop 001",
      subtitle: "Limited-edition luxury streetwear — this is the first capsule.",
      content: { ctaText: "Shop the Drop", ctaUrl: "/collections/noir-drop-001", mediaUrl: null },
      status: "ACTIVE",
      sortOrder: 1,
      publishedAt: new Date(),
    },
  });
  await prisma.homepageContent.upsert({
    where: { sectionKey: "featured-products" },
    update: {},
    create: {
      sectionKey: "featured-products",
      sectionType: HomepageSectionType.FEATURED_PRODUCTS,
      title: "Featured Pieces",
      content: { limit: 8 },
      status: "ACTIVE",
      sortOrder: 2,
      publishedAt: new Date(),
    },
  });

  await prisma.announcementBar.upsert({
    where: { id: "seed-announcement" },
    update: {},
    create: {
      id: "seed-announcement",
      message: "Free nationwide shipping on orders over ₦150,000",
      isActive: true,
    },
  });

  await prisma.navigationItem.createMany({
    data: [
      { label: "Shop Men", type: "CATEGORY", refId: men.id, url: "/shop?gender=MEN", sortOrder: 1 },
      { label: "Shop Women", type: "CATEGORY", refId: women.id, url: "/shop?gender=WOMEN", sortOrder: 2 },
      { label: "Footwear", type: "CATEGORY", refId: footwear.id, url: "/shop?category=footwear", sortOrder: 3 },
      { label: "Accessories", type: "CATEGORY", refId: accessories.id, url: "/shop?category=accessories", sortOrder: 4 },
      { label: "NOIR Drop 001", type: "COLLECTION", refId: dropOne.id, url: "/collections/noir-drop-001", sortOrder: 5 },
      { label: "About", type: "PAGE", url: "/pages/about", sortOrder: 6 },
    ],
    skipDuplicates: true,
  });

  await prisma.page.upsert({
    where: { slug: "about" },
    update: {},
    create: {
      title: "About ATELIER",
      slug: "about",
      body: "<p>ATELIER is a premium luxury streetwear house. We design limited-edition pieces for the modern wardrobe.</p>",
      metaTitle: "About — ATELIER",
      isPublished: true,
      publishedAt: new Date(),
    },
  });

  console.log(`✅ Seeded: admin=${admin.email}, customer=${customer.email}, products=${createdProducts.length}, zone=${nigeriaZone.name}`);
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
