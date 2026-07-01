// Assembles the per-domain resolver maps into the single resolvers object.
import { DateScalar, fieldResolvers } from "./shared.js";
import { squadResolvers } from "./squad.js";
import { standupResolvers } from "./standup.js";
import { confluenceResolvers } from "./confluence.js";
import { tarotResolvers } from "./tarot.js";
import { adminResolvers } from "./admin.js";
import { velocityResolvers } from "./velocity.js";
import { fortuneResolvers } from "./fortune.js";

type Map = Record<string, any>;

// Shallow-merge per top-level key (Query/Mutation/Subscription/type maps).
function mergeMaps(...parts: Map[]): Map {
  const out: Map = {};
  for (const part of parts) {
    for (const key of Object.keys(part)) {
      out[key] = { ...(out[key] ?? {}), ...part[key] };
    }
  }
  return out;
}

export const resolvers = {
  Date: DateScalar,
  ...mergeMaps(squadResolvers, standupResolvers, confluenceResolvers, tarotResolvers, adminResolvers, velocityResolvers, fortuneResolvers, fieldResolvers),
};
