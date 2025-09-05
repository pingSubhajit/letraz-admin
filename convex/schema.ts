import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Define the Department enum
export const DepartmentEnum = v.union(
  v.literal("Core Team"),
  v.literal("Marketing Team")
);

export default defineSchema({
  teamMembers: defineTable({
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    department: DepartmentEnum,
    joiningDate: v.string(), // ISO date string
    photo: v.optional(v.string()), // Storage ID or URL to the photo
    bio: v.optional(v.string()),
    position: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_department", ["department"])
    .index("by_email", ["email"])
    .index("by_active", ["isActive"])
    .index("by_joining_date", ["joiningDate"]),
  apiTokens: defineTable({
    tokenHash: v.string(),
    label: v.string(),
    createdByUserId: v.string(),
    createdByUserEmail: v.optional(v.string()),
    createdByUserName: v.optional(v.string()),
    createdAt: v.string(),
    lastUsedAt: v.optional(v.string()),
    isActive: v.boolean(),
  })
    .index("by_active", ["isActive"]) 
    .index("by_tokenHash", ["tokenHash"]) 
    .index("by_createdByUserId", ["createdByUserId"]),
});
