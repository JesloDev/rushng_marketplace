import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { checkCapability, suspendedMessage, pendingVerificationMessage } from "@/lib/capability";
import { safeJsonParse } from "@/lib/safe-json";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const category = url.searchParams.get("category");
    const query = url.searchParams.get("q");
    const vendorId = url.searchParams.get("vendorId");

    // Check if the caller is logged in to allow vendors to see their own items
    let currentUser: { id: string } | null = null;
    try {
      currentUser = await requireUser();
    } catch {
      currentUser = null;
    }

    // Determine if the caller owns the vendor store being explicitly queried
    let isSpecificOwner = false;
    if (vendorId && currentUser) {
      const vendorCheck = await db.vendorProfile.findUnique({
        where: { id: vendorId },
        select: { userId: true },
      });
      if (vendorCheck && vendorCheck.userId === currentUser.id) {
        isSpecificOwner = true;
      }
    }

    const products = await db.product.findMany({
      where: {
        ...(category && category !== "All" ? { category } : {}),
        ...(vendorId ? { vendorId } : {}),
        ...(query ? { name: { contains: query, mode: "insensitive" } } : {}),
        // Exclude products from PRIVATE or non-public vendors unless the owner is viewing their own store
        ...(!isSpecificOwner
          ? {
              vendor: {
                visibility: "PUBLIC",
              },
            }
          : {}),
      },
      include: {
        vendor: {
          select: {
            id: true,
            businessName: true,
            slug: true,
            location: true,
            visibility: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Transform to UI shape with safe fallbacks
    const transformed = products.map((p) => ({
      id: p.id,
      vendorId: p.vendorId,
      vendorName: p.vendor?.businessName ?? "Unknown Store",
      vendorSlug: p.vendor?.slug ?? "",
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

    return NextResponse.json({ products: transformed });
  } catch (err: any) {
    console.error("[products GET] error", err?.message ?? err);
    return NextResponse.json(
      { error: "Failed to load products", details: err?.message },
      { status: 500 },
    );
  }
}

// POST /api/products — vendor creates a product under their own store.
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const vendorProfile = (user as any).vendorProfile;
    if (!vendorProfile) {
      return NextResponse.json(
        { error: "You need a vendor store before you can add products." },
        { status: 403 },
      );
    }

    const vendorCap = checkCapability(user, "VENDOR");
    if (!vendorCap.hasCapability) {
      return NextResponse.json(
        { error: "You need a vendor store before you can add products." },
        { status: 403 },
      );
    }
    if (vendorCap.status === "SUSPENDED") {
      return NextResponse.json({ error: suspendedMessage("VENDOR") }, { status: 403 });
    }
    if (vendorCap.status === "PENDING_VERIFICATION") {
      return NextResponse.json({ error: pendingVerificationMessage("VENDOR") }, { status: 403 });
    }

    const body = await req.json();
    const { name, description, price, compareAtPrice, images, category, condition, stock, location, tags } = body;

    if (!name || !description || price === undefined || price === null || !category) {
      return NextResponse.json(
        { error: "Name, description, price, and category are required." },
        { status: 400 },
      );
    }
    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return NextResponse.json({ error: "Price must be a valid non-negative number." }, { status: 400 });
    }
    const imageList: string[] = Array.isArray(images) ? images.filter(Boolean) : [];
    if (imageList.length === 0) {
      return NextResponse.json({ error: "Add at least one product photo." }, { status: 400 });
    }

    for (const url of imageList) {
      if (typeof url !== "string" || (!url.startsWith("/api/uploads/") && !url.startsWith("/uploads/") && !url.startsWith("https://"))) {
        return NextResponse.json(
          { error: "Image URLs must be /api/uploads/ paths or https:// URLs." },
          { status: 400 },
        );
      }
    }

    const product = await db.product.create({
      data: {
        vendorId: vendorProfile.id,
        name,
        description,
        price: parsedPrice,
        compareAtPrice: compareAtPrice !== undefined && compareAtPrice !== null && compareAtPrice !== ""
          ? Number(compareAtPrice)
          : null,
        images: JSON.stringify(imageList),
        category,
        condition: condition || null,
        stock: stock !== undefined && stock !== null && stock !== "" ? Math.max(0, parseInt(stock, 10) || 0) : 1,
        location: location || vendorProfile.location,
        tags: JSON.stringify(Array.isArray(tags) ? tags : []),
      },
    });

    return NextResponse.json({
      product: {
        ...product,
        images: JSON.parse(product.images),
        tags: JSON.parse(product.tags),
        vendorName: vendorProfile.businessName,
        vendorSlug: vendorProfile.slug,
      },
    });
  } catch (err: any) {
    if (err instanceof Response) throw err;
    console.error("[products POST] error", err);
    return NextResponse.json({ error: err.message || "Failed to create product" }, { status: 500 });
  }
}
