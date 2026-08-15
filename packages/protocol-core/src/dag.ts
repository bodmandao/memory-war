/**
 * The justification / supersession graph.
 *
 * Spec §10: "Do NOT merge these into one generic 'parent' relationship.
 * The system must distinguish 'this claim is supported by X' from
 * 'this claim replaced/refined/contradicted Y.'"
 *
 * Two structurally distinct edge kinds live here:
 *
 *  - JUSTIFIES   (Evidence -> Claim, Claim -> Claim as support)
 *  - a directed RelationshipType edge (REFINES/NARROWS/EXTENDS/SUPERSEDES,
 *    all directed and DAG-constrained; CONTRADICTS/RELATES_TO are
 *    symmetric-ish labels between two claims and are NOT subject to the
 *    acyclic constraint, since "A relates to B" and "B relates to A" are
 *    the same fact, not a cycle in the CS sense.)
 *
 * Cycle rejection directly answers the "circular evidence" and
 * "recursive investigation" attacks named in the kill-test threat model.
 */
import type { Hash, RelationshipType } from "./types.js";

export type EdgeKind = "JUSTIFIES" | RelationshipType;

const DAG_CONSTRAINED: ReadonlySet<EdgeKind> = new Set([
  "JUSTIFIES",
  "REFINES",
  "NARROWS",
  "EXTENDS",
  "SUPERSEDES",
]);

export interface Edge {
  from: Hash; // the source object (Evidence.id or Claim.id)
  to: Hash; // the target object (always a Claim.id in this protocol)
  kind: EdgeKind;
}

export class CycleError extends Error {
  constructor(public readonly path: Hash[]) {
    super(`Cycle detected: ${path.join(" -> ")}`);
    this.name = "CycleError";
  }
}

export class JustificationGraph {
  private edges: Edge[] = [];
  private adjacency = new Map<Hash, Set<Hash>>();

  /** Immutable, append-only view for audit / tests. */
  get all(): ReadonlyArray<Edge> {
    return this.edges;
  }

  /**
   * Adds an edge. For DAG-constrained kinds, rejects the edge (throws
   * CycleError) if it would create a cycle in the *combined* directed
   * graph of all DAG-constrained kinds — a claim must not, even
   * indirectly and even across justification and supersession edges
   * together, end up depending on itself.
   */
  addEdge(edge: Edge): void {
    if (edge.from === edge.to) throw new CycleError([edge.from, edge.to]);

    if (DAG_CONSTRAINED.has(edge.kind)) {
      const path = this.findPath(edge.to, edge.from);
      if (path) throw new CycleError([...path, edge.to]);
    }

    this.edges.push(edge);
    const set = this.adjacency.get(edge.from) ?? new Set<Hash>();
    set.add(edge.to);
    this.adjacency.set(edge.from, set);
  }

  /** DFS: does a directed path already exist from `start` to `target`? */
  private findPath(start: Hash, target: Hash): Hash[] | null {
    const visited = new Set<Hash>();
    const stack: Array<{ node: Hash; path: Hash[] }> = [{ node: start, path: [start] }];
    while (stack.length > 0) {
      const { node, path } = stack.pop()!;
      if (node === target) return path;
      if (visited.has(node)) continue;
      visited.add(node);
      for (const next of this.adjacency.get(node) ?? []) {
        stack.push({ node: next, path: [...path, next] });
      }
    }
    return null;
  }

  supportersOf(claimId: Hash): Hash[] {
    return this.edges.filter((e) => e.to === claimId && e.kind === "JUSTIFIES").map((e) => e.from);
  }

  relationshipsOf(claimId: Hash): Edge[] {
    return this.edges.filter((e) => (e.from === claimId || e.to === claimId) && e.kind !== "JUSTIFIES");
  }

  /** Walk the SUPERSEDES chain forward from a claim to its current successor, if any. */
  successorChain(claimId: Hash): Hash[] {
    const chain: Hash[] = [];
    let current = claimId;
    const guard = new Set<Hash>([current]);
    for (;;) {
      const next = this.edges.find((e) => e.from === current && e.kind === "SUPERSEDES")?.to;
      if (!next || guard.has(next)) break;
      chain.push(next);
      guard.add(next);
      current = next;
    }
    return chain;
  }
}
