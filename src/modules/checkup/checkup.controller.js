import prisma from '../../lib/prisma.js';
import { uploadToS3, deleteFromS3 } from "../../config/s3.js";

/** Packages are never hard-deleted once used — they are archived (status = "archived"). */
export const ARCHIVED_STATUS = "archived";

/* Audit helpers — write to AuditLog when that model exists (NABL build); otherwise
   fall back to a console line, so this file runs on both code lines unchanged. */
const actorFromReq = (req) => ({
  userId: req.user?.id ?? req.user?.userId ?? null,
  ipAddress:
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null,
});
const logAudit = async (entry, tx = prisma) => {
  if (typeof tx?.auditLog?.create === "function") {
    return tx.auditLog.create({
      data: {
        entity: entry.entity,
        entityId: String(entry.entityId),
        action: entry.action,
        oldValue: entry.oldValue ?? undefined,
        newValue: entry.newValue ?? undefined,
        reason: entry.reason ?? null,
        userId: entry.userId ?? null,
        ipAddress: entry.ipAddress ?? null,
      },
    });
  }
  console.info("[audit:HealthPackage]", JSON.stringify({ ...entry, at: new Date().toISOString() }));
  return null;
};


/* -------------------------------------------
   🔵 Helper: Parse selected tests safely
-------------------------------------------- */
function parseTestIds(value) {
  if (!value) return [];

  // Case 1: Already array
  if (Array.isArray(value)) {
    return value.map((id) => Number(id));
  }

  // Case 2: String input
  if (typeof value === "string") {
    // "6,7,8"
    if (value.includes(",")) {
      return value.split(",").map((id) => Number(id.trim()));
    }

    // "[6,7,8]"
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(Number) : [];
    } catch {
      // "6"
      return [Number(value)];
    }
  }

  return [];
}


const calculateOfferPrice = (actual, discount, offerPrice) => {
  if (offerPrice) return parseFloat(offerPrice); // Manual overrides
  if (discount && discount > 0) return actual - (actual * discount) / 100;
  return actual;
};

const roundLabPrice = (price) => {
  const amt = parseFloat(price);
  if (isNaN(amt) || amt <= 0) return 0;
  return Math.round(amt / 50) * 50;
};

/* -------------------------------------------
   🟢 CREATE HEALTH PACKAGE
-------------------------------------------- */
export const addHealthPackage = async (req, res) => {
  try {
    const {
      name,
      description,
      actualPrice,
      discount,
      offerPrice,
      showIn,
      selectedTests,
      reportWithin,
      reportUnit,
      noOfParameter,
      categoryId,
      alsoKnowAs,
      spotlight,
      features,
      preparations,
      sampleRequired,
      sortOrder,
    } = req.body;

    if (!name || !actualPrice) {
      return res.status(400).json({ error: "Name and actualPrice are required" });
    }

    // Optional image upload
    let imgUrl = req.file ? await uploadToS3(req.file, "health-packages") : null;

    const actual = Number(actualPrice);
    const disc = discount ? Number(discount) : 0;

    // ⭐ Calculate and round final offer price
    const rawOffer = calculateOfferPrice(actual, disc, offerPrice);
    const finalOfferPrice = roundLabPrice(rawOffer);


    let finalSpotlight = false;
    if (spotlight !== undefined) {
      if (typeof spotlight === "boolean") {
        finalSpotlight = spotlight;
      } else if (typeof spotlight === "string") {
        finalSpotlight = spotlight === "true";
      }
    }
    const healthPackage = await prisma.healthPackage.create({
      data: {
        name,
            // createdById: req.user.id,
        description,
        imgUrl,
        actualPrice: actual,
        offerPrice: Number(offerPrice),
        discount: disc,
        showIn,
        reportWithin: Number(reportWithin),
        reportUnit,
        noOfParameter,
        categoryId: categoryId ? Number(categoryId) : null,
        alsoKnowAs,
           spotlight: finalSpotlight,
           features,
           preparations,
           sampleRequired,
           sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0, // ✅ NEW
      }
    });

    // Link tests
    const testIds = parseTestIds(selectedTests);
    if (testIds.length > 0) {
      await prisma.checkupPackage.createMany({
        data: testIds.map((tid) => ({
          checkupId: healthPackage.id,
          testId: tid
        }))
      });
    }

    const result = await prisma.healthPackage.findUnique({
      where: { id: healthPackage.id },
      include: { checkupPackages: { include: { test: true } } }
    });

    res.status(201).json(result);

  } catch (error) {
    console.error("Error creating health package:", error);
    res.status(500).json({ error: "Failed to create health package" });
  }
};



/* -------------------------------------------
   🟠 UPDATE HEALTH PACKAGE (SMART VERSION)
-------------------------------------------- */
export const updateHealthPackage = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      description,
      actualPrice,
      discount,
      offerPrice,
      showIn,
      selectedTests,
      reportWithin,
      reportUnit,
      spotlight,
      categoryId,
      alsoKnowAs,
      features,
      preparations,
      sampleRequired,
       sortOrder,
    } = req.body;

   

    // Fetch existing package
    const existing = await prisma.healthPackage.findUnique({
      where: { id: Number(id) }
    });

    if (!existing) {
      return res.status(404).json({ error: "HealthPackage not found" });
    }

    /* -------------------------------------------
       IMAGE REPLACEMENT
    -------------------------------------------- */
    let imgUrl = existing.imgUrl;

    console.log("req.file",req.file)

    if (req.file) {
      if (imgUrl) await deleteFromS3(imgUrl); // delete old image
      imgUrl = await uploadToS3(req.file, "health-packages");
    }

    /* -------------------------------------------
       PRICE CALCULATION
    -------------------------------------------- */
    const actual = actualPrice ? Number(actualPrice) : existing.actualPrice;
    const disc = discount ? Number(discount) : existing.discount;

    const rawOffer = calculateOfferPrice(actual, disc, offerPrice);
    const finalOfferPrice = roundLabPrice(rawOffer);

    /* -------------------------------------------
       UPDATE PACKAGE DATA
    -------------------------------------------- */
// --- SPOTLIGHT NORMALIZATION ---
let finalSpotlight = existing.spotlight;

if (spotlight !== undefined) {
  if (typeof spotlight === "boolean") {
    finalSpotlight = spotlight;
  } else if (typeof spotlight === "string") {
    finalSpotlight = spotlight === "true";
  }
}


    const updated = await prisma.healthPackage.update({
      where: { id: Number(id) },
      data: {
        name: name ?? existing.name,
        description: description ?? existing.description,
        imgUrl,
        actualPrice: actual,
        discount: disc,
        offerPrice: Number(offerPrice),
        showIn: showIn ?? existing.showIn,
        reportWithin: reportWithin
          ? Number(reportWithin)
          : existing.reportWithin,
        reportUnit: reportUnit ?? existing.reportUnit,
        
        categoryId: categoryId ? Number(categoryId) : existing.categoryId,
        alsoKnowAs:alsoKnowAs ?? existing.alsoKnowAs,
        spotlight: finalSpotlight,
        features:features,
        preparations :preparations,
        sampleRequired :sampleRequired,
          sortOrder:
          sortOrder !== undefined ? Number(sortOrder) : existing.sortOrder ?? 0, // ✅ NEW

      }
    });

    /* -------------------------------------------
       ⭐ SMART SYNC TEST RELATIONS
    -------------------------------------------- */
    if (selectedTests !== undefined) {
      const newTestIds = parseTestIds(selectedTests);

      // Get old test relations
      const existingTests = await prisma.checkupPackage.findMany({
        where: { checkupId: Number(id) },
        select: { testId: true }
      });

      const oldTestIds = existingTests.map(t => t.testId);

      // To delete: in old, not in new
      const testsToDelete = oldTestIds.filter(id => !newTestIds.includes(id));

      // To add: in new, not in old
      const testsToAdd = newTestIds.filter(id => !oldTestIds.includes(id));

      // Remove unwanted tests
      if (testsToDelete.length > 0) {
        await prisma.checkupPackage.deleteMany({
          where: {
            checkupId: Number(id),
            testId: { in: testsToDelete }
          }
        });
      }

      // Add new tests
      if (testsToAdd.length > 0) {
        await prisma.checkupPackage.createMany({
          data: testsToAdd.map(tid => ({
            checkupId: Number(id),
            testId: tid
          }))
        });
      }
    }

    /* -------------------------------------------
       FETCH FULL UPDATED PACKAGE
    -------------------------------------------- */
    const fullData = await prisma.healthPackage.findUnique({
      where: { id: updated.id },
      include: { checkupPackages: { include: { test: true } } }
    });

    return res.json(fullData);

  } catch (error) {
    console.error("Error updating health package:", error);
    return res.status(500).json({ error: "Failed to update health package" });
  }
};


/* -------------------------------------------
   🟡 GET ALL PACKAGES (SEARCH + PAGINATION)
-------------------------------------------- */
export const getAllHealthPackages = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 10 } = req.query;

    const currentPage = Number(page) || 1;
    const pageSize = Number(limit) || 10;

   const searchText = String(search || "").trim();

const showArchived = String(req.query.includeArchived ?? "") === "true"; // admin panel only

const whereCondition = {
  // Archived packages stay in the DB (historical bills/bookings point at them)
  // but are hidden from the app and from new-order selection.
  ...(showArchived ? {} : { NOT: { status: ARCHIVED_STATUS } }),
  ...(searchText
    ? {
        OR: [
          { name: { contains: searchText, mode: "insensitive" } },
          { alsoKnowAs: { contains: searchText, mode: "insensitive" } },
          {
            category: {
              is: {
                name: { contains: searchText, mode: "insensitive" },
              },
            },
          },
        ],
      }
    : {}),
};
    /* -------------------------------------------
       1️⃣ COUNT TOTAL RESULTS
    -------------------------------------------- */
    const totalCount = await prisma.healthPackage.count({
      where: whereCondition,
    });

    const totalPages = Math.ceil(totalCount / pageSize);

    /* -------------------------------------------
       2️⃣ FETCH PAGINATED DATA
    -------------------------------------------- */
    const rawData = await prisma.healthPackage.findMany({
      where: whereCondition,
      skip: (currentPage - 1) * pageSize,
      take: pageSize,

      include: {
        category: { select: { id: true, name: true } },

        checkupPackages: {
          include: {
            test: {
              include: {
                _count: { select: { parameters: true } },
              },
            },
          },
        },
      },

      orderBy: { id: "desc" }, // Latest first
    });

    /* -------------------------------------------
       3️⃣ FORMAT RESPONSE DATA
    -------------------------------------------- */
    const data = rawData.map((pkg) => {
      const tests = pkg.checkupPackages.map((cp) => ({
        id: cp.test.id,
        name: cp.test.name,
        parametersCount: cp.test._count.parameters,
      }));

      const totalParameters = tests.reduce(
        (sum, t) => sum + t.parametersCount,
        0
      );

      return {
        id: pkg.id,
        name: pkg.name,
        status: pkg.status,
        imgUrl: pkg.imgUrl,
        description: pkg.description,
        actualPrice: pkg.actualPrice,
        offerPrice: pkg.offerPrice,
        reportWithin: pkg.reportWithin,
        reportUnit: pkg.reportUnit,
        discount: pkg.discount,
        categoryId:pkg.categoryId,
        category: pkg.category,
        alsoKnowAs:pkg.alsoKnowAs,
        preparations:pkg.preparations,
        sampleRequired:pkg.sampleRequired,
        spotlight: pkg.spotlight,
         features:pkg.features,
        testType:"PATHOLOGY",
        tests,
        testCount: tests.length,
        parameterCount: totalParameters,
        features:pkg.features
      };
    });

    /* -------------------------------------------
       4️⃣ SEND PAGINATED RESPONSE
    -------------------------------------------- */
    return res.json({
      success: true,
      pagination: {
        total: totalCount,
        page: currentPage,
        limit: pageSize,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
      },
      data,
    });

  } catch (error) {
    console.error("Error fetching packages:", error);
    return res.status(500).json({ error: "Failed to fetch health packages" });
  }
};

export const getSpotlightHealthPackages = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 10 } = req.query;

    const currentPage = Number(page) || 1;
    const pageSize = Number(limit) || 10;

    /* -------------------------------------------
       WHERE CONDITION (SPOTLIGHT + SEARCH)
    -------------------------------------------- */
    const whereCondition = {
      spotlight: true, // ⭐ ONLY SPOTLIGHT PACKAGES
      NOT: { status: ARCHIVED_STATUS },
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { category: { name: { contains: search, mode: "insensitive" } } }
        ]
      })
    };

    /* -------------------------------------------
       1️⃣ COUNT TOTAL RESULTS
    -------------------------------------------- */
    const totalCount = await prisma.healthPackage.count({
      where: whereCondition
    });

    const totalPages = Math.ceil(totalCount / pageSize);

    /* -------------------------------------------
       2️⃣ FETCH DATA
    -------------------------------------------- */
    const rawData = await prisma.healthPackage.findMany({
      where: whereCondition,
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      orderBy: { id: "desc" },

      include: {
        category: { select: { id: true, name: true,imgUrl:true } },
        checkupPackages: {
          include: {
            test: {
              include: {
                _count: { select: { parameters: true } }
              }
            }
          }
        }
      }
    });

    /* -------------------------------------------
       3️⃣ FORMAT RESPONSE
    -------------------------------------------- */
    const data = rawData.map((pkg) => {
      const tests = pkg.checkupPackages.map((cp) => ({
        id: cp.test.id,
        name: cp.test.name,
        parametersCount: cp.test._count.parameters
      }));

      const totalParameters = tests.reduce(
        (sum, t) => sum + t.parametersCount,
        0
      );

      return {
        id: pkg.id,
        name: pkg.name,
        imgUrl: pkg.imgUrl,
        description: pkg.description,
        actualPrice: pkg.actualPrice,
        offerPrice: pkg.offerPrice,
        discount: pkg.discount,
        reportWithin: pkg.reportWithin,
        reportUnit: pkg.reportUnit,
        categoryId: pkg.categoryId,
        category: pkg.category,
        alsoKnowAs: pkg.alsoKnowAs,
        spotlight: true,
        testType: "PATHOLOGY",
        tests,
        testCount: tests.length,
        parameterCount: totalParameters
      };
    });

    /* -------------------------------------------
       4️⃣ RESPONSE
    -------------------------------------------- */
    return res.json({
      success: true,
      pagination: {
        total: totalCount,
        page: currentPage,
        limit: pageSize,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1
      },
      data
    });

  } catch (error) {
    console.error("Error fetching spotlight packages:", error);
    return res.status(500).json({ error: "Failed to fetch spotlight packages" });
  }
};


/* --------------------------------------------
   GET HEALTH PACKAGES BY CATEGORY
--------------------------------------------- */
export const getHealthPackagesByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { search = "", page = 1, limit = 100 } = req.query;

    const catId = Number(categoryId);
    const currentPage = Math.max(1, Number(page) || 1);
    const pageSize = Math.max(1, Number(limit) || 10);
    const searchText = (search || "").trim();

    if (!catId) {
      return res.status(400).json({ error: "Valid Category ID is required" });
    }

    // ✅ Fetch category ONCE (returned at top-level)
    const category = await prisma.category.findUnique({
      where: { id: catId },
      select: { id: true, name: true, bannerUrl: true },
    });

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    /* -------------------------------------------
       1️⃣ WHERE CONDITION (category + search)
    -------------------------------------------- */
    const whereCondition = {
      categoryId: catId,
      NOT: { status: ARCHIVED_STATUS },
      ...(searchText
        ? {
            OR: [
              { name: { contains: searchText, mode: "insensitive" } },
              // ✅ relation filter safe for optional/required category relation
              {
                category: {
                  is: { name: { contains: searchText, mode: "insensitive" } },
                },
              },
            ],
          }
        : {}),
    };

    /* -------------------------------------------
       2️⃣ COUNT TOTAL PACKAGES
    -------------------------------------------- */
    const totalCount = await prisma.healthPackage.count({
      where: whereCondition,
    });

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    /* -------------------------------------------
       3️⃣ FETCH DATA (✅ no category include to avoid repeating)
    -------------------------------------------- */
    const rawData = await prisma.healthPackage.findMany({
      where: whereCondition,
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      include: {
        checkupPackages: {
          include: {
            test: {
              include: {
                _count: { select: { parameters: true } },
              },
            },
          },
        },
      },
      orderBy: { id: "desc" },
    });

    /* -------------------------------------------
       4️⃣ FORMAT RESPONSE (✅ category NOT repeated per item)
    -------------------------------------------- */
    const data = rawData.map((pkg) => {
      const tests = pkg.checkupPackages.map((cp) => ({
        id: cp.test.id,
        name: cp.test.name,
        parametersCount: cp.test._count.parameters,
      }));

      const totalParameters = tests.reduce(
        (sum, t) => sum + t.parametersCount,
        0
      );

      return {
        id: pkg.id,
        name: pkg.name,
        imgUrl: pkg.imgUrl,
        description: pkg.description,
        actualPrice: pkg.actualPrice,
        offerPrice: pkg.offerPrice,
        reportWithin: pkg.reportWithin,
        reportUnit: pkg.reportUnit,
        discount: pkg.discount,
        categoryId: pkg.categoryId, // ✅ keep only id (optional)
        testType: "PATHOLOGY",
        tests,
        testCount: tests.length,
        parameterCount: totalParameters,
      };
    });

    /* -------------------------------------------
       5️⃣ SEND RESPONSE
    -------------------------------------------- */
    return res.json({
      success: true,
      pagination: {
        total: totalCount,
        page: currentPage,
        limit: pageSize,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
      },
      category, // ✅ returned ONCE
      data,
    });
  } catch (error) {
    console.error("Error fetching category packages:", error);
    return res.status(500).json({ error: "Failed to fetch category packages" });
  }
};




export const getHealthPackageById = async (req, res) => {
  try {
    const { id } = req.params;

    const rawData = await prisma.healthPackage.findUnique({
      where: { id: Number(id) },
      include: {
        category: { select: { id: true, name: true } },
        checkupPackages: {
          include: {
            test: {
              include: {
                parameters: {
                  select: {
                    id: true,
                    name: true,
                    unit: true,
                    notes: true,
                    type: true,
                    order: true
                  }
                },
                _count: {
                  select: { parameters: true }
                }
              }
            }
          }
        }
      }
    });

    if (!rawData) {
      return res.status(404).json({ error: "HealthPackage not found" });
    }

    const tests = rawData.checkupPackages.map((cp) => ({
      id: cp.test.id,
      name: cp.test.name,
      parametersCount: cp.test._count.parameters,
      parameters: cp.test.parameters || []
    }));

    const totalParameters = tests.reduce(
      (sum, t) => sum + t.parametersCount,
      0
    );

    const finalData = {
      id: rawData.id,
      name: rawData.name,
      description: rawData.description,
      actualPrice: rawData.actualPrice,
      imgUrl: rawData.imgUrl,
      discount: rawData.discount,
      offerPrice: rawData.offerPrice,
      testType: "PATHOLOGY",
      category: rawData.category,
      tests,
      testCount: tests.length,
      parameterCount: totalParameters,
    
        reportWithin: rawData.reportWithin,
        reportUnit: rawData.reportUnit,
        discount: rawData.discount,
        categoryId:rawData.categoryId,
        
        alsoKnowAs:rawData.alsoKnowAs,
        preparations:rawData.preparations,
        sampleRequired:rawData.sampleRequired,
        spotlight: rawData.spotlight,
         features:rawData.features,
      
      
      
    };

    return res.json({
      success: true,
      data: finalData
    });

  } catch (error) {
    console.error("Error fetching health package:", error);
    return res.status(500).json({ error: "Failed to fetch health package" });
  }
};



/* -------------------------------------------
   🔴 DELETE PACKAGE  →  ARCHIVE (soft delete)

   A package that has ever been billed / booked must NOT be hard-deleted:
   OrderMemberPackage.packageId, OrderCheckup.checkupId, CartItem.packageId
   and CheckupPackage all point at it, and the FK actions (SET NULL / CASCADE
   / explicit deleteMany) would orphan or wipe historical bills & bookings.

   DELETE /checkups/:id now:
     • sets status = "archived" (hidden from app, spotlight, category lists
       and new-order selection; still visible in admin with ?includeArchived=true)
     • keeps the image and the CheckupPackage test composition (needed for
       result entry / reports of existing orders)
     • writes an append-only AuditLog entry
   Hard delete is only possible with ?force=true AND when no order/booking
   has ever referenced the package.
-------------------------------------------- */
const countPackageUsage = async (packageId) => {
  const [orderLines, orderCheckups, cartItems] = await Promise.all([
    prisma.orderMemberPackage.count({ where: { packageId } }),
    prisma.orderCheckup.count({ where: { checkupId: packageId } }),
    prisma.cartItem.count({ where: { packageId } }),
  ]);
  return { orderLines, orderCheckups, cartItems, total: orderLines + orderCheckups + cartItems };
};

export const deleteHealthPackage = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const force = String(req.query.force ?? "") === "true";
    const { userId, ipAddress } = actorFromReq(req);

    const pkg = await prisma.healthPackage.findUnique({ where: { id } });
    if (!pkg) {
      return res.status(404).json({ error: "HealthPackage not found" });
    }

    const usage = await countPackageUsage(id);

    /* ── Hard delete: explicit ?force=true and zero order/booking references ── */
    if (force) {
      if (usage.orderLines + usage.orderCheckups > 0) {
        return res.status(409).json({
          error: `This package is used in ${usage.orderLines + usage.orderCheckups} order(s)/booking(s) and cannot be permanently deleted. Archive it instead.`,
          code: "PACKAGE_IN_USE",
          usage,
        });
      }
      await prisma.$transaction(async (tx) => {
        await tx.checkupPackage.deleteMany({ where: { checkupId: id } });
        await tx.healthPackage.delete({ where: { id } });
        await logAudit(
          { entity: "HealthPackage", entityId: id, action: "DELETE", oldValue: pkg, reason: "force delete — no order references", userId, ipAddress },
          tx
        );
      });
      if (pkg.imgUrl) {
        try { await deleteFromS3(pkg.imgUrl); } catch (e) { console.warn("S3 delete failed (ignored):", e?.message || e); }
      }
      return res.json({ message: "HealthPackage permanently deleted (no orders referenced it)", deleted: true });
    }

    /* ── Default: archive ── */
    if (pkg.status === ARCHIVED_STATUS) {
      return res.json({ message: "HealthPackage is already archived", archived: true, usage });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.healthPackage.update({
        where: { id },
        data: { status: ARCHIVED_STATUS, spotlight: false },
      });
      await logAudit(
        {
          entity: "HealthPackage",
          entityId: id,
          action: "ARCHIVE",
          oldValue: { status: pkg.status, spotlight: pkg.spotlight },
          newValue: { status: ARCHIVED_STATUS, spotlight: false },
          reason: req.body?.reason ?? null,
          userId,
          ipAddress,
        },
        tx
      );
      return u;
    });

    return res.json({
      message: "HealthPackage archived. It is hidden from the app and new orders; existing bills, bookings and patient records are untouched.",
      archived: true,
      usage,
      data: updated,
    });
  } catch (error) {
    console.error("Error archiving health package:", error);
    if (error?.code === "P2003") {
      return res.status(409).json({
        error: "This package is referenced by orders/bookings and cannot be deleted. Archive it instead.",
        code: "PACKAGE_IN_USE",
      });
    }
    res.status(500).json({ error: "Failed to archive health package" });
  }
};

/* -------------------------------------------
   🟢 RESTORE (un-archive) PACKAGE
-------------------------------------------- */
export const restoreHealthPackage = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { userId, ipAddress } = actorFromReq(req);

    const pkg = await prisma.healthPackage.findUnique({ where: { id } });
    if (!pkg) return res.status(404).json({ error: "HealthPackage not found" });
    if (pkg.status !== ARCHIVED_STATUS) {
      return res.json({ message: "HealthPackage is not archived", data: pkg });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.healthPackage.update({ where: { id }, data: { status: "active" } });
      await logAudit(
        { entity: "HealthPackage", entityId: id, action: "RESTORE", oldValue: { status: pkg.status }, newValue: { status: "active" }, userId, ipAddress },
        tx
      );
      return u;
    });

    return res.json({ message: "HealthPackage restored", data: updated });
  } catch (error) {
    console.error("Error restoring health package:", error);
    res.status(500).json({ error: "Failed to restore health package" });
  }
};
