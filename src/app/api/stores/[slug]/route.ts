import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  requireUser,
  parseCapabilities,
  serializeCapabilities,
} from "@/lib/auth";
import { safeJsonParse } from "@/lib/safe-json";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const vendor = await db.vendorProfile.findUnique({
    where: { slug },
    include: {
      // Cap product list at 100 to keep responses performant
      products: {
        orderBy: { createdAt: "desc" },
        take: 100,
      },
    },
  });

  if (!vendor) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  // Check if caller is authenticated and owns this store
  let currentUser: { id: string } | null = null;
  try {
    currentUser = await requireUser();
  } catch {
    // Guest or unauthenticated caller
    currentUser = null;
  }

  const isOwner = currentUser?.id === vendor.userId;

  // Visibility gate: Block only if PRIVATE and caller is not the owner
  if (vendor.visibility === "PRIVATE" && !isOwner) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const products = vendor.products.map((p) => ({
    id: p.id,
    vendorId: p.vendorId,
    vendorName: vendor.businessName,
    vendorSlug: vendor.slug,
    name: p.name,
    description: p.description,
    price: p.price,
    compareAtPrice: p.compareAtPrice ?? undefined,
    images: safeJsonParse<string[]>(p.images, []),
    category: p.category,
    condition: p.condition ?? undefined,
    stock: p.stock,
    rating: p.rating,
    reviewCount: p.reviewCount,
    location: p.location,
    createdAt: p.createdAt.toISOString(),
    tags: safeJsonParse<string[]>(p.tags, []),
  }));

  return NextResponse.json({
    vendor: {
      id: vendor.id,
      userId: vendor.userId,
      businessName: vendor.businessName,
      slug: vendor.slug,
      description: vendor.description,
      category: vendor.category,
      logo: vendor.logo,
      coverImage: vendor.coverImage,
      phone: vendor.phone,
      whatsapp: vendor.whatsapp,
      email: vendor.email,
      location: vendor.location,
      instagram: vendor.instagram,
      tiktok: vendor.tiktok,
      facebook: vendor.facebook,
      theme: { coverColor: vendor.themeColor },
      visibility: vendor.visibility,
      deliveryEnabled: vendor.deliveryEnabled,
      deliveryFee: vendor.deliveryFee,
      deliveryTimeMin: vendor.deliveryTimeMin,
      rating: vendor.rating,
      reviewCount: vendor.reviewCount,
      followers: vendor.followers,
      verified: vendor.verified,
      createdAt: vendor.createdAt.toISOString(),
    },
    products,
  });
}

/**
 * PATCH /api/stores/:slug — vendor-only edit of their own store.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const user = await requireUser();
    const { slug } = await params;
    const body = await req.json();

    const vendor = await db.vendorProfile.findUnique({ where: { slug } });
    if (!vendor) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }
    if (vendor.userId !== user.id) {
      return NextResponse.json(
        { error: "Only the store owner can edit these settings" },
        { status: 403 },
      );
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const fields = [
      "businessName",
      "description",
      "category",
      "logo",
      "coverImage",
      "phone",
      "whatsapp",
      "email",
      "location",
      "instagram",
      "tiktok",
      "facebook",
      "themeColor",
      "visibility",
      "deliveryEnabled",
      "deliveryFee",
      "deliveryTimeMin",
    ] as const;

    for (const f of fields) {
      if (!(f in body)) continue;
      const val = body[f];
      if (f === "logo" || f === "coverImage") {
        if (
          typeof val === "string" &&
          (val.startsWith("/api/uploads/") ||
            val.startsWith("/uploads/") ||
            val.startsWith("https://") ||
            val === "")
        ) {
          updates[f] = val;
        } else {
          return NextResponse.json(
            { error: `${f} must be a /api/uploads/ URL or an https URL` },
            { status: 400 },
          );
        }
        continue;
      }
      if (f === "visibility" && !["PUBLIC", "LINK_ONLY", "PRIVATE"].includes(val)) {
        return NextResponse.json(
          { error: "Visibility must be PUBLIC, LINK_ONLY, or PRIVATE" },
          { status: 400 },
        );
      }
      if (f === "deliveryEnabled" && typeof val !== "boolean") {
        return NextResponse.json(
          { error: "deliveryEnabled must be true or false" },
          { status: 400 },
        );
      }
      if (
        (f === "deliveryFee" || f === "deliveryTimeMin") &&
        (typeof val !== "number" || val < 0 || !Number.isFinite(val))
      ) {
        return NextResponse.json(
          { error: `${f} must be a non-negative number` },
          { status: 400 },
        );
      }
      updates[f] = val;
    }

    const updated = await db.vendorProfile.update({
      where: { slug },
      data: updates,
    });

    return NextResponse.json({
      vendor: {
        id: updated.id,
        businessName: updated.businessName,
        slug: updated.slug,
        description: updated.description,
        category: updated.category,
        logo: updated.logo,
        coverImage: updated.coverImage,
        phone: updated.phone,
        whatsapp: updated.whatsapp,
        email: updated.email,
        location: updated.location,
        instagram: updated.instagram,
        tiktok: updated.tiktok,
        facebook: updated.facebook,
        theme: { coverColor: updated.themeColor },
        visibility: updated.visibility,
        deliveryEnabled: updated.deliveryEnabled,
        deliveryFee: updated.deliveryFee,
        deliveryTimeMin: updated.deliveryTimeMin,
      },
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error("[stores PATCH] error", err);
    return NextResponse.json(
      { error: err.message || "Failed to update store" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/stores/:slug — tear down the calling user's vendor store.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const user = await requireUser();
    const { slug } = await params;

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    if (body?.confirm !== true) {
      return NextResponse.json(
        { error: "Confirmation required — send { confirm: true } to delete your store." },
        { status: 400 },
      );
    }

    const vendor = await db.vendorProfile.findUnique({ where: { slug } });
    if (!vendor) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }
    if (vendor.userId !== user.id) {
      return NextResponse.json(
        { error: "Only the store owner can delete this store." },
        { status: 403 },
      );
    }

    await db.product.deleteMany({ where: { vendorId: vendor.id } });
    await db.vendorProfile.delete({ where: { id: vendor.id } });

    const caps = parseCapabilities(user.capabilities);
    const remainingCaps = caps.filter((c: any) => c.type !== "VENDOR");
    await db.user.update({
      where: { id: user.id },
      data: { capabilities: serializeCapabilities(remainingCaps) },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error("[stores DELETE] error", err);
    return NextResponse.json(
      { error: err.message || "Failed to delete store" },
      { status: 500 },
    );
  }
}
