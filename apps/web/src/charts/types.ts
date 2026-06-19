/**
 * Local, typed mirror of the Charts GraphQL read shapes.
 *
 * These intentionally duplicate the server `Chart` GraphQL type (see
 * `apps/api/src/graphql/charts.ts`) instead of importing server internals: the
 * web app must not depend on the api package's source, and the read surface only
 * needs the query field set. Optional fields use `| undefined` (not `?`) so they
 * are explicit under `exactOptionalPropertyTypes`.
 */
export interface Chart {
  readonly arrangementRef: string | null;
  readonly chartId: string;
  readonly chordProSource: string;
  readonly createdAt: string;
  readonly defaultKey: string;
  readonly songRef: string;
  readonly tenantId: string;
  readonly title: string | null;
  readonly updatedAt: string;
}

/**
 * Discriminated state for a Charts read view. Components render off this union
 * so loading, error, empty, and populated states are all type-checked.
 */
export type ChartsLoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "loaded"; readonly charts: readonly Chart[] };

export type ChartDetailState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "missing" }
  | { readonly status: "loaded"; readonly chart: Chart };
