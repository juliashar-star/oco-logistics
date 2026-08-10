import type { MetadataRoute } from "next";

/**
 * /robots.txt, governed by the SAME flag as the landing itself.
 *
 * ENABLE_PUBLIC_LANDING is therefore one switch with two effects: it is the
 * publication event AND the indexability switch. They must not be able to drift
 * apart — a site that redirects «/» to /login while inviting crawlers, or a
 * landing that is live but permanently unindexable, are both states nobody
 * would choose deliberately.
 *
 * `force-dynamic` because the flag is read at REQUEST time. Route handlers are
 * evaluated at build by default, which would bake the flag's build-time value
 * into robots.txt and leave a rebuild as the only way to change indexability —
 * exactly the drift this file exists to prevent.
 */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const landingIsPublic = process.env.ENABLE_PUBLIC_LANDING === "true";

  if (!landingIsPublic) {
    // «/» redirects to /login in this state, so there is nothing public to
    // index and nothing to gain from letting a crawler discover the cabinet.
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The authenticated areas, mirroring middleware's PROTECTED_PREFIXES,
      // plus the API. They redirect or 401 rather than render, so indexing them
      // yields nothing but noise.
      disallow: ["/api/", "/dashboard", "/new-order", "/shipments"],
    },
  };
}
